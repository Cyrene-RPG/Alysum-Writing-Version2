/**
 * Plot Doctor — orchestrator. Owns: scan scheduling (debounced), running detectors,
 * diffing against persisted state, and notifying subscribers (the sidebar).
 *
 * Detectors are pure functions that take `ScanInput` and return `PlotIssue[]`.
 */

import { htmlToPlainText } from "./util/text.js?v=1";
import { listBibleCharacters, listBiblePlaces } from "../story-bible-api.js?v=7";
import {
    listIssuesForBook,
    insertIssues,
    updateIssue,
    transitionIssues,
    deleteStaleBefore
} from "./store.js?v=1";
import { runAttributeDetector } from "./detectors/attribute.js?v=1";
import { runNameDriftDetector } from "./detectors/name-drift.js?v=1";
import { runDeadSpeaksDetector } from "./detectors/dead-speaks.js?v=1";
import { PLOT_STATUS } from "./types.js?v=1";

const DEBOUNCE_MS = 2500;
const STALE_HARD_DELETE_DAYS = 14;

/**
 * @param {object} opts
 * @param {import("@supabase/supabase-js").SupabaseClient} opts.supabase
 * @param {() => { uid: string | null }} opts.getSession
 * @param {() => { bookId: string, chapters: Array<{ id: string, section: string, title: string, content: string }> }} opts.getManuscript
 * @param {(state: OrchestratorState) => void} [opts.onChange]
 */
