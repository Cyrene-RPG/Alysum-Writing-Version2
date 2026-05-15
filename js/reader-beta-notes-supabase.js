/** Beta highlights: `reader_beta_notes` via SECURITY DEFINER RPCs, then REST, then legacy `users`. */

function safeObject(value, fallback = {}) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

export function isMissingReaderBetaNotesTable(err) {
    if (!err) return false;
    const code = err.code;
    const msg = String(err.message || err.details || "").toLowerCase();
    if (code === "PGRST205" || code === "42P01") return true;
    if (msg.includes("schema cache") && msg.includes("reader_beta_notes")) return true;
    if (msg.includes("could not find the table") && msg.includes("reader_beta_notes")) return true;
    return false;
}

export function isMissingReaderBetaNotesRpc(err) {
    if (!err) return false;
    const msg = String(err.message || err.details || "").toLowerCase();
    if (err.code === "PGRST202") return true;
    if (msg.includes("could not find the function")) return true;
    if (msg.includes("function public.reader_beta_notes")) return true;
    return false;
}

/** Postgres 42703 when `public.users` is missing the beta JSONB columns (run sibling SQL migration). */
export function isMissingUsersBetaReadJsonbColumns(err) {
    if (!err) return false;
    const code = String(err.code ?? "");
    if (code !== "42703") return false;
    const msg = String(err.message || err.details || "").toLowerCase();
    return msg.includes("beta_read_shelf") || msg.includes("beta_read_notes_by_book");
}

function normalizeNotesArray(data) {
    return normalizeBookNotesList(data);
}

/** One book's note list: array, JSON string, or legacy wrappers { notes }, { items }, { highlights }. */
export function normalizeBookNotesList(raw) {
    if (Array.isArray(raw)) {
        return raw.filter((n) => n && typeof n === "object");
    }
    if (raw == null) return [];
    if (typeof raw === "string") {
        try {
            return normalizeBookNotesList(JSON.parse(raw));
        } catch {
            return [];
        }
    }
    if (typeof raw === "object") {
        if (Array.isArray(raw.notes)) return normalizeBookNotesList(raw.notes);
        if (Array.isArray(raw.items)) return normalizeBookNotesList(raw.items);
        if (Array.isArray(raw.highlights)) return normalizeBookNotesList(raw.highlights);
    }
    return [];
}

function isLegacyMapRpcMissing(err) {
    if (!err) return false;
    if (err.code === "PGRST202") return true;
    const m = String(err.message || err.details || "").toLowerCase();
    return m.includes("reader_beta_notes_legacy_map") || (m.includes("could not find the function") && m.includes("legacy_map"));
}

async function ensureAuthSession(supabase) {
    try {
        await supabase.auth.getSession();
    } catch {
        /* ignore */
    }
}

function normBookId(bookId) {
    return String(bookId || "").trim();
}

/** Milliseconds for sorting / conflict resolution (Firestore Timestamp, ISO string, number). */
export function noteCreatedMs(n) {
    if (!n || typeof n !== "object") return 0;
    const c = n.createdAt;
    if (typeof c === "number" && Number.isFinite(c)) return c;
    if (c && typeof c.toMillis === "function") {
        try {
            return c.toMillis();
        } catch {
            return 0;
        }
    }
    if (c && typeof c === "object" && typeof c.seconds === "number") {
        return c.seconds * 1000 + Math.floor((c.nanoseconds || 0) / 1e6);
    }
    if (typeof c === "string") {
        const t = Date.parse(c);
        return Number.isFinite(t) ? t : 0;
    }
    return 0;
}

/** `users.beta_read_notes_by_book` may arrive as jsonb object or a JSON string. */
function parseNotesByBookJsonb(value) {
    let v = value;
    if (v == null) return {};
    if (typeof v === "string") {
        try {
            v = JSON.parse(v);
        } catch {
            return {};
        }
    }
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    return v;
}

