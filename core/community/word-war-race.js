/**
 * Word Wars race mode: database calls, race rules, the racer's count and live
 * updates. No DOM.
 *
 * The database (supabase/live-site/supabase-word-wars-race.sql) is the source of
 * truth. The rules here mirror it so screens show the right thing between
 * server updates. If you change a rule, change it in both places.
 */

import { supabase } from "../authentication/client.js";

export const TARGET_CHOICES = [100, 250, 500, 1000];
export const SPEED_LIMIT_WPM = 150;
export const SPEED_BURST_WORDS = 20;
export const CLOSE_AFTER_FIRST_MS = 2 * 60_000;
export const MAX_RACE_MS = 2 * 60 * 60_000;
export const LOBBY_EXPIRES_MS = 6 * 60 * 60_000;
export const GONE_AFTER_MS = 45_000;
export const CHECK_IN_MS = 15_000;
export const PROMPT_MAX_CHARS = 1000;
export const PAGE_MAX_CHARS = 30_000;

// ---------------------------------------------------------------------------
// Rows → app shapes. Supabase sends snake_case; nothing outside this file
// should see it.
// ---------------------------------------------------------------------------

/** Postgres and Realtime send timestamps in a few shapes; normalize before parsing. */
function parseTime(value) {
    if (value == null || value === "") return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    let text = String(value).trim().replace(" ", "T");
    text = text.replace(/(\.\d{3})\d+/, "$1");
    text = text.replace(/([+-]\d{2})$/, "$1:00");
    const ms = Date.parse(text);
    return Number.isFinite(ms) ? ms : null;
}

