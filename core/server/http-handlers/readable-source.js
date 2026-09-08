function padStub(n) {
    return String(n).padStart(3, "0");
}

function slugTitle(title) {
    const slug = String(title || "")
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40)
        .replace(/^-|-$/g, "");
    return slug || "untitled";
}

function folderName(stub, title) {
    return `${padStub(stub)}-${slugTitle(title)}`;
}

function sanitizeFileName(name) {
    const base = String(name || "").split(/[/\\]/).pop() || "";
    const cleaned = base
        .replace(/[^A-Za-z0-9._-]/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 80);
    return cleaned || "file";
}

function safeComment(text) {
    return String(text || "").replace(/\*\//g, "* /");
}

function jsString(value) {
    return JSON.stringify(String(value || ""));
}

function whatTheySaidText(entry) {
    const when = entry.createdAt ? String(entry.createdAt).slice(0, 10) : "";
    const files = (entry.files || []).map((f) => f.name || f).filter(Boolean);
    const lines = [
        "WHAT THEY SAID",
        "==============",
        `Title: ${entry.title || ""}`,
        "",
        entry.body || "(no description)",
        "",
        `Filed by: user:${entry.authorUsername || "anon"}`,
        when ? `When: ${when}` : "",
        entry.kind === "bug" ? `Severity: ${entry.severity || "normal"}` : "",
        files.length ? `Files in this folder: ${files.join(", ")}` : "",
        "",
        "YOUR JOB",
        "========",
        entry.kind === "bug"
            ? 'Open report.js and set status to "ack" or "fixed", then commit.'
            : 'To put this on the roadmap: copy title + body into items.js, then set status to "promoted" in suggestion.js.',
    ];
    return lines.filter((line, i) => line !== "" || lines[i + 1] !== "").join("\n") + "\n";
}

function moduleSource(entry) {
    const fileNames = (entry.files || []).map((f) => f.name || f).filter(Boolean);
    const status = entry.kind === "bug" ? entry.status || "open" : entry.status || "under-review";
    const job =
        entry.kind === "bug"
            ? 'Change status to "ack" when you start, "fixed" when done. Then commit this folder.'
            : 'Copy title and body into items.js (zone: "planned"), then set status to "promoted".';
    return `/**
 * WHAT THEY SAID
 * ==============
 * Title: ${safeComment(entry.title)}
 *
 * ${safeComment(entry.body || "(no description)").split("\n").join("\n * ")}
 *
 * Filed by: user:${safeComment(entry.authorUsername || "anon")}
 * When: ${safeComment(String(entry.createdAt || "").slice(0, 10))}
${entry.kind === "bug" ? ` * Severity: ${safeComment(entry.severity || "normal")}\n` : ""} *
 * YOUR JOB
 * ========
 * ${job}
 */
export default {
  stub: ${Number(entry.stub)},
  kind: ${jsString(entry.kind)},
  title: ${jsString(entry.title)},
  body: ${jsString(entry.body)},
${entry.kind === "bug" ? `  severity: ${jsString(entry.severity || "normal")},\n` : ""}  status: ${jsString(status)},
  authorUsername: ${jsString(entry.authorUsername || "")},
  authorUserId: ${jsString(entry.authorUserId || "")},
  createdAt: ${jsString(entry.createdAt || "")},
  files: ${JSON.stringify(fileNames)},
};
`;
}

function inboxSource(bugs, suggestions) {
    const importLines = [];
    const bugNames = [];
    const sugNames = [];
    for (const row of bugs) {
        const name = `bug${padStub(row.stub)}`;
        importLines.push(`import ${name} from "./submissions/bugs/${row.folder}/report.js";`);
        bugNames.push(name);
    }
    for (const row of suggestions) {
        const name = `suggestion${padStub(row.stub)}`;
        importLines.push(`import ${name} from "./submissions/suggestions/${row.folder}/suggestion.js";`);
        sugNames.push(name);
    }
    return [
        "/** Generated when someone files a report or suggestion.",
        " * Do not hand-edit — open the folder under submissions/ instead.",
        " */",
        ...importLines,
        importLines.length ? "" : "",
        `export const bugReports = [${bugNames.join(", ")}];`,
        `export const featureSuggestions = [${sugNames.join(", ")}];`,
        "",
    ].join("\n");
}

module.exports = {
    padStub,
    folderName,
    sanitizeFileName,
    whatTheySaidText,
    moduleSource,
    inboxSource,
};
