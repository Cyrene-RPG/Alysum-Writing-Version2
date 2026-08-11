/**
 * Word Wars high-quality voice chat.
 * Prefers LiveKit when /api/word-wars-voice-token is configured;
 * otherwise uses Opus WebRTC mesh over Supabase Broadcast / BroadcastChannel.
 */
import { supabase } from "../firebase.js";

const ICE_SERVERS = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
];

function safeString(value, fallback = "") {
    return typeof value === "string" ? value : fallback;
}

function isLocalRoom(roomId) {
    return String(roomId || "").startsWith("local-") || String(roomId || "").startsWith("preview-");
}

function micErrorMessage(err) {
    const name = String(err?.name || "");
    const message = String(err?.message || err || "");
    if (name === "NotAllowedError" || /Permission|NotAllowed/i.test(message)) {
        return "Microphone blocked — allow mic access for this site, then try again.";
    }
    if (name === "NotFoundError" || /NotFound|DevicesNotFound/i.test(message)) {
        return "No microphone found.";
    }
    if (name === "NotReadableError" || /NotReadable|Could not start/i.test(message)) {
        return "Microphone is busy in another app.";
    }
    if (name === "OverconstrainedError" || /Overconstrained/i.test(message)) {
        return "Microphone settings not supported on this device.";
    }
    return message || "Could not access microphone.";
}

async function fetchLiveKitCreds(roomId, displayName) {
    const {
        data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return null;

    const response = await fetch("/api/word-wars-voice-token", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ roomId, displayName }),
    });

    if (response.status === 503) return null;
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || err.error || "Could not join voice.");
    }
    return response.json();
}

async function acquireMicrophone() {
    if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser does not support microphone access.");
    }

    const attempts = [
        {
            audio: {
                echoCancellation: { ideal: true },
                noiseSuppression: { ideal: true },
                autoGainControl: { ideal: true },
            },
            video: false,
        },
        { audio: true, video: false },
    ];

    let lastError = null;
    for (const constraints of attempts) {
        try {
            return await navigator.mediaDevices.getUserMedia(constraints);
        } catch (err) {
            lastError = err;
            if (err?.name === "NotAllowedError") break;
        }
    }
    throw lastError || new Error("Could not access microphone.");
}

/**
 * @param {HTMLElement} root
 * @param {{
 *   roomId: string,
 *   userId: string,
 *   displayName?: string,
 *   onSpeakingChange?: (speakingIds: Set<string>) => void,
 * }} opts
 */