/** Notes array for one book; value may be a stringified JSON array; book keys may differ by case. */
function notesArrayForBookFromMap(map, bookId) {
    const bid = normBookId(bookId);
    if (!bid || !map || typeof map !== "object" || Array.isArray(map)) return [];
    let raw = map[bid];
    if (raw == null) {
        const want = bid.toLowerCase();
        for (const k of Object.keys(map)) {
            if (normBookId(k).toLowerCase() === want) {
                raw = map[k];
                break;
            }
        }
    }
    return normalizeNotesArray(raw);
}

/**
 * Dedupe by id (newer createdAt wins). Keeps id-less notes via fingerprint (Firestore-era data).
 * Exported for beta-read.html so localStorage merge does not strip legacy rows.
 */
export function mergeBetaNoteArraysById(a, b) {
    const m = new Map();
    for (const list of [a, b]) {
        if (!Array.isArray(list)) continue;
        for (const n of list) {
            if (!n || typeof n !== "object") continue;
            const id = n.id != null ? String(n.id) : "";
            if (!id) continue;
            const prev = m.get(id);
            if (!prev || noteCreatedMs(n) > noteCreatedMs(prev)) m.set(id, n);
        }
    }
    const withIds = [...m.values()];
    const seenNoId = new Set();
    const noIdExtras = [];
    for (const list of [a, b]) {
        if (!Array.isArray(list)) continue;
        for (const n of list) {
            if (!n || typeof n !== "object") continue;
            const id = n.id != null ? String(n.id) : "";
            if (id) continue;
            const key = `${noteCreatedMs(n)}\0${String(n.quote || "").slice(0, 120)}\0${String(n.comment || "").slice(0, 120)}`;
            if (seenNoId.has(key)) continue;
            seenNoId.add(key);
            noIdExtras.push(n);
        }
    }
    return [...withIds, ...noIdExtras].sort((x, y) => noteCreatedMs(y) - noteCreatedMs(x));
}

/** Merge book ids that only differ by case into one bucket (canonical = first key seen). */
function mergeBookMapKeysInsensitive(map) {
    const m = map && typeof map === "object" && !Array.isArray(map) ? map : {};
    const by = new Map();
    for (const [k, v] of Object.entries(m)) {
        const nk = normBookId(k);
        if (!nk) continue;
        const arr = normalizeBookNotesList(v);
        if (!arr.length) continue;
        const lk = nk.toLowerCase();
        const prev = by.get(lk);
        if (!prev) by.set(lk, { key: nk, notes: arr });
        else prev.notes = mergeBetaNoteArraysById(prev.notes, arr);
    }
    const out = {};
    for (const { key, notes } of by.values()) out[key] = notes;
    return out;
}

function normalizeLegacyNotesMap(raw) {
    const parsed = parseNotesByBookJsonb(raw);
    const interim = {};
    for (const [k, v] of Object.entries(parsed)) {
        const nk = normBookId(k);
        if (!nk) continue;
        const arr = normalizeBookNotesList(v);
        if (!arr.length) continue;
        interim[nk] = arr;
    }
    return mergeBookMapKeysInsensitive(interim);
}

/** PostgREST is picky about jsonb RPC args; DB takes `p_notes_json` text. */
function rpcUpsertNotesJson(supabase, bookId, notesArr) {
    const bid = normBookId(bookId);
    const payload = JSON.stringify(Array.isArray(notesArr) ? notesArr : []);
    return supabase.rpc("reader_beta_notes_upsert", { p_book_id: bid, p_notes_json: payload });
}

async function legacyNotesMapForUser(supabase, uid) {
    const rpc = await supabase.rpc("reader_beta_notes_legacy_map");
    if (!rpc.error && rpc.data != null) {
        return { map: normalizeLegacyNotesMap(rpc.data), error: null };
    }
    if (rpc.error && !isLegacyMapRpcMissing(rpc.error)) {
        console.warn("reader_beta_notes_legacy_map", rpc.error);
    }
    const { data, error } = await supabase
        .from("users")
        .select("beta_read_notes_by_book")
        .eq("id", uid)
        .maybeSingle();
    if (error) {
        if (isMissingUsersBetaReadJsonbColumns(error)) return { map: {}, error: null };
        return { map: {}, error };
    }
    return {
        map: normalizeLegacyNotesMap(data?.beta_read_notes_by_book ?? data?.betaReadNotesByBook),
        error: null,
    };
}

