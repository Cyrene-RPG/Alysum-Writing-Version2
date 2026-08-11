/**
 * Mint a LiveKit access token for Word War voice rooms.
 * Env: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
 * Optional: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (membership check)
 */
const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");
const { SUPABASE_URL, SUPABASE_KEY } = require("../lib/seo-public.js");

function base64url(input) {
    return Buffer.from(input)
        .toString("base64")
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
}

function signLiveKitJwt({ apiKey, apiSecret, identity, name, roomName, ttlSec = 60 * 60 * 6 }) {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "HS256", typ: "JWT" };
    const payload = {
        iss: apiKey,
        sub: identity,
        name: name || identity,
        nbf: now - 10,
        exp: now + ttlSec,
        video: {
            roomJoin: true,
            room: roomName,
            canPublish: true,
            canSubscribe: true,
            canPublishData: true,
        },
    };
    const encodedHeader = base64url(JSON.stringify(header));
    const encodedPayload = base64url(JSON.stringify(payload));
    const data = `${encodedHeader}.${encodedPayload}`;
    const signature = crypto
        .createHmac("sha256", apiSecret)
        .update(data)
        .digest("base64")
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
    return `${data}.${signature}`;
}

function createUserClient(accessToken) {
    const url = String(process.env.SUPABASE_URL || SUPABASE_URL || "").trim();
    const key = String(process.env.SUPABASE_ANON_KEY || SUPABASE_KEY || "").trim();
    if (!url || !key || !accessToken) return null;
    return createClient(url, key, {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
        auth: { persistSession: false, autoRefreshToken: false },
    });
}

function createServiceClient() {
    const url = String(process.env.SUPABASE_URL || SUPABASE_URL || "").trim();
    const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
    if (!url || !key) return null;
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        String(value || "")
    );
}

module.exports = async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
    }

    const livekitUrl = String(process.env.LIVEKIT_URL || "").trim();
    const apiKey = String(process.env.LIVEKIT_API_KEY || "").trim();
    const apiSecret = String(process.env.LIVEKIT_API_SECRET || "").trim();
    if (!livekitUrl || !apiKey || !apiSecret) {
        res.status(503).json({
            error: "voice_not_configured",
            message: "LiveKit is not configured. Falling back to peer voice.",
        });
        return;
    }

    const authHeader = String(req.headers.authorization || "");
    const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!accessToken) {
        res.status(401).json({ error: "not_authenticated" });
        return;
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const roomId = String(body.roomId || "").trim();
    const displayName = String(body.displayName || "").trim().slice(0, 80);
    if (!roomId) {
        res.status(400).json({ error: "missing_room" });
        return;
    }

    const userClient = createUserClient(accessToken);
    if (!userClient) {
        res.status(503).json({ error: "auth_unavailable" });
        return;
    }

    const {
        data: { user },
        error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user?.id) {
        res.status(401).json({ error: "not_authenticated" });
        return;
    }

    if (isUuid(roomId)) {
        const service = createServiceClient();
        if (service) {
            const { data: member, error: memberError } = await service
                .from("word_wars_participants")
                .select("user_id")
                .eq("room_id", roomId)
                .eq("user_id", user.id)
                .maybeSingle();
            if (memberError) {
                res.status(500).json({ error: "membership_check_failed" });
                return;
            }
            if (!member) {
                res.status(403).json({ error: "not_a_participant" });
                return;
            }
        }
    }

    const roomName = `word-war-${roomId}`.slice(0, 128);
    const token = signLiveKitJwt({
        apiKey,
        apiSecret,
        identity: user.id,
        name: displayName || user.email || user.id,
        roomName,
    });

    res.status(200).json({
        url: livekitUrl,
        token,
        roomName,
        provider: "livekit",
    });
};
