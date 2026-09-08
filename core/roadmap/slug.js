export function padStub(n) {
    return String(n).padStart(3, "0");
}

export function slugTitle(title) {
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

export function folderName(stub, title) {
    return `${padStub(stub)}-${slugTitle(title)}`;
}

export function sanitizeFileName(name) {
    const base = String(name || "").split(/[/\\]/).pop() || "";
    const cleaned = base
        .replace(/[^A-Za-z0-9._-]/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 80);
    return cleaned || "file";
}

export function uniqueFileName(name, taken) {
    const safe = sanitizeFileName(name);
    if (!taken.has(safe)) {
        taken.add(safe);
        return safe;
    }
    const dot = safe.lastIndexOf(".");
    const stem = dot > 0 ? safe.slice(0, dot) : safe;
    const ext = dot > 0 ? safe.slice(dot) : "";
    let n = 2;
    let next = `${stem}-${n}${ext}`;
    while (taken.has(next)) {
        n += 1;
        next = `${stem}-${n}${ext}`;
    }
    taken.add(next);
    return next;
}