async function legacyNotesForBook(supabase, uid, bookId) {
    const { map, error } = await legacyNotesMapForUser(supabase, uid);
    if (error) return { notes: [], error };
    return { notes: notesArrayForBookFromMap(map, bookId), error: null };
}

async function upsertBookNotesTable(supabase, uid, bookId, notesArr) {
    return supabase.from("reader_beta_notes").upsert(
        {
            user_id: uid,
            book_id: normBookId(bookId),
            notes: notesArr,
            updated_at: new Date().toISOString()
        },
        { onConflict: "user_id,book_id" }
    );
}

async function persistMergedIfLegacyDiffers(supabase, uid, bookId, rpcNotes, leg, merged) {
    const bid = normBookId(bookId);
    if (!bid || !Array.isArray(merged) || !merged.length) return;
    if (!Array.isArray(leg) || !leg.length) return;
    let differs = false;
    try {
        differs = JSON.stringify(merged) !== JSON.stringify(Array.isArray(rpcNotes) ? rpcNotes : []);
    } catch {
        differs = true;
    }
    if (!differs) return;
    const { error: e1 } = await rpcUpsertNotesJson(supabase, bid, merged);
    if (!e1) return;
    const { error: e2 } = await upsertBookNotesTable(supabase, uid, bid, merged);
    if (e2) console.warn("reader_beta_notes: could not persist merged legacy notes", e1, e2);
}

/**
 * All books → { [bookId]: notes[] } merged from reader_beta_notes + legacy users gaps.
 */
export async function fetchAllNotesMapMerged(supabase, uid) {
    await ensureAuthSession(supabase);
    const rpc = await supabase.rpc("reader_beta_notes_list_maps", {});
    if (!rpc.error && rpc.data != null && typeof rpc.data === "object" && !Array.isArray(rpc.data)) {
        const map = {};
        for (const [k, v] of Object.entries(rpc.data)) {
            const arr = normalizeBookNotesList(v);
            if (arr.length) map[k] = arr;
        }
        const { map: legacy, error: legErr } = await legacyNotesMapForUser(supabase, uid);
        if (legErr) return { map: mergeBookMapKeysInsensitive(map), error: legErr };
        for (const [k, v] of Object.entries(legacy)) {
            const legArr = normalizeBookNotesList(v);
            if (!legArr.length) continue;
            const cur = Array.isArray(map[k]) ? map[k] : [];
            map[k] = mergeBetaNoteArraysById(cur, legArr);
        }
        return { map: mergeBookMapKeysInsensitive(map), error: null };
    }

    const { data: rows, error: rErr } = await supabase
        .from("reader_beta_notes")
        .select("book_id, notes")
        .eq("user_id", uid);
    const map = {};
    if (!rErr && rows) {
        for (const r of rows) {
            const bid = r.book_id;
            if (bid) {
                const arr = normalizeNotesArray(r.notes);
                if (arr.length) map[bid] = arr;
            }
        }
    }
    if (rErr && isMissingReaderBetaNotesTable(rErr)) {
        const { map: leg, error } = await legacyNotesMapForUser(supabase, uid);
        return { map: mergeBookMapKeysInsensitive(leg || {}), error };
    }
    if (rErr) {
        const { map: leg, error: legErr } = await legacyNotesMapForUser(supabase, uid);
        if (!legErr && leg && Object.keys(leg).length) {
            return { map: mergeBookMapKeysInsensitive({ ...leg, ...map }), error: null };
        }
        return { map: mergeBookMapKeysInsensitive(map), error: rErr };
    }
    const { map: legacy, error: legErr } = await legacyNotesMapForUser(supabase, uid);
    if (legErr) return { map: mergeBookMapKeysInsensitive(map), error: legErr };
    for (const [k, v] of Object.entries(legacy)) {
        const legArr = normalizeBookNotesList(v);
        if (!legArr.length) continue;
        const cur = Array.isArray(map[k]) ? map[k] : [];
        map[k] = mergeBetaNoteArraysById(cur, legArr);
    }
    return { map: mergeBookMapKeysInsensitive(map), error: null };
}

