import { signOutAndGoToHome } from "@alysum/authentication/logout.js";
import { setChapterContent, setChapterTitle } from "@alysum/writing-engine/manuscript.js?v=5";
import { countWordsInHtml } from "@alysum/writing-engine/word-count.js";

function isBlankHtml(html) {
    return countWordsInHtml(html) === 0;
}

export function bindPersistHooks({
    getBook,
    getSelectedId,
    getClosing,
    setClosing,
    persist,
    saveChapter,
    selectedKind,
    editor,
    bookTitle,
    chapterTitle,
    drawTree,
}) {
    document.addEventListener("click", async (event) => {
        const logoutBtn = event.target.closest("[data-logout-btn]");
        const link = event.target.closest("a[href]");
        const href = link?.getAttribute("href") || "";
        let leavingPage = Boolean(logoutBtn);
        if (!leavingPage && href && !href.startsWith("#")) {
            try {
                const url = new URL(href, window.location.href);
                leavingPage = url.origin !== window.location.origin
                    || url.pathname !== window.location.pathname
                    || url.search !== window.location.search;
            } catch {
                leavingPage = /\.html(?:[?#]|$)/i.test(href);
            }
        }
        if (!leavingPage) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        await saveChapter();
        if (logoutBtn) {
            await signOutAndGoToHome();
            return;
        }
        window.location.href = href;
    }, true);

    bookTitle?.addEventListener("input", () => {
        if (getClosing()) return;
        const book = getBook();
        const title = String(bookTitle.value || "").trim();
        if (!title) {
            if (String(book.title || "").trim() && book.title !== "Untitled Book") return;
            persist({ ...book, title: "Untitled Book" });
            return;
        }
        persist({ ...book, title });
    });
    chapterTitle?.addEventListener("input", () => {
        if (getClosing()) return;
        persist({
            ...getBook(),
            sections: setChapterTitle(getBook().sections, getSelectedId(), chapterTitle.value),
        });
        drawTree();
    });

    function snapshotAndFlush(tearingDown = false) {
        if (tearingDown) setClosing(true);
        const book = getBook();
        let next = book;
        const title = String(bookTitle?.value || "").trim();
        if (title) next = { ...next, title };
        const heading = String(chapterTitle?.value || "").trim();
        if (heading) next = { ...next, sections: setChapterTitle(next.sections, getSelectedId(), heading) };
        if (selectedKind() !== "folder") {
            const html = editor.getHtml();
            if (!isBlankHtml(html)) {
                next = { ...next, sections: setChapterContent(next.sections, getSelectedId(), html) };
            }
        }
        persist(next, true);
    }
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") snapshotAndFlush(false);
    });
    window.addEventListener("pagehide", () => snapshotAndFlush(true));
    window.addEventListener("beforeunload", () => snapshotAndFlush(true));
}
