/**
 * Word Wars high-quality voice chat.
 * Prefers LiveKit when /api/word-wars-voice-token is configured;
 * otherwise uses Opus WebRTC mesh over Supabase Broadcast / BroadcastChannel.
 */
import { supabase } from "../firebase.js";

const AUDIO_CONSTRAINTS = {
    audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 48000,
    },
    video: false,
};

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }];

function safeString(value, fallback = "") {
    return typeof value === "string" ? value : fallback;
}

function isLocalRoom(roomId) {
    return String(roomId || "").startsWith("local-") || String(roomId || "").startsWith("preview-");
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
            <div class="ww-voice-actions">
                <button type="button" class="btn mint" data-ww-voice-join>Join voice</button>
                <button type="button" class="btn ghost hidden" data-ww-voice-mute disabled>Mute</button>
                <button type="button" class="btn ghost hidden" data-ww-voice-deafen disabled>Deafen</button>
                <button type="button" class="btn ghost hidden" data-ww-voice-leave disabled>Leave</button>
            </div>
        </div>
        <div class="ww-voice-remote" data-ww-voice-remote hidden></div>
    `;

    const statusEl = root.querySelector("[data-ww-voice-status]");
    const dotEl = root.querySelector("[data-ww-voice-dot]");
    const joinBtn = root.querySelector("[data-ww-voice-join]");
    const muteBtn = root.querySelector("[data-ww-voice-mute]");
    const deafenBtn = root.querySelector("[data-ww-voice-deafen]");
    const leaveBtn = root.querySelector("[data-ww-voice-leave]");
    const remoteWrap = root.querySelector("[data-ww-voice-remote]");

    function setSpeaking(id, speaking) {
        if (!id) return;
        if (speaking) speakingIds.add(id);
        else speakingIds.delete(id);
        onSpeakingChange?.(new Set(speakingIds));
        const timer = speakingTimers.get(id);
        if (timer) window.clearTimeout(timer);
        if (speaking) {
            speakingTimers.set(
                id,
                window.setTimeout(() => {
                    speakingIds.delete(id);
                    onSpeakingChange?.(new Set(speakingIds));
                    render();
                }, 900)
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
            audio.muted = deafened;
            audio.volume = deafened ? 0 : 1;
        });
    }

    function ensureRemoteAudio(peerId) {
        if (!remoteWrap) return null;
        let audio = remoteAudio.get(peerId);
        if (audio) return audio;
        audio = document.createElement("audio");
        audio.autoplay = true;
        audio.playsInline = true;
        audio.dataset.peerId = peerId;
        remoteWrap.appendChild(audio);
        remoteAudio.set(peerId, audio);
        return audio;
    }

    function removePeer(peerId) {
        const pc = peers.get(peerId);
        if (pc) {
            pc.onicecandidate = null;
            pc.ontrack = null;
            pc.close();
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

    async function getLocalStream() {
        if (localStream) return localStream;
        localStream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS);
        try {
            audioCtx = new AudioContext();
            const source = audioCtx.createMediaStreamSource(localStream);
            localAnalyser = audioCtx.createAnalyser();
            localAnalyser.fftSize = 512;
            source.connect(localAnalyser);
            const data = new Uint8Array(localAnalyser.frequencyBinCount);
            speakPoll = window.setInterval(() => {
                if (!localAnalyser || muted || deafened || !joined) {
                    setSpeaking(userId, false);
                    return;
                }
                localAnalyser.getByteFrequencyData(data);
                let sum = 0;
                for (let i = 0; i < data.length; i++) sum += data[i];
                const avg = sum / data.length;
                setSpeaking(userId, avg > 18);
            }, 120);
        } catch {
            /* analyser optional */
        }
        return localStream;
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
            signalChannel.send({
                type: "broadcast",
                event: "signal",
                payload: message,
            });
        }
    }

    async function createPeer(peerId, polite) {
        if (!peerId || peerId === userId || peers.has(peerId)) return peers.get(peerId);
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        peers.set(peerId, pc);

        const stream = await getLocalStream();
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                broadcastSignal({ kind: "ice", to: peerId, candidate: event.candidate });
            }
        };

        pc.ontrack = (event) => {
            const audio = ensureRemoteAudio(peerId);
            if (!audio) return;
            audio.srcObject = event.streams[0] || new MediaStream([event.track]);
            audio.muted = deafened;
            audio.play().catch(() => {});
        };

        pc.onconnectionstatechange = () => {
            if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
                removePeer(peerId);
            }
        };

        if (!polite) {
            const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
            await pc.setLocalDescription(offer);
            broadcastSignal({ kind: "offer", to: peerId, sdp: pc.localDescription });
        }

        return pc;
    }

    async function handleSignal(payload) {
        if (!payload || payload.from === userId) return;
        if (payload.to && payload.to !== userId) return;
        const peerId = String(payload.from || "");
        if (!peerId) return;

        if (payload.kind === "hello") {
            await createPeer(peerId, userId > peerId);
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
                await pc.setRemoteDescription(payload.sdp);
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                broadcastSignal({ kind: "answer", to: peerId, sdp: pc.localDescription });
            } else if (payload.kind === "answer" && payload.sdp) {
                if (pc.signalingState !== "stable") {
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

        if (isLocalRoom(roomId)) {
            signalBroadcast = new BroadcastChannel(`ww-voice-${roomId}`);
            signalBroadcast.onmessage = (event) => handleSignal(event.data);
        } else {
            signalChannel = supabase
                .channel(`ww_voice_${roomId}`, {
                    config: { broadcast: { self: false } },
                })
                .on("broadcast", { event: "signal" }, ({ payload }) => handleSignal(payload))
                .subscribe((status) => {
                    if (status === "SUBSCRIBED") {
                        broadcastSignal({ kind: "hello" });
                    }
                });
        }

        broadcastSignal({ kind: "hello" });
        statusText = "In voice · peer audio";
        joined = true;
        applyMuteState();
        render();
    }

    async function startLiveKit(creds) {
        provider = "livekit";
        statusText = "Connecting high-quality voice…";
        render();

        const mod = await import("https://cdn.jsdelivr.net/npm/livekit-client@2.15.4/dist/livekit-client.esm.mjs");
        const { Room, RoomEvent, Track } = mod;
        livekitRoom = new Room({
            adaptiveStream: true,
            dynacast: true,
            audioCaptureDefaults: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                channelCount: 1,
            },
        });

        livekitRoom.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
            if (track.kind !== Track.Kind.Audio) return;
            const el = track.attach();
            el.autoplay = true;
            el.playsInline = true;
            el.dataset.peerId = participant.identity;
            remoteWrap?.appendChild(el);
            remoteAudio.set(participant.identity, el);
            el.muted = deafened;
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
                render();
            }
        });

        await livekitRoom.connect(creds.url, creds.token);
        await livekitRoom.localParticipant.setMicrophoneEnabled(true);
        joined = true;
        muted = false;
        statusText = "In voice · LiveKit";
        applyMuteState();
        render();
    }

    async function joinVoice() {
        if (joined || destroyed || !roomId) return;
        joinBtn.disabled = true;
        statusText = "Requesting microphone…";
        render();
        try {
            let creds = null;
            if (!isLocalRoom(roomId)) {
                try {
                    creds = await fetchLiveKitCreds(roomId, displayName);
                } catch (err) {
                    console.warn("LiveKit token failed, using peer voice", err);
                }
            }
            if (creds?.url && creds?.token) {
                await startLiveKit(creds);
            } else {
                await startMesh();
            }
        } catch (err) {
            console.error(err);
            statusText = err?.message || "Could not join voice";
            await leaveVoice();
        } finally {
            joinBtn.disabled = false;
            render();
        }
    }

    async function leaveVoice() {
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

        [...peers.keys()].forEach(removePeer);

        if (livekitRoom) {
            try {
                await livekitRoom.disconnect();
            } catch {
                /* ignore */
            }
            livekitRoom = null;
        }

        if (signalChannel) {
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
        statusText = "Voice ready";
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