export function createOrchestrator(opts) {
    const { supabase, getSession, getManuscript, onChange } = opts;

    /** @typedef {{ issues: Array<Record<string, any>>, scanning: boolean, lastScannedAt: number, lastError: string }} OrchestratorState */
    /** @type {OrchestratorState} */
    const state = {
        issues: [],
        scanning: false,
        lastScannedAt: 0,
        lastError: ""
    };

    let debounceTimer = null;
    let scanInFlight = false;
    let pendingRescan = false;

    function notify() {
        try {
            onChange?.({ ...state });
        } catch (e) {
            console.error("[plot-doctor] subscriber error:", e);
        }
    }

    function isReady() {
        const sess = getSession?.();
        const ms = getManuscript?.();
        return !!(sess && sess.uid && ms && ms.bookId && Array.isArray(ms.chapters));
    }

    async function loadInitial() {
        const sess = getSession?.();
        const ms = getManuscript?.();
        if (!sess?.uid || !ms?.bookId) return;
        try {
            const rows = await listIssuesForBook(supabase, sess.uid, ms.bookId);
            state.issues = rows;
            notify();
        } catch (e) {
            console.error("[plot-doctor] initial load failed:", e);
            state.lastError = "Could not load plot issues.";
            notify();
        }
    }

    function buildScanInput() {
        const ms = getManuscript();
        const chapters = (ms.chapters || []).map((ch, i) => ({
            id: ch.id,
            section: ch.section,
            index: i,
            title: ch.title || "",
            contentHtml: ch.content || "",
            plainText: htmlToPlainText(ch.content || "")
        }));
        return { bookId: ms.bookId, chapters };
    }

    async function loadBibleSnapshot(bookId) {
        const sess = getSession();
        if (!sess?.uid) return { characters: [], places: [] };
        const [characters, places] = await Promise.all([
            listBibleCharacters(supabase, sess.uid, bookId),
            listBiblePlaces(supabase, sess.uid, bookId)
        ]);
        return { characters, places };
    }

    function runAllDetectors(scanInput) {
        const detectors = [
            { name: "attr", fn: runAttributeDetector },
            { name: "namedrift", fn: runNameDriftDetector },
            { name: "deadspeaks", fn: runDeadSpeaksDetector }
        ];
        const out = [];
        for (const d of detectors) {
            try {
                const t0 = performance.now();
                const result = d.fn(scanInput) || [];
                const dt = Math.round(performance.now() - t0);
                console.log(`[plot-doctor] ${d.name} produced ${result.length} issue(s) in ${dt}ms`);
                out.push(...result);
            } catch (e) {
                console.error(`[plot-doctor] detector ${d.name} failed:`, e);
            }
        }
        return out;
    }

    function newRowFromIssue(issue, uid, bookId) {
        const nowIso = new Date().toISOString();
        return {
            user_id: uid,
            book_id: bookId,
            chapter_id: issue.chapterId || "",
            chapter_section: issue.chapterSection || "",
            category: issue.category,
            severity: issue.severity,
            confidence: issue.confidence,
            claim_text: (issue.claimText || "").slice(0, 240),
            claim_range_start: issue.claimRangeStart,
            claim_range_end: issue.claimRangeEnd,
            evidence_kind: issue.evidenceKind || "",
            evidence_ref: issue.evidenceRef || "",
            evidence_summary: issue.evidenceSummary || "",
            engine: issue.engine || "",
            dedupe_key: issue.dedupeKey,
            status: PLOT_STATUS.OPEN,
            user_note: "",
            first_seen_at: nowIso,
            last_seen_at: nowIso,
            resolved_at: null
        };
    }

    async function persistDiff(newIssues, existing) {
        const sess = getSession();
        const ms = getManuscript();
        if (!sess?.uid || !ms?.bookId) return existing;
        const byKey = new Map();
        for (const row of existing) byKey.set(row.dedupe_key, row);

        const inserts = [];
        const updates = [];
        const reopen = [];
        const matchedKeys = new Set();

        for (const issue of newIssues) {
            const key = issue.dedupeKey;
            matchedKeys.add(key);
            const existingRow = byKey.get(key);
            if (!existingRow) {
                inserts.push(newRowFromIssue(issue, sess.uid, ms.bookId));
                continue;
            }
            if (existingRow.status === PLOT_STATUS.DISMISSED) continue;
            if (existingRow.status === PLOT_STATUS.STALE || existingRow.status === PLOT_STATUS.FIXED) {
                reopen.push(existingRow.id);
            }
            updates.push({
                id: existingRow.id,
                patch: {
                    last_seen_at: new Date().toISOString(),
                    claim_text: (issue.claimText || "").slice(0, 240),
                    claim_range_start: issue.claimRangeStart,
                    claim_range_end: issue.claimRangeEnd,
                    evidence_summary: issue.evidenceSummary || existingRow.evidence_summary,
                    confidence: issue.confidence
                }
            });
        }

        const staleIds = existing
            .filter(row => row.status === PLOT_STATUS.OPEN && !matchedKeys.has(row.dedupe_key))
            .map(row => row.id);

        try {
            const inserted = await insertIssues(supabase, inserts);
            for (const row of inserted) byKey.set(row.dedupe_key, row);

            await Promise.all(updates.map(u => updateIssue(supabase, u.id, u.patch)));
            if (reopen.length) await transitionIssues(supabase, reopen, PLOT_STATUS.OPEN);
            if (staleIds.length) await transitionIssues(supabase, staleIds, PLOT_STATUS.STALE);

            const refreshed = await listIssuesForBook(supabase, sess.uid, ms.bookId);
            return refreshed;
        } catch (e) {
            console.error("[plot-doctor] diff/persist failed:", e);
            state.lastError = "Could not save plot issues.";
            return existing;
        }
    }

    async function runScanNow() {
        if (!isReady()) return;
        if (scanInFlight) {
            pendingRescan = true;
            return;
        }
        scanInFlight = true;
        state.scanning = true;
        state.lastError = "";
        notify();

        const t0 = performance.now();
        try {
            const sess = getSession();
            const ms = getManuscript();
            const scanInput = buildScanInput();
            const bible = await loadBibleSnapshot(ms.bookId);
            const fullInput = { ...scanInput, characters: bible.characters, places: bible.places };
            const newIssues = runAllDetectors(fullInput);
            const existing = await listIssuesForBook(supabase, sess.uid, ms.bookId);
            state.issues = await persistDiff(newIssues, existing);
            state.lastScannedAt = Date.now();
            const dt = Math.round(performance.now() - t0);
            console.log(
                `[plot-doctor] scan complete in ${dt}ms — ${newIssues.length} detected, ${state.issues.length} persisted`
            );
        } catch (e) {
            console.error("[plot-doctor] scan failed:", e);
            state.lastError = "Scan failed. Try again.";
        } finally {
            scanInFlight = false;
            state.scanning = false;
            notify();
            if (pendingRescan) {
                pendingRescan = false;
                setTimeout(() => void runScanNow(), 0);
            }
        }
    }

    function scheduleScan() {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            debounceTimer = null;
            void runScanNow();
        }, DEBOUNCE_MS);
    }

    async function applyTriage(issueId, nextStatus, userNote) {
        try {
            await updateIssue(supabase, issueId, {
                status: nextStatus,
                user_note: userNote || "",
                resolved_at: nextStatus === PLOT_STATUS.OPEN ? null : new Date().toISOString()
            });
            const row = state.issues.find(r => r.id === issueId);
            if (row) {
                row.status = nextStatus;
                row.user_note = userNote || "";
                row.resolved_at = nextStatus === PLOT_STATUS.OPEN ? null : new Date().toISOString();
            }
            notify();
        } catch (e) {
            console.error("[plot-doctor] triage failed:", e);
            state.lastError = "Could not update issue status.";
            notify();
        }
    }

    async function sweepHardDeleteStale() {
        const sess = getSession();
        const ms = getManuscript();
        if (!sess?.uid || !ms?.bookId) return;
        const cutoff = new Date(Date.now() - STALE_HARD_DELETE_DAYS * 24 * 60 * 60 * 1000);
        try {
            await deleteStaleBefore(supabase, sess.uid, ms.bookId, cutoff);
        } catch (e) {
            console.warn("[plot-doctor] stale sweep failed:", e);
        }
    }

    return {
        getState: () => ({ ...state }),
        loadInitial,
        runScanNow,
        scheduleScan,
        applyTriage,
        sweepHardDeleteStale
    };
}