export function mountWordWarVoice(root, opts) {
    if (!root) return { destroy() {}, getSpeakingIds: () => new Set() };

    const roomId = String(opts.roomId || "").trim();
    const userId = String(opts.userId || "").trim();
    const displayName = safeString(opts.displayName || "Writer").trim() || "Writer";
    const onSpeakingChange = typeof opts.onSpeakingChange === "function" ? opts.onSpeakingChange : null;

    let destroyed = false;
    let joined = false;
    let muted = false;
    let deafened = false;
    let provider = "idle";
    let statusText = "Voice ready";
    let localStream = null;
    /** @type {import("livekit-client").Room | null} */
    let livekitRoom = null;
    /** @type {import("@supabase/supabase-js").RealtimeChannel | null} */
    let signalChannel = null;
    /** @type {BroadcastChannel | null} */
    let signalBroadcast = null;
    /** @type {Map<string, RTCPeerConnection>} */
    const peers = new Map();
    /** @type {Set<string>} */
    const peerSetup = new Set();
    /** @type {Map<string, HTMLAudioElement>} */
    const remoteAudio = new Map();
    /** @type {Set<string>} */
    const speakingIds = new Set();
    /** @type {Map<string, number>} */
    const speakingTimers = new Map();
    /** @type {AnalyserNode | null} */
    let localAnalyser = null;
    /** @type {AudioContext | null} */
    let audioCtx = null;
    let speakPoll = 0;
    let micLevel = 0;

    root.classList.add("ww-voice");
    root.innerHTML = `
        <div class="ww-voice-bar">
            <div class="ww-voice-meta">
                <span class="ww-voice-dot" data-ww-voice-dot aria-hidden="true"></span>
                <div>
                    <p class="ww-voice-label">Voice</p>
                    <p class="ww-voice-status" data-ww-voice-status>Voice ready</p>
                </div>
            </div>
            <div class="ww-voice-meter" data-ww-voice-meter hidden aria-hidden="true">
                <span class="ww-voice-meter-fill" data-ww-voice-meter-fill></span>
            </div>
            <div class="ww-voice-actions">
                <button type="button" class="btn mint" data-ww-voice-join>Join voice</button>
                <button type="button" class="btn ghost hidden" data-ww-voice-mute disabled>Mute</button>
                <button type="button" class="btn ghost hidden" data-ww-voice-deafen disabled>Deafen</button>
                <button type="button" class="btn ghost hidden" data-ww-voice-leave disabled>Leave</button>
            </div>
        </div>
        <div class="ww-voice-remote" data-ww-voice-remote aria-hidden="true"></div>
    `;

    const statusEl = root.querySelector("[data-ww-voice-status]");
    const dotEl = root.querySelector("[data-ww-voice-dot]");
    const joinBtn = root.querySelector("[data-ww-voice-join]");
    const muteBtn = root.querySelector("[data-ww-voice-mute]");
    const deafenBtn = root.querySelector("[data-ww-voice-deafen]");
    const leaveBtn = root.querySelector("[data-ww-voice-leave]");
    const remoteWrap = root.querySelector("[data-ww-voice-remote]");
    const meterEl = root.querySelector("[data-ww-voice-meter]");
    const meterFillEl = root.querySelector("[data-ww-voice-meter-fill]");

    function setSpeaking(id, speaking) {
        if (!id) return;
        const wasSpeaking = speakingIds.has(id);
        if (speaking) speakingIds.add(id);
        else speakingIds.delete(id);
        if (wasSpeaking !== speaking) onSpeakingChange?.(new Set(speakingIds));
        const timer = speakingTimers.get(id);
        if (timer) window.clearTimeout(timer);
        if (speaking) {
            speakingTimers.set(
                id,
                window.setTimeout(() => {
                    if (!speakingIds.has(id)) return;
                    speakingIds.delete(id);
                    onSpeakingChange?.(new Set(speakingIds));
                    render();
                }, 700)
            );
        }
        render();
    }

    function render() {
        if (!statusEl) return;
        statusEl.textContent = statusText;
        root.classList.toggle("is-joined", joined);
        root.classList.toggle("is-muted", muted);
        root.classList.toggle("is-deafened", deafened);
        if (dotEl) {
            dotEl.classList.toggle("is-live", joined);
            dotEl.classList.toggle("is-speaking", speakingIds.has(userId));
        }
        if (meterEl) {
            meterEl.hidden = !joined;
            meterEl.setAttribute("aria-hidden", joined ? "false" : "true");
        }
        if (meterFillEl) {
            meterFillEl.style.width = `${Math.round(micLevel * 100)}%`;
        }
        if (joinBtn) joinBtn.classList.toggle("hidden", joined);
        if (muteBtn) {
            muteBtn.classList.toggle("hidden", !joined);
            muteBtn.disabled = !joined;
            muteBtn.textContent = muted ? "Unmute" : "Mute";
            muteBtn.classList.toggle("is-active", muted);
        }
        if (deafenBtn) {
            deafenBtn.classList.toggle("hidden", !joined);
            deafenBtn.disabled = !joined;
            deafenBtn.textContent = deafened ? "Undeafen" : "Deafen";
            deafenBtn.classList.toggle("is-active", deafened);
        }
        if (leaveBtn) {
            leaveBtn.classList.toggle("hidden", !joined);
            leaveBtn.disabled = !joined;
        }
    }

    function applyMuteState() {
        localStream?.getAudioTracks().forEach((track) => {
            track.enabled = joined && !muted && !deafened;
        });
        remoteAudio.forEach((audio) => {
            audio.muted = !!deafened;
            audio.volume = deafened ? 0 : 1;
        });
    }

    async function playRemoteAudio(audio) {
        if (!audio) return;
        try {
            await audio.play();
        } catch (err) {
            console.warn("Remote voice autoplay blocked; retrying after gesture", err);
        }
    }

    function ensureRemoteAudio(peerId) {
        if (!remoteWrap) return null;
        let audio = remoteAudio.get(peerId);
        if (audio) return audio;
        audio = document.createElement("audio");
        audio.autoplay = true;
        audio.playsInline = true;
        audio.setAttribute("playsinline", "");
        audio.dataset.peerId = peerId;
        // Keep playable for browsers that skip display:none media.
        audio.style.cssText = "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;";
        remoteWrap.appendChild(audio);
        remoteAudio.set(peerId, audio);
        return audio;
    }

    function removePeer(peerId) {
        peerSetup.delete(peerId);
        const pc = peers.get(peerId);
        if (pc) {
            pc.onicecandidate = null;
            pc.ontrack = null;
            pc.onconnectionstatechange = null;
            try {
                pc.close();
            } catch {
                /* ignore */
            }
            peers.delete(peerId);
        }
        const audio = remoteAudio.get(peerId);
        if (audio) {
            audio.srcObject = null;
            audio.remove();
            remoteAudio.delete(peerId);
        }
        setSpeaking(peerId, false);
    }

    async function ensureAudioContext() {
        if (!audioCtx) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return null;
            audioCtx = new Ctx();
        }
        if (audioCtx.state === "suspended") {
            try {
                await audioCtx.resume();
            } catch {
                /* ignore */
            }
        }
        return audioCtx;
    }

    async function startMicMeter(stream) {
        const ctx = await ensureAudioContext();
        if (!ctx || !stream) return;
        try {
            const source = ctx.createMediaStreamSource(stream);
            localAnalyser = ctx.createAnalyser();
            localAnalyser.fftSize = 1024;
            localAnalyser.smoothingTimeConstant = 0.7;
            source.connect(localAnalyser);
            const data = new Uint8Array(localAnalyser.fftSize);

            if (speakPoll) window.clearInterval(speakPoll);
            speakPoll = window.setInterval(() => {
                if (!localAnalyser || !joined) {
                    micLevel = 0;
                    setSpeaking(userId, false);
                    render();
                    return;
                }
                if (muted || deafened) {
                    micLevel = 0;
                    setSpeaking(userId, false);
                    render();
                    return;
                }
                localAnalyser.getByteTimeDomainData(data);
                let sum = 0;
                for (let i = 0; i < data.length; i++) {
                    const v = (data[i] - 128) / 128;
                    sum += v * v;
                }
                const rms = Math.sqrt(sum / data.length);
                micLevel = Math.min(1, rms * 4.5);
                setSpeaking(userId, rms > 0.02);
            }, 80);
        } catch (err) {
            console.warn("Mic meter unavailable", err);
        }
    }

    async function getLocalStream() {
        if (localStream) return localStream;
        localStream = await acquireMicrophone();
        await startMicMeter(localStream);
        return localStream;
    }

    function serializeCandidate(candidate) {
        if (!candidate) return null;
        if (typeof candidate.toJSON === "function") return candidate.toJSON();
        return {
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid,
            sdpMLineIndex: candidate.sdpMLineIndex,
            usernameFragment: candidate.usernameFragment,
        };
    }

    function serializeDescription(desc) {
        if (!desc) return null;
        return { type: desc.type, sdp: desc.sdp };
    }

    function broadcastSignal(payload) {
        const message = { ...payload, from: userId, roomId, ts: Date.now() };
        if (signalBroadcast) {
            try {
                signalBroadcast.postMessage(message);
            } catch {
                /* ignore */
            }
        }
        if (signalChannel) {
            signalChannel
                .send({
                    type: "broadcast",
                    event: "signal",
                    payload: message,
                })
                .catch((err) => console.warn("Voice signal send failed", err));
        }
    }

    async function createPeer(peerId, polite) {
        if (!peerId || peerId === userId) return null;
        if (peers.has(peerId) || peerSetup.has(peerId)) return peers.get(peerId) || null;
        peerSetup.add(peerId);

        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        peers.set(peerId, pc);

        try {
            const stream = await getLocalStream();
            stream.getAudioTracks().forEach((track) => {
                if (!pc.getSenders().some((sender) => sender.track === track)) {
                    pc.addTrack(track, stream);
                }
            });
        } catch (err) {
            removePeer(peerId);
            throw err;
        }

        pc.onicecandidate = (event) => {
            if (!event.candidate) return;
            broadcastSignal({
                kind: "ice",
                to: peerId,
                candidate: serializeCandidate(event.candidate),
            });
        };

        pc.ontrack = (event) => {
            const audio = ensureRemoteAudio(peerId);
            if (!audio) return;
            const inbound = event.streams?.[0] || new MediaStream([event.track]);
            audio.srcObject = inbound;
            audio.muted = !!deafened;
            void playRemoteAudio(audio);
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === "failed" || pc.connectionState === "closed") {
                removePeer(peerId);
            }
        };

        if (!polite) {
            try {
                const offer = await pc.createOffer({ offerToReceiveAudio: true });
                await pc.setLocalDescription(offer);
                broadcastSignal({
                    kind: "offer",
                    to: peerId,
                    sdp: serializeDescription(pc.localDescription),
                });
            } catch (err) {
                console.warn("Voice offer failed", err);
                removePeer(peerId);
            }
        }

        return pc;
    }

    async function handleSignal(payload) {
        if (!joined || !payload || payload.from === userId) return;
        if (payload.to && payload.to !== userId) return;
        const peerId = String(payload.from || "");
        if (!peerId) return;

        if (payload.kind === "hello" || payload.kind === "presence") {
            // Lower id is polite (answers); higher id offers — avoids glare.
            await createPeer(peerId, userId < peerId);
            return;
        }
        if (payload.kind === "bye") {
            removePeer(peerId);
            return;
        }

        let pc = peers.get(peerId);
        if (!pc && (payload.kind === "offer" || payload.kind === "ice")) {
            pc = await createPeer(peerId, true);
        }
        if (!pc) return;

        try {
            if (payload.kind === "offer" && payload.sdp) {
                if (pc.signalingState !== "stable" && pc.signalingState !== "have-remote-offer") {
                    // Ignore glare leftovers.
                }
                await pc.setRemoteDescription(payload.sdp);
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                broadcastSignal({
                    kind: "answer",
                    to: peerId,
                    sdp: serializeDescription(pc.localDescription),
                });
            } else if (payload.kind === "answer" && payload.sdp) {
                if (pc.signalingState === "have-local-offer") {
                    await pc.setRemoteDescription(payload.sdp);
                }
            } else if (payload.kind === "ice" && payload.candidate) {
                try {
                    await pc.addIceCandidate(payload.candidate);
                } catch {
                    /* ignore late ICE */
                }
            }
        } catch (err) {
            console.warn("Voice signal error", err);
        }
    }

    async function startMesh() {
        provider = "mesh";
        statusText = "Connecting peer voice…";
        render();

        await getLocalStream();
        await ensureAudioContext();

        if (isLocalRoom(roomId)) {
            signalBroadcast = new BroadcastChannel(`ww-voice-${roomId}`);
            signalBroadcast.onmessage = (event) => {
                void handleSignal(event.data);
            };
            broadcastSignal({ kind: "hello" });
        } else {
            signalChannel = supabase
                .channel(`ww_voice_${roomId}`, {
                    config: {
                        broadcast: { self: false },
                        presence: { key: userId },
                    },
                })
                .on("broadcast", { event: "signal" }, ({ payload }) => {
                    void handleSignal(payload);
                })
                .on("presence", { event: "sync" }, () => {
                    const state = signalChannel?.presenceState?.() || {};
                    Object.keys(state).forEach((peerId) => {
                        if (peerId && peerId !== userId) {
                            void handleSignal({ kind: "presence", from: peerId });
                        }
                    });
                })
                .on("presence", { event: "join" }, ({ key }) => {
                    if (key && key !== userId) {
                        void handleSignal({ kind: "presence", from: key });
                    }
                })
                .on("presence", { event: "leave" }, ({ key }) => {
                    if (key) removePeer(key);
                });

            await new Promise((resolve) => {
                signalChannel.subscribe(async (status) => {
                    if (status === "SUBSCRIBED") {
                        try {
                            await signalChannel.track({
                                userId,
                                displayName,
                                joinedAt: Date.now(),
                            });
                        } catch (err) {
                            console.warn("Voice presence track failed", err);
                        }
                        broadcastSignal({ kind: "hello" });
                        resolve();
                    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                        resolve();
                    }
                });
            });
        }

        statusText = peers.size
            ? `In voice · ${peers.size + 1} connected`
            : "In voice · waiting for others";
        joined = true;
        applyMuteState();
        render();

        // Keep status fresh as peers connect.
        const statusTimer = window.setInterval(() => {
            if (!joined || provider !== "mesh") {
                window.clearInterval(statusTimer);
                return;
            }
            const n = peers.size;
            statusText = n ? `In voice · ${n + 1} connected` : "In voice · waiting for others";
            render();
        }, 1500);
    }

    function releaseLocalStream() {
        if (speakPoll) {
            window.clearInterval(speakPoll);
            speakPoll = 0;
        }
        localAnalyser = null;
        if (localStream) {
            localStream.getTracks().forEach((track) => track.stop());
            localStream = null;
        }
        micLevel = 0;
    }

    async function startLiveKit(creds) {
        provider = "livekit";
        statusText = "Connecting high-quality voice…";
        render();

        // Free any probe capture so LiveKit can open the mic exclusively.
        releaseLocalStream();

        const mod = await import("https://cdn.jsdelivr.net/npm/livekit-client@2.15.4/dist/livekit-client.esm.mjs");
        const { Room, RoomEvent, Track, createLocalAudioTrack } = mod;

        livekitRoom = new Room({
            adaptiveStream: true,
            dynacast: true,
            audioCaptureDefaults: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            },
        });

        livekitRoom.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
            if (track.kind !== Track.Kind.Audio) return;
            const el = track.attach();
            el.autoplay = true;
            el.playsInline = true;
            el.setAttribute("playsinline", "");
            el.dataset.peerId = participant.identity;
            el.style.cssText = "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;";
            remoteWrap?.appendChild(el);
            remoteAudio.set(participant.identity, el);
            el.muted = !!deafened;
            void playRemoteAudio(el);
        });

        livekitRoom.on(RoomEvent.TrackUnsubscribed, (track, _publication, participant) => {
            track.detach().forEach((el) => el.remove());
            remoteAudio.delete(participant.identity);
            setSpeaking(participant.identity, false);
        });

        livekitRoom.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
            speakingIds.clear();
            speakers.forEach((speaker) => speakingIds.add(speaker.identity));
            onSpeakingChange?.(new Set(speakingIds));
            render();
        });

        livekitRoom.on(RoomEvent.Disconnected, () => {
            if (!destroyed) {
                joined = false;
                statusText = "Voice disconnected";
                micLevel = 0;
                render();
            }
        });

        await livekitRoom.connect(creds.url, creds.token);

        // Explicit local track publish is more reliable than setMicrophoneEnabled alone.
        try {
            const audioTrack = await createLocalAudioTrack({
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            });
            await livekitRoom.localParticipant.publishTrack(audioTrack);
            localStream = new MediaStream([audioTrack.mediaStreamTrack]);
            await startMicMeter(localStream);
        } catch (err) {
            console.warn("LiveKit publishTrack failed, falling back to setMicrophoneEnabled", err);
            await livekitRoom.localParticipant.setMicrophoneEnabled(true);
            try {
                localStream = await acquireMicrophone();
                await startMicMeter(localStream);
            } catch {
                /* optional meter */
            }
        }

        joined = true;
        muted = false;
        statusText = "In voice · LiveKit";
        applyMuteState();
        render();
    }

    async function joinVoice() {
        if (joined || destroyed || !roomId) return;
        if (joinBtn) joinBtn.disabled = true;
        statusText = "Requesting microphone…";
        micLevel = 0;
        render();
        try {
            // Unlock audio output in the same user gesture as Join.
            await ensureAudioContext();

            let creds = null;
            if (!isLocalRoom(roomId)) {
                try {
                    creds = await fetchLiveKitCreds(roomId, displayName);
                } catch (err) {
                    console.warn("LiveKit token failed, using peer voice", err);
                }
            }

            // Probe mic early so permission errors are clear before connecting.
            await getLocalStream();

            if (creds?.url && creds?.token) {
                await startLiveKit(creds);
            } else {
                await startMesh();
            }
        } catch (err) {
            console.error(err);
            statusText = micErrorMessage(err);
            await leaveVoice({ keepStatus: true });
        } finally {
            if (joinBtn) joinBtn.disabled = false;
            render();
        }
    }

    async function leaveVoice({ keepStatus = false } = {}) {
        const previousStatus = statusText;
        joined = false;
        broadcastSignal({ kind: "bye" });

        if (speakPoll) {
            window.clearInterval(speakPoll);
            speakPoll = 0;
        }
        speakingTimers.forEach((timer) => window.clearTimeout(timer));
        speakingTimers.clear();
        speakingIds.clear();
        onSpeakingChange?.(new Set());
        micLevel = 0;

        [...peers.keys()].forEach(removePeer);
        peerSetup.clear();

        if (livekitRoom) {
            try {
                await livekitRoom.disconnect();
            } catch {
                /* ignore */
            }
            livekitRoom = null;
        }

        if (signalChannel) {
            try {
                await signalChannel.untrack();
            } catch {
                /* ignore */
            }
            supabase.removeChannel(signalChannel);
            signalChannel = null;
        }
        if (signalBroadcast) {
            signalBroadcast.close();
            signalBroadcast = null;
        }

        if (localStream) {
            localStream.getTracks().forEach((track) => track.stop());
            localStream = null;
        }
        if (audioCtx) {
            audioCtx.close().catch(() => {});
            audioCtx = null;
            localAnalyser = null;
        }

        remoteAudio.forEach((audio) => {
            audio.srcObject = null;
            audio.remove();
        });
        remoteAudio.clear();

        provider = "idle";
        statusText = keepStatus ? previousStatus : "Voice ready";
        muted = false;
        deafened = false;
        render();
    }

    joinBtn?.addEventListener("click", () => {
        joinVoice().catch(console.error);
    });
    muteBtn?.addEventListener("click", async () => {
        muted = !muted;
        if (livekitRoom) {
            await livekitRoom.localParticipant.setMicrophoneEnabled(!muted && !deafened);
        }
        applyMuteState();
        render();
    });
    deafenBtn?.addEventListener("click", async () => {
        deafened = !deafened;
        if (deafened) muted = true;
        if (livekitRoom) {
            await livekitRoom.localParticipant.setMicrophoneEnabled(!muted && !deafened);
        }
        applyMuteState();
        render();
    });
    leaveBtn?.addEventListener("click", () => {
        leaveVoice().catch(console.error);
    });

    render();

    return {
        getSpeakingIds: () => new Set(speakingIds),
        async destroy() {
            destroyed = true;
            await leaveVoice();
            root.innerHTML = "";
        },
    };
}