function toCount(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

export function raceFromRow(row) {
    if (!row || typeof row !== "object" || !row.id) return null;
    return {
        id: String(row.id),
        code: String(row.code || ""),
        hostId: String(row.host_id || ""),
        targetWords: toCount(row.target_words) || 250,
        isPublic: row.is_public !== false,
        maxRacers: toCount(row.max_racers) || 10,
        createdAt: parseTime(row.created_at),
        startsAt: parseTime(row.starts_at),
        firstFinishAt: parseTime(row.first_finish_at),
        endedAt: parseTime(row.ended_at),
        isCancelled: row.cancelled === true,
        rematchId: row.rematch_id ? String(row.rematch_id) : null,
        prompt: row.prompt ? String(row.prompt) : null,
    };
}

export function racerFromRow(row) {
    if (!row || typeof row !== "object" || !row.user_id) return null;
    return {
        raceId: String(row.race_id || ""),
        userId: String(row.user_id),
        displayName: String(row.display_name || "Writer"),
        avatarUrl: row.avatar_url ? String(row.avatar_url) : "",
        bookId: row.book_id ? String(row.book_id) : "",
        bookTitle: String(row.book_title || "Untitled"),
        words: toCount(row.words),
        startWords: row.start_words == null ? null : toCount(row.start_words),
        peakWpm: toCount(row.peak_wpm),
        cheers: toCount(row.cheers),
        finishedAt: parseTime(row.finished_at),
        joinedAt: parseTime(row.joined_at) || 0,
        lastSeenAt: parseTime(row.last_seen_at) || 0,
        leftAt: parseTime(row.left_at),
        isPagePublic: row.is_page_public !== false,
        wantsNewPrompt: row.wants_new_prompt === true,
        pageChapterId: row.page_chapter_id ? String(row.page_chapter_id) : "",
    };
}

function listingFromRow(row) {
    if (!row || typeof row !== "object" || !row.id) return null;
    return {
        id: String(row.id),
        targetWords: toCount(row.target_words) || 250,
        isPublic: row.is_public !== false,
        maxRacers: toCount(row.max_racers) || 10,
        createdAt: parseTime(row.created_at),
        startsAt: parseTime(row.starts_at),
        status: String(row.status || "lobby"),
        isMine: row.is_mine === true,
        racerCount: toCount(row.racer_count),
        hostName: String(row.host_name || "Writer"),
        prompt: row.prompt ? String(row.prompt) : null,
    };
}

function pageFromRow(row) {
    if (!row || typeof row !== "object" || !row.user_id) return null;
    return {
        userId: String(row.user_id),
        title: String(row.title || ""),
        text: String(row.body || ""),
        updatedAt: parseTime(row.updated_at),
    };
}

// ---------------------------------------------------------------------------
// Database calls
// ---------------------------------------------------------------------------

async function callRpc(name, args) {
    const sentAt = Date.now();
    const { data, error } = await supabase.rpc(name, args);
    const receivedAt = Date.now();
    if (error) throw new Error(error.message || "Something went wrong. Try again.");
    return { data, sentAt, receivedAt };
}

/** { race, racers, serverOffsetMs } — serverOffsetMs is server clock minus this device's clock. */
function snapshotFrom({ data, sentAt, receivedAt }) {
    const raw = data && typeof data === "object" ? data : {};
    const race = raceFromRow(raw.race);
    if (!race) throw new Error("Race not found.");
    const racers = Array.isArray(raw.racers) ? raw.racers.map(racerFromRow).filter(Boolean) : [];
    const serverNow = parseTime(raw.server_now);
    const serverOffsetMs = serverNow == null ? 0 : serverNow - Math.round((sentAt + receivedAt) / 2);
    return { race, racers, serverOffsetMs };
}

/** prompt: the prompt text, or null for free write. */
export async function createRace({ targetWords, isPublic, bookId, prompt = null }) {
    return snapshotFrom(await callRpc("create_word_war_race", {
        p_target_words: targetWords,
        p_is_public: isPublic,
        p_book_id: bookId,
        p_prompt: prompt,
    }));
}

/** Leave prompt undefined to keep it; pass null for free write. */
export async function updateRace(raceId, { targetWords = null, isPublic = null, prompt } = {}) {
    return snapshotFrom(await callRpc("update_word_war_race", {
        p_race_id: raceId,
        p_target_words: targetWords,
        p_is_public: isPublic,
        p_prompt: prompt === undefined ? null : prompt,
        p_set_prompt: prompt !== undefined,
    }));
}

/** A racer asks the host for a different prompt. */
export async function askForNewPrompt(raceId) {
    return snapshotFrom(await callRpc("ask_word_war_prompt_change", { p_race_id: raceId }));
}

export async function joinRace({ raceId = null, code = null, bookId = null } = {}) {
    return snapshotFrom(await callRpc("join_word_war_race", {
        p_race_id: raceId,
        p_code: code ? String(code).trim().toUpperCase() : null,
        p_book_id: bookId,
    }));
}

export async function watchRace({ raceId = null, code = null } = {}) {
    return snapshotFrom(await callRpc("watch_word_war_race", {
        p_race_id: raceId,
        p_code: code ? String(code).trim().toUpperCase() : null,
    }));
}

export async function getRace(raceId) {
    return snapshotFrom(await callRpc("get_word_war_race", { p_race_id: raceId }));
}

export async function startRace(raceId) {
    return snapshotFrom(await callRpc("start_word_war_race", { p_race_id: raceId }));
}

export async function rematchRace(raceId) {
    return snapshotFrom(await callRpc("rematch_word_war_race", { p_race_id: raceId }));
}

export async function leaveRace(raceId) {
    await callRpc("leave_word_war_race", { p_race_id: raceId });
}

export async function listRaces(limit = 30) {
    const { data } = await callRpc("list_word_war_races", { p_limit: limit });
    return Array.isArray(data) ? data.map(listingFromRow).filter(Boolean) : [];
}

/**
 * Send this racer's count. Without `words` it is only a check-in, which keeps
 * the racer (and a host's lobby) from showing as gone.
 */
export async function reportProgress(raceId, { words = null, startWords = null, peakWpm = null, chapterId = null } = {}) {
    const { data } = await callRpc("report_word_war_progress", {
        p_race_id: raceId,
        p_words: words == null ? null : toCount(words),
        p_start_words: startWords == null ? null : toCount(startWords),
        p_peak_wpm: peakWpm == null ? null : toCount(peakWpm),
        p_chapter_id: chapterId || null,
    });
    const raw = data && typeof data === "object" ? data : {};
    return {
        words: toCount(raw.words),
        startWords: raw.start_words == null ? null : toCount(raw.start_words),
        finishedAt: parseTime(raw.finished_at),
        status: String(raw.status || ""),
    };
}

/** cheersByRacer: Map or object of racer user id → count. Returns how many the server took. */
export async function sendCheers(raceId, cheersByRacer) {
    const entries = cheersByRacer instanceof Map ? [...cheersByRacer] : Object.entries(cheersByRacer || {});
    const payload = {};
    for (const [id, count] of entries) {
        const n = toCount(count);
        if (n > 0) payload[id] = n;
    }
    if (!Object.keys(payload).length) return 0;
    const { data } = await callRpc("cheer_word_war_racers", { p_race_id: raceId, p_cheers: payload });
    return toCount(data?.accepted);
}

// ---------------------------------------------------------------------------
// Shared pages
// ---------------------------------------------------------------------------

/** Public: spectators can watch during the race, everyone can read after it. Private deletes what was shared. */
export async function setPageVisibility(raceId, isPublic) {
    const { data } = await callRpc("set_word_war_page_visibility", { p_race_id: raceId, p_is_public: !!isPublic });
    return data?.is_page_public !== false;
}

/** Shares the plain text of the chapter being written. Only works while the page is public. */
export async function savePage(raceId, { title = "", text = "", chapterId = null } = {}) {
    await callRpc("save_word_war_page", {
        p_race_id: raceId,
        p_title: String(title).slice(0, 200),
        p_body: String(text).slice(0, PAGE_MAX_CHARS),
        p_chapter_id: chapterId || null,
    });
}

/** One racer's shared page, or null when it is private, missing, or not readable yet. */
export async function getPage(raceId, userId) {
    const { data, error } = await supabase
        .from("word_war_pages")
        .select("user_id, title, body, updated_at")
        .eq("race_id", raceId)
        .eq("user_id", userId)
        .maybeSingle();
    if (error) throw new Error(error.message || "Could not load that page.");
    return pageFromRow(data);
}

/** Who has a readable page in this race (titles only, no text). */
export async function listPages(raceId) {
    const { data, error } = await supabase
        .from("word_war_pages")
        .select("user_id, title, updated_at")
        .eq("race_id", raceId);
    if (error) throw new Error(error.message || "Could not load pages.");
    return Array.isArray(data) ? data.map(pageFromRow).filter(Boolean) : [];
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Editor HTML → plain text, one line per paragraph. Shared pages are never HTML. */
export function pageTextFromHtml(html) {
    return String(html || "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|h[1-6]|li|blockquote|tr)>/gi, "\n")
        .replace(/<[^>]*>/g, "")
        .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
            const key = code.toLowerCase();
            if (key.startsWith("#x")) return String.fromCodePoint(parseInt(key.slice(2), 16) || 32);
            if (key.startsWith("#")) return String.fromCodePoint(Number(key.slice(1)) || 32);
            return ENTITIES[key] ?? match;
        })
        .replace(/[ \t\u00a0]+/g, " ")
        .split("\n")
        .map((line) => line.trim())
        .filter((line, i, lines) => line || (i > 0 && lines[i - 1]))
        .join("\n")
        .trim()
        .slice(0, PAGE_MAX_CHARS);
}

// ---------------------------------------------------------------------------
// Race rules (mirror word_war_race_status in the SQL)
// ---------------------------------------------------------------------------

/** "lobby" | "countdown" | "running" | "finished" | "cancelled" */
export function raceStatus(race, nowMs) {
    if (!race || race.isCancelled) return "cancelled";
    if (race.startsAt == null) {
        if (race.createdAt != null && race.createdAt < nowMs - LOBBY_EXPIRES_MS) return "cancelled";
        return "lobby";
    }
    if (nowMs < race.startsAt) return "countdown";
    if (race.endedAt != null) return "finished";
    if (race.firstFinishAt != null && nowMs >= race.firstFinishAt + CLOSE_AFTER_FIRST_MS) return "finished";
    if (nowMs >= race.startsAt + MAX_RACE_MS) return "finished";
    return "running";
}

/** When the line closes for everyone still writing, or null before anyone finishes. */
export function lineClosesAt(race) {
    return race?.firstFinishAt != null ? race.firstFinishAt + CLOSE_AFTER_FIRST_MS : null;
}

/** When the race stopped (or will stop), for working out averages of unfinished racers. */
export function raceEndedAt(race, nowMs) {
    const ends = [nowMs];
    if (race?.endedAt != null) ends.push(race.endedAt);
    const closes = lineClosesAt(race);
    if (closes != null) ends.push(closes);
    if (race?.startsAt != null) ends.push(race.startsAt + MAX_RACE_MS);
    return Math.min(...ends);
}

/** Racers still in the lobby, in join order. */
export function lobbyRacers(racers) {
    return racers.filter((r) => r.leftAt == null).sort((a, b) => a.joinedAt - b.joinedAt);
}

/**
 * Everyone who took part, best first: finishers by finish time, then the rest
 * by words. Adds pos (1-based), place (finishers only), hasLeft and isGone.
 */
export function standings(race, racers, nowMs) {
    const startsAt = race?.startsAt;
    const field = racers.filter((r) => (
        r.leftAt == null
        || r.finishedAt != null
        || (startsAt != null && r.leftAt >= startsAt)
    ));
    const finished = field
        .filter((r) => r.finishedAt != null)
        .sort((a, b) => a.finishedAt - b.finishedAt);
    const rest = field
        .filter((r) => r.finishedAt == null)
        .sort((a, b) => (
            (a.leftAt == null ? 0 : 1) - (b.leftAt == null ? 0 : 1)
            || b.words - a.words
            || a.joinedAt - b.joinedAt
        ));
    return [...finished, ...rest].map((r, i) => ({
        ...r,
        pos: i + 1,
        place: r.finishedAt != null ? finished.indexOf(r) + 1 : null,
        hasLeft: r.leftAt != null,
        isGone: r.leftAt == null && r.finishedAt == null && nowMs - r.lastSeenAt > GONE_AFTER_MS,
    }));
}

/** Words per minute over a stretch of time, for averages. */
export function averageWpm(words, fromMs, toMs) {
    const minutes = (toMs - fromMs) / 60_000;
    return minutes > 0 ? Math.round(words / minutes) : 0;
}

// ---------------------------------------------------------------------------
// The racer's own count
// ---------------------------------------------------------------------------

/**
 * Counts the way the server does: words the book gained since the start, minus
 * pasted words, never below zero, and rising no faster than the speed limit.
 * The allowance starts at zero when the race starts and grows 2.5 words a
 * second (a pause banks up to 20), so no one can average over 150 wpm.
 * `raw` is what gets sent to the server; `counted` is what the server will
 * accept, so the racer sees the right number straight away. Times are server
 * time (see createServerClock).
 */
export function createRaceCounter({ startWords = 0, pastedWords = 0, targetWords = 250, startsAtMs = null } = {}) {
    let start = toCount(startWords);
    let pasted = toCount(pastedWords);
    let counted = 0;
    let budget = 0;
    let lastAt = startsAtMs;
    let isOverLimit = false;
    let raw = 0;

    return {
        get startWords() { return start; },
        get pastedWords() { return pasted; },
        addPasted(words) {
            if (words > 0) pasted += Math.round(words);
        },
        /** Call on every edit and on a timer, so a capped count can catch up. */
        update(bookWords, nowMs) {
            raw = Math.max(0, Math.min(targetWords, Math.round(bookWords) - start - pasted));
            if (lastAt != null && nowMs > lastAt) {
                budget = Math.min(SPEED_BURST_WORDS, budget + (SPEED_LIMIT_WPM / 60) * ((nowMs - lastAt) / 1000));
            }
            lastAt = lastAt == null ? nowMs : Math.max(lastAt, nowMs);
            if (raw <= counted) {
                counted = raw;
                isOverLimit = false;
            } else {
                const add = Math.min(raw - counted, Math.floor(budget));
                counted += add;
                budget -= add;
                isOverLimit = raw > counted;
            }
            return { raw, counted, isOverLimit };
        },
        get state() {
            return { raw, counted, isOverLimit };
        },
    };
}

// ---------------------------------------------------------------------------
// Pace
// ---------------------------------------------------------------------------

/** Words per minute over the last 30 seconds, from word counts seen over time. */
export function createPaceTracker(windowMs = 30_000) {
    const samples = [];
    let lastWords = null;
    let lastChangeAt = null;
    let peak = 0;

    function trim(nowMs) {
        while (samples.length > 1 && nowMs - samples[1][0] >= windowMs) samples.shift();
    }

    return {
        add(words, nowMs) {
            if (words !== lastWords) {
                lastWords = words;
                lastChangeAt = nowMs;
            }
            samples.push([nowMs, words]);
            trim(nowMs);
        },
        wpm(nowMs) {
            trim(nowMs);
            if (samples.length < 2) return 0;
            const [t0, w0] = samples[0];
            const span = nowMs - t0;
            if (span < 5_000) return 0;
            const words = samples[samples.length - 1][1] - w0;
            // A short burst can read higher, but counts never rise faster than the limit.
            return Math.max(0, Math.min(SPEED_LIMIT_WPM, Math.round(words / (span / 60_000))));
        },
        /** Call during a race once there is enough data to trust the pace. */
        notePeak(wpm) {
            if (wpm > peak) peak = wpm;
        },
        get peak() { return peak; },
        idleMs(nowMs) {
            return lastChangeAt == null ? 0 : nowMs - lastChangeAt;
        },
    };
}

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------

/** Countdowns and race clocks run on the server's time, not this device's. */
export function createServerClock() {
    let offset = 0;
    return {
        sync(serverOffsetMs) {
            if (Number.isFinite(serverOffsetMs)) offset = serverOffsetMs;
        },
        now() {
            return Date.now() + offset;
        },
    };
}

export function formatClock(ms) {
    const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = String(total % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

export function ordinal(n) {
    const suffixes = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return `${n}${suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]}`;
}

// ---------------------------------------------------------------------------
// Live updates
// ---------------------------------------------------------------------------

/**
 * Streams race and racer rows, cheers and who is watching.
 * Handlers: onRace(race), onRacer(racer), onCheer({ racerId, count }),
 * onWatchers(count), onConnection(isLive), onPage({ userId }).
 */
export function subscribeRace(raceId, {
    userId,
    role = "spectator",
    onRace = () => {},
    onRacer = () => {},
    onCheer = () => {},
    onWatchers = () => {},
    onConnection = () => {},
    onPage = () => {},
} = {}) {
    let currentRole = role;
    const channel = supabase.channel(`word-war-race:${raceId}`, {
        config: {
            presence: { key: String(userId || "") },
            broadcast: { self: false },
        },
    });

    function countWatchers() {
        const state = channel.presenceState();
        let n = 0;
        for (const metas of Object.values(state)) {
            if (Array.isArray(metas) && metas.some((m) => m?.role === "spectator")) n += 1;
        }
        return n;
    }

    channel
        .on("postgres_changes", {
            event: "*",
            schema: "public",
            table: "word_war_races",
            filter: `id=eq.${raceId}`,
        }, (change) => {
            const race = raceFromRow(change?.new);
            if (race) onRace(race);
        })
        .on("postgres_changes", {
            event: "*",
            schema: "public",
            table: "word_war_racers",
            filter: `race_id=eq.${raceId}`,
        }, (change) => {
            const racer = racerFromRow(change?.new);
            if (racer) onRacer(racer);
        })
        .on("broadcast", { event: "cheer" }, ({ payload }) => {
            const racerId = String(payload?.racerId || "");
            const count = Math.min(10, toCount(payload?.count));
            if (racerId && count > 0) onCheer({ racerId, count });
        })
        .on("broadcast", { event: "page" }, ({ payload }) => {
            const userId = String(payload?.userId || "");
            if (userId) onPage({ userId });
        })
        .on("presence", { event: "sync" }, () => onWatchers(countWatchers()))
        .subscribe((status) => {
            const isLive = status === "SUBSCRIBED";
            onConnection(isLive);
            if (isLive) void channel.track({ role: currentRole });
        });

    return {
        sendCheer(racerId, count) {
            void channel.send({ type: "broadcast", event: "cheer", payload: { racerId, count } });
        },
        /** Tells readers that this writer's page changed, so they fetch it again. */
        sendPageSignal(userId) {
            void channel.send({ type: "broadcast", event: "page", payload: { userId } });
        },
        setRole(nextRole) {
            if (nextRole === currentRole) return;
            currentRole = nextRole;
            void channel.track({ role: currentRole });
        },
        close() {
            void supabase.removeChannel(channel);
        },
    };
}