/**
 * Notes for one book; migrates legacy into reader_beta_notes when possible.
 */
export async function fetchBookNotesMerged(supabase, uid, bookId) {
    const bid = normBookId(bookId);
    if (!uid || !bid) return { notes: [], error: null, legacyOnly: false };

    await ensureAuthSession(supabase);

    const rpcGet = await supabase.rpc("reader_beta_notes_get", { p_book_id: bid });
    if (!rpcGet.error) {
        const notes = normalizeNotesArray(rpcGet.data);
        const { notes: leg, error: lErr } = await legacyNotesForBook(supabase, uid, bid);
        if (lErr) return { notes: [], error: lErr, legacyOnly: false };
        const merged = mergeBetaNoteArraysById(notes, leg);
        await persistMergedIfLegacyDiffers(supabase, uid, bid, notes, leg, merged);
        return { notes: merged, error: null, legacyOnly: false };
    }

    const { data, error } = await supabase
        .from("reader_beta_notes")
        .select("notes")
        .eq("user_id", uid)
        .eq("book_id", bid)
        .maybeSingle();
    if (!error) {
        const notes = normalizeNotesArray(data?.notes);
        const { notes: leg, error: lErr } = await legacyNotesForBook(supabase, uid, bid);
        if (lErr) return { notes: [], error: lErr, legacyOnly: false };
        const merged = mergeBetaNoteArraysById(notes, leg);
        await persistMergedIfLegacyDiffers(supabase, uid, bid, notes, leg, merged);
        return { notes: merged, error: null, legacyOnly: false };
    }
    if (isMissingReaderBetaNotesTable(error)) {
        const { notes, error: lErr } = await legacyNotesForBook(supabase, uid, bid);
        return { notes, error: lErr, legacyOnly: true };
    }
    const { notes: leg, error: lErr } = await legacyNotesForBook(supabase, uid, bid);
    if (!lErr && leg.length) {
        return { notes: leg, error: null, legacyOnly: true };
    }
    return { notes: leg, error: error || lErr, legacyOnly: false };
}

/**
 * Append one note: RPC upsert first, then REST table, then legacy users.
 */
export async function appendNoteViaReaderTable(supabase, uid, bookId, note) {
    const bid = normBookId(bookId);
    if (!uid || !bid) return { useLegacyUsers: true, error: null };

    await ensureAuthSession(supabase);

    const rpcGet = await supabase.rpc("reader_beta_notes_get", { p_book_id: bid });
    if (!rpcGet.error) {
        const prevRpc = normalizeNotesArray(rpcGet.data);
        const { notes: leg, error: lE } = await legacyNotesForBook(supabase, uid, bid);
        const prev = lE ? prevRpc : mergeBetaNoteArraysById(prevRpc, leg);
        const next = [...prev, note];
        const rpcUp = await rpcUpsertNotesJson(supabase, bid, next);
        if (!rpcUp.error) return { useLegacyUsers: false, error: null, notes: next };
        const tbl = await upsertBookNotesTable(supabase, uid, bid, next);
        if (!tbl.error) return { useLegacyUsers: false, error: null, notes: next };
        return { useLegacyUsers: true, error: null };
    }

    const { data, error: selErr } = await supabase
        .from("reader_beta_notes")
        .select("notes")
        .eq("user_id", uid)
        .eq("book_id", bid)
        .maybeSingle();
    if (selErr && isMissingReaderBetaNotesTable(selErr)) {
        return { useLegacyUsers: true, error: null };
    }
    if (selErr) {
        return { useLegacyUsers: true, error: null };
    }
    const prevRpc = normalizeNotesArray(data?.notes);
    const { notes: leg, error: lE } = await legacyNotesForBook(supabase, uid, bid);
    const prev = lE ? prevRpc : mergeBetaNoteArraysById(prevRpc, leg);
    const next = [...prev, note];
    const { error: upErr } = await upsertBookNotesTable(supabase, uid, bid, next);
    if (upErr) {
        return { useLegacyUsers: true, error: null };
    }
    return { useLegacyUsers: false, error: null, notes: next };
}
