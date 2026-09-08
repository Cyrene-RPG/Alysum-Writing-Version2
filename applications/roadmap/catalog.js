import { ROADMAP_ITEMS } from "./items.js";
import { bugReports, featureSuggestions } from "./inbox.js";
import { folderName } from "@alysum/roadmap/slug.js";

const ZONES = new Set(["planned", "progress", "done"]);

export function relativeLabel(iso) {
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return "";
    const delta = Date.now() - ms;
    if (delta < 60 * 1000) return "just now";
    const mins = Math.round(delta / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days < 14) return `${days}d ago`;
    const weeks = Math.round(days / 7);
    if (weeks < 8) return `${weeks}w ago`;
    const when = new Date(ms);
    const month = String(when.getMonth() + 1).padStart(2, "0");
    const day = String(when.getDate()).padStart(2, "0");
    return `${month}.${day}`;
}

export function authorLabel(username) {
    const handle = String(username || "").trim();
    if (handle.toLowerCase() === "anonymous") return "anonymous";
    return `user:${handle || "anon"}`;
}

function indexByStub(rows) {
    const map = new Map();
    for (const row of rows || []) {
        if (row && row.stub != null) map.set(Number(row.stub), row);
    }
    return map;
}

function fileUrls(kind, row) {
    const names = Array.isArray(row.files) ? row.files : [];
    const folder = row.folderName || folderName(row.stub, row.title);
    return names.map((file) => {
        if (typeof file === "string") {
            return {
                name: file,
                url: `/applications/roadmap/submissions/${kind}/${folder}/${file}`,
            };
        }
        const name = file?.name || "file";
        const url =
            file?.publicUrl ||
            (file?.stagingPath ? null : `/applications/roadmap/submissions/${kind}/${folder}/${name}`);
        return { name, url: url || file?.publicUrl || "" };
    });
}

function mergeKind(kind, committed, pending, voteMap, myVotes, replyCounts, downMap, myDowns) {
    const byStub = indexByStub(committed);
    for (const row of pending || []) {
        const stub = Number(row.stub);
        if (!byStub.has(stub)) byStub.set(stub, row);
    }
    const list = [...byStub.values()].map((row) => {
        const stub = Number(row.stub);
        const key = `${kind}:${stub}`;
        return {
            stub,
            kind,
            title: row.title || "",
            body: row.body || "",
            severity: row.severity || "",
            status: row.status || (kind === "bug" ? "open" : "under-review"),
            authorUsername: row.authorUsername || "",
            authorUserId: row.authorUserId || "",
            createdAt: row.createdAt || "",
            folderName: row.folderName || folderName(stub, row.title),
            files: fileUrls(kind === "bug" ? "bugs" : "suggestions", row),
            votes: voteMap.get(key) || 0,
            voted: myVotes.has(key),
            downs: downMap.get(key) || 0,
            downVoted: myDowns.has(key),
            replyCount: replyCounts.get(stub) || 0,
            relative: relativeLabel(row.createdAt),
            author: authorLabel(row.authorUsername),
        };
    });
    list.sort((a, b) => b.stub - a.stub);
    return list;
}

export async function loadCatalog({
    pendingBugs = [],
    pendingSuggestions = [],
    voteMap = new Map(),
    myVotes = new Set(),
    downMap = new Map(),
    myDowns = new Set(),
    replyCounts = new Map(),
} = {}) {
    const items = (ROADMAP_ITEMS || []).filter((item) => ZONES.has(item.zone));
    const bugs = mergeKind("bug", bugReports, pendingBugs, voteMap, myVotes, replyCounts, downMap, myDowns);
    const suggestions = mergeKind(
        "suggestion",
        featureSuggestions,
        pendingSuggestions,
        voteMap,
        myVotes,
        replyCounts,
        downMap,
        myDowns
    ).filter((row) => row.status !== "promoted");
    return { items, bugs, suggestions };
}
