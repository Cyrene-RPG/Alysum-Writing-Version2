const {
    padStub,
    folderName,
    whatTheySaidText,
    moduleSource,
    inboxSource,
} = require("./readable-source.js");

const DEFAULT_REPO = "Cyrene-RPG/Alysum-Writing-Version2";
const DEFAULT_BRANCH = "main";
const API = "https://api.github.com";

function githubHeaders(token) {
    return {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "alysum-roadmap-submit",
    };
}

async function githubJson(token, method, path, body) {
    const res = await fetch(`${API}${path}`, {
        method,
        headers: {
            ...githubHeaders(token),
            ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = {};
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = { message: text };
    }
    if (!res.ok) {
        const err = new Error(data.message || `GitHub ${res.status}`);
        err.status = res.status;
        throw err;
    }
    return data;
}

async function putBlob(token, repo, content, encoding) {
    const data = await githubJson(token, "POST", `/repos/${repo}/git/blobs`, {
        content,
        encoding,
    });
    return data.sha;
}

function parseInbox(text) {
    const bugs = [];
    const suggestions = [];
    const importRe = /import (bug|suggestion)(\d+) from "\.\/submissions\/(bugs|suggestions)\/([^"]+)\/(?:report|suggestion)\.js";/g;
    let match;
    while ((match = importRe.exec(text || ""))) {
        const row = { stub: Number(match[2]), folder: match[4] };
        if (match[3] === "bugs") bugs.push(row);
        else suggestions.push(row);
    }
    return { bugs, suggestions };
}

async function downloadStaging(url) {
    const res = await fetch(url);
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length") || 0);
    if (len > 25 * 1024 * 1024) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 25 * 1024 * 1024) return null;
    return buf;
}

async function writeSubmission({ token, repo, branch, entry, stagingFiles }) {
    const folder = folderName(entry.stub, entry.title);
    const kindDir = entry.kind === "bug" ? "bugs" : "suggestions";
    const base = `applications/roadmap/submissions/${kindDir}/${folder}`;
    const moduleName = entry.kind === "bug" ? "report.js" : "suggestion.js";

    const ref = await githubJson(token, "GET", `/repos/${repo}/git/ref/heads/${branch}`);
    const commitSha = ref.object.sha;
    const commit = await githubJson(token, "GET", `/repos/${repo}/git/commits/${commitSha}`);
    const baseTree = commit.tree.sha;

    const tree = [];
    const writtenFiles = [];

    tree.push({
        path: `${base}/${moduleName}`,
        mode: "100644",
        type: "blob",
        sha: await putBlob(token, repo, moduleSource(entry), "utf-8"),
    });
    tree.push({
        path: `${base}/what-they-said.txt`,
        mode: "100644",
        type: "blob",
        sha: await putBlob(token, repo, whatTheySaidText({ ...entry, files: stagingFiles }), "utf-8"),
    });

    for (const file of stagingFiles || []) {
        const url = file.publicUrl;
        if (!url) continue;
        const buf = await downloadStaging(url);
        if (!buf) continue;
        writtenFiles.push(file.name);
        tree.push({
            path: `${base}/${file.name}`,
            mode: "100644",
            type: "blob",
            sha: await putBlob(token, repo, buf.toString("base64"), "base64"),
        });
    }

    let inboxText = "";
    try {
        const inbox = await githubJson(
            token,
            "GET",
            `/repos/${repo}/contents/applications/roadmap/inbox.js?ref=${encodeURIComponent(branch)}`
        );
        inboxText = Buffer.from(inbox.content || "", "base64").toString("utf8");
    } catch {
        inboxText = "";
    }
    const parsed = parseInbox(inboxText);
    const next = { stub: entry.stub, folder };
    if (entry.kind === "bug") {
        parsed.bugs = [next, ...parsed.bugs.filter((row) => row.stub !== entry.stub)];
    } else {
        parsed.suggestions = [next, ...parsed.suggestions.filter((row) => row.stub !== entry.stub)];
    }
    tree.push({
        path: "applications/roadmap/inbox.js",
        mode: "100644",
        type: "blob",
        sha: await putBlob(token, repo, inboxSource(parsed.bugs, parsed.suggestions), "utf-8"),
    });

    const newTree = await githubJson(token, "POST", `/repos/${repo}/git/trees`, {
        base_tree: baseTree,
        tree,
    });
    const message =
        entry.kind === "bug"
            ? `roadmap: add bug ${padStub(entry.stub)}-${folder.slice(4)}`
            : `roadmap: add suggestion ${padStub(entry.stub)}-${folder.slice(4)}`;
    const newCommit = await githubJson(token, "POST", `/repos/${repo}/git/commits`, {
        message,
        tree: newTree.sha,
        parents: [commitSha],
    });
    try {
        await githubJson(token, "PATCH", `/repos/${repo}/git/refs/heads/${branch}`, {
            sha: newCommit.sha,
        });
    } catch (err) {
        if (err.status !== 422) throw err;
        const again = await githubJson(token, "GET", `/repos/${repo}/git/ref/heads/${branch}`);
        await githubJson(token, "PATCH", `/repos/${repo}/git/refs/heads/${branch}`, {
            sha: newCommit.sha,
        });
        void again;
    }

    return { folder, files: writtenFiles };
}

module.exports = {
    DEFAULT_REPO,
    DEFAULT_BRANCH,
    folderName,
    writeSubmission,
};
