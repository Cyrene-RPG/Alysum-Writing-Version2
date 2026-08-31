import { supabase } from "@alysum/authentication/client.js";
import { resolveStudioSession } from "@alysum/desktop/studio-session.js";
import { fetchPublishedWork } from "@alysum/library/work.js?v=2";
import { countWordsInHtml } from "@alysum/writing-engine/word-count.js";
import { mountReaderThemes } from "./reader-theme.js?v=6";
import { mountReaderEnd } from "./reader-end.js?v=4";

const READ_KEY = "alysum:library:read-position";
const DONE_KEY = "alysum:library:finished-chapters";
const BOOK_KEY = "alysum:library:bookmarks";
const PREF_KEY = "alysum:reader:prefs";
const SIZE_MIN = 80;
const SIZE_MAX = 140;
const SIZE_STEP = 10;
const FACES = ["serif", "sans", "dyslexic"];
const SPACES = ["compact", "comfortable", "relaxed"];

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function bookIdFromUrl() {
    return new URLSearchParams(window.location.search).get("id") || "";
}

function chapterFromUrl() {
    return new URLSearchParams(window.location.search).get("chapter") || "";
}

function readJson(key, fallback) {
    try {
        const raw = JSON.parse(localStorage.getItem(key) || "{}");
        return raw && typeof raw === "object" ? raw : fallback;
    } catch {
        return fallback;
    }
}

function writeJson(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        /* ignore quota */
    }
}

function readPrefs() {
    const raw = readJson(PREF_KEY, {});
    const size = Number(raw.size);
    return {
        size: Number.isFinite(size) ? Math.min(SIZE_MAX, Math.max(SIZE_MIN, size)) : 100,
        face: FACES.includes(raw.face) ? raw.face : "serif",
        spacing: SPACES.includes(raw.spacing) ? raw.spacing : "comfortable",
    };
}

function chapterHtml(content) {
    const raw = String(content || "").trim();
    if (!raw) return "<p>(This chapter has no text yet.)</p>";
    if (/<[a-z][\s\S]*>/i.test(raw)) return raw;
    return raw.split(/\n{2,}/).map((part) => `<p>${escapeHtml(part).replace(/\n/g, "<br>")}</p>`).join("");
}

function applyAuthorIndents(root) {
    if (!root) return;
    const paras = [...root.querySelectorAll(":scope > p")];
    const hasFlush = paras.some((p) => p.classList.contains("alysum-flush"));
    const hasIndent = paras.some((p) => p.classList.contains("alysum-indent"));
    root.classList.toggle("is-auto-indent", hasIndent || !hasFlush);
}

function formatWords(n) {
    return `${Number(n || 0).toLocaleString()} word${n === 1 ? "" : "s"}`;
}

function minutesFor(words) {
    return Math.max(words ? 1 : 0, Math.round(Number(words || 0) / 200));
}

function applyPrefs(prefs) {
    const root = document.documentElement;
    root.dataset.readerFace = prefs.face;
    root.dataset.readerSpace = prefs.spacing;
    root.style.setProperty("--reader-size", `${(19 * prefs.size) / 100}px`);
    document.getElementById("sizeLabel").textContent = `${prefs.size}%`;
    document.querySelectorAll("[data-face]").forEach((el) => {
        el.classList.toggle("is-on", el.dataset.face === prefs.face);
    });
    document.querySelectorAll("[data-space]").forEach((el) => {
        el.classList.toggle("is-on", el.dataset.space === prefs.spacing);
    });
}

function setDrawer(open) {
    document.getElementById("settingsDrawer").hidden = !open;
    document.getElementById("settingsScrim").hidden = !open;
    document.getElementById("settingsBtn").classList.toggle("is-on", open);
    document.getElementById("settingsBtn").setAttribute("aria-expanded", open ? "true" : "false");
}

function setPicker(open) {
    document.getElementById("chapterPicker").hidden = !open;
    document.getElementById("pickerBtn").setAttribute("aria-expanded", open ? "true" : "false");
}

function isBookmarked(id) {
    const map = readJson(BOOK_KEY, {});
    return Boolean(map[id]);
}

function toggleBookmark(id) {
    const map = readJson(BOOK_KEY, {});
    if (map[id]) delete map[id];
    else map[id] = true;
    writeJson(BOOK_KEY, map);
    return Boolean(map[id]);
}

function paintBookmark(on) {
    const btn = document.getElementById("bookmarkBtn");
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
}

function scrollRatio(el) {
    const max = el.scrollHeight - el.clientHeight;
    if (max <= 24) return 1;
    return Math.min(1, Math.max(0, el.scrollTop / max));
}

function readFinished(bookId) {
    const map = readJson(DONE_KEY, {});
    const row = map[bookId];
    return row && typeof row === "object" ? { ...row } : {};
}

function writeFinished(bookId, done) {
    const map = readJson(DONE_KEY, {});
    map[bookId] = done;
    writeJson(DONE_KEY, map);
}

function showEmpty(id) {
    document.getElementById("readerRoot").hidden = true;
    document.getElementById("readerEmpty").hidden = false;
    const back = document.getElementById("emptyBack");
    if (back && id) back.href = `/book?id=${encodeURIComponent(id)}`;
}

async function boot() {
    const prefs = readPrefs();
    applyPrefs(prefs);

    const id = bookIdFromUrl();
    const work = id ? await fetchPublishedWork(supabase, id) : null;
    if (!work || !work.chapters?.length) {
        showEmpty(id);
        return;
    }

    document.title = `${work.title || "Untitled"} — Alysum`;
    document.getElementById("bookTitle").textContent = work.title || "Untitled";
    document.getElementById("readerRoot").hidden = false;
    const back = document.getElementById("readerBack");
    if (back) back.href = `/book?id=${encodeURIComponent(work.id)}`;
    paintBookmark(isBookmarked(work.id));
    mountReaderThemes(document.getElementById("themeSwatches"), work);
    const session = await resolveStudioSession(supabase);

    const progressMap = readJson(READ_KEY, {});
    const saved = progressMap[work.id] || {};
    const fromUrl = chapterFromUrl();
    let index = work.chapters.findIndex((chapter) => chapter.id === fromUrl);
    if (index < 0) index = work.chapters.findIndex((chapter) => chapter.id === saved.chapterId);
    if (index < 0) index = 0;
    const finished = readFinished(work.id);

    const scrollEl = document.getElementById("readerScroll");
    const DONE = 0.97;

    function markFinished() {
        const id = work.chapters[index]?.id;
        if (!id || finished[id]) return;
        finished[id] = true;
        writeFinished(work.id, finished);
    }

    function atEnd() {
        return scrollRatio(scrollEl) >= DONE;
    }

    function canOpen(i) {
        if (i <= index) return true;
        for (let k = index; k < i; k += 1) {
            if (!finished[work.chapters[k].id]) return false;
        }
        return true;
    }

    function syncLocks() {
        const last = index >= work.chapters.length - 1;
        const unlocked = last || Boolean(finished[work.chapters[index]?.id]) || atEnd();
        if (unlocked && !last) markFinished();
        document.getElementById("nextBtn").disabled = last || !unlocked;
        document.querySelectorAll("#chapterPicker [data-index]").forEach((btn) => {
            const i = Number(btn.dataset.index);
            btn.disabled = !canOpen(i);
        });
    }

    function persist(ratio) {
        const total = work.chapters.length;
        const progress = Math.round(((index + ratio) / total) * 100);
        progressMap[work.id] = {
            progress,
            chapterId: work.chapters[index].id,
            updated: Date.now(),
        };
        writeJson(READ_KEY, progressMap);
        document.getElementById("progressPct").textContent = `${progress}%`;
        document.getElementById("progressFill").style.width = `${progress}%`;
        const url = new URL(window.location.href);
        url.searchParams.set("id", work.id);
        url.searchParams.set("chapter", work.chapters[index].id);
        history.replaceState(null, "", `${url.pathname}${url.search}`);
        if (ratio >= DONE) {
            markFinished();
            syncLocks();
        }
    }

    function render() {
        const chapter = work.chapters[index];
        const words = chapter.wordCount || countWordsInHtml(chapter.content);
        document.getElementById("chapterTitle").textContent = chapter.title;
        document.getElementById("chapterMeta").textContent =
            `${minutesFor(words)} min · ${formatWords(words)}`;
        const body = document.getElementById("chapterBody");
        body.innerHTML = chapterHtml(chapter.content);
        applyAuthorIndents(body);
        document.getElementById("pickerLabel").textContent =
            `Chapter ${index + 1} of ${work.chapters.length}`;
        document.getElementById("prevBtn").disabled = index <= 0;
        document.getElementById("nextBtn").disabled =
            index >= work.chapters.length - 1 || !finished[chapter.id];
        document.getElementById("chapterPicker").innerHTML = work.chapters.map((item, i) =>
            `<button type="button" role="option" data-index="${i}" class="${i === index ? "is-on" : ""}">${escapeHtml(item.title)}</button>`
        ).join("");
        scrollEl.scrollTop = 0;
        persist(0);
        setPicker(false);
        mountReaderEnd({
            work,
            chapterId: chapter.id,
            supabase,
            session,
            onLayout() {
                if (atEnd()) markFinished();
                syncLocks();
            },
        });
    }

    document.getElementById("prevBtn").addEventListener("click", () => {
        if (index > 0) { index -= 1; render(); }
    });
    document.getElementById("nextBtn").addEventListener("click", () => {
        if (document.getElementById("nextBtn").disabled) return;
        if (index < work.chapters.length - 1) { index += 1; render(); }
    });
    document.getElementById("pickerBtn").addEventListener("click", (event) => {
        event.stopPropagation();
        setPicker(document.getElementById("chapterPicker").hidden);
    });
    document.getElementById("chapterPicker").addEventListener("click", (event) => {
        const btn = event.target.closest("[data-index]");
        if (!btn || btn.disabled) return;
        index = Number(btn.dataset.index) || 0;
        render();
    });
    document.getElementById("bookmarkBtn").addEventListener("click", () => {
        paintBookmark(toggleBookmark(work.id));
    });
    document.getElementById("settingsBtn").addEventListener("click", () => {
        setDrawer(document.getElementById("settingsDrawer").hidden);
    });
    document.getElementById("settingsClose").addEventListener("click", () => setDrawer(false));
    document.getElementById("settingsScrim").addEventListener("click", () => setDrawer(false));
    document.getElementById("sizeDown").addEventListener("click", () => {
        prefs.size = Math.max(SIZE_MIN, prefs.size - SIZE_STEP);
        writeJson(PREF_KEY, prefs);
        applyPrefs(prefs);
    });
    document.getElementById("sizeUp").addEventListener("click", () => {
        prefs.size = Math.min(SIZE_MAX, prefs.size + SIZE_STEP);
        writeJson(PREF_KEY, prefs);
        applyPrefs(prefs);
    });
    document.getElementById("facePills").addEventListener("click", (event) => {
        const face = event.target.closest("[data-face]")?.dataset.face;
        if (!FACES.includes(face)) return;
        prefs.face = face;
        writeJson(PREF_KEY, prefs);
        applyPrefs(prefs);
    });
    document.getElementById("spaceSegs").addEventListener("click", (event) => {
        const spacing = event.target.closest("[data-space]")?.dataset.space;
        if (!SPACES.includes(spacing)) return;
        prefs.spacing = spacing;
        writeJson(PREF_KEY, prefs);
        applyPrefs(prefs);
    });
    scrollEl.addEventListener("scroll", () => persist(scrollRatio(scrollEl)), { passive: true });
    document.addEventListener("click", (event) => {
        const picker = document.getElementById("chapterPicker");
        if (picker.hidden) return;
        if (picker.contains(event.target) || event.target.closest("#pickerBtn")) return;
        setPicker(false);
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            setDrawer(false);
            setPicker(false);
        }
    });
    render();
}

boot();
