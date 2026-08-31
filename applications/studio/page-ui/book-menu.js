import { isLibraryListed, unlistLibraryListing } from "@alysum/publishing/post-work.js?v=8";

function bookDisplayTitle(book) {
    return String(book?.title || "").trim() || "Untitled Book";
}

function confirmAction({
    title = "Are you sure?",
    text = "",
    confirmLabel = "Yes",
    cancelLabel = "Cancel",
    requireTitle = "",
} = {}) {
    const overlay = document.getElementById("confirmOverlay");
    const titleEl = document.getElementById("confirmTitle");
    const textEl = document.getElementById("confirmText");
    const labelEl = document.getElementById("confirmTitleLabel");
    const inputEl = document.getElementById("confirmTitleInput");
    const yesBtn = document.getElementById("confirmYes");
    const noBtn = document.getElementById("confirmNo");
    if (!overlay || !yesBtn) return Promise.resolve(false);

    if (titleEl) titleEl.textContent = title;
    if (textEl) {
        textEl.textContent = text;
        textEl.hidden = !text;
    }
    yesBtn.textContent = confirmLabel;
    if (noBtn) noBtn.textContent = cancelLabel;

    const needTitle = Boolean(requireTitle);
    labelEl?.classList.toggle("hidden", !needTitle);
    inputEl?.classList.toggle("hidden", !needTitle);
    if (inputEl) {
        inputEl.value = "";
        inputEl.hidden = !needTitle;
    }
    yesBtn.disabled = needTitle;

    overlay.hidden = false;
    if (needTitle) inputEl?.focus();
    else yesBtn.focus();

    return new Promise((resolve) => {
        let done = false;
        function matchesTitle() {
            return String(inputEl?.value || "").trim() === requireTitle;
        }
        function syncYes() {
            yesBtn.disabled = needTitle && !matchesTitle();
        }
        function finish(ok) {
            if (done) return;
            done = true;
            overlay.hidden = true;
            overlay.removeEventListener("click", onClick);
            document.removeEventListener("keydown", onKey);
            inputEl?.removeEventListener("input", syncYes);
            resolve(ok);
        }
        function onClick(event) {
            if (event.target.closest("[data-confirm-yes]")) {
                if (needTitle && !matchesTitle()) return;
                finish(true);
                return;
            }
            if (event.target.closest("#confirmNo") || event.target === overlay) {
                finish(false);
            }
        }
        function onKey(event) {
            if (event.key === "Escape") finish(false);
        }
        overlay.addEventListener("click", onClick);
        document.addEventListener("keydown", onKey);
        inputEl?.addEventListener("input", syncYes);
    });
}

export function bindBookMenu({ getBooks, setBooks, paintShelf, api, supabase, session, status }) {
    const gearPop = document.getElementById("gearPopover");
    const gearMenuPane = document.getElementById("gearMenuPane");
    const gearPublishPane = document.getElementById("gearPublishPane");
    const publishPopCopy = document.getElementById("publishPopCopy");
    const publishPopYes = document.getElementById("publishPopYes");
    const publishPopNo = document.getElementById("publishPopNo");
    let menuBook = null;
    let menuGear = null;

    function placeGearPop(anchor) {
        if (!gearPop || !anchor) return;
        const rect = anchor.getBoundingClientRect();
        gearPop.hidden = false;
        const width = gearPop.offsetWidth || 188;
        const height = gearPop.offsetHeight || 0;
        let left = rect.right - width;
        let top = rect.bottom + 8;
        if (left < 8) left = 8;
        if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
        if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 8);
        gearPop.style.left = `${left}px`;
        gearPop.style.top = `${top}px`;
    }

    function showMenuPane() {
        if (gearMenuPane) gearMenuPane.hidden = false;
        if (gearPublishPane) gearPublishPane.hidden = true;
    }

    function closeBookMenu() {
        if (gearPop) gearPop.hidden = true;
        showMenuPane();
        menuBook = null;
        menuGear = null;
    }

    function openBookMenu(book, gear) {
        menuBook = book;
        menuGear = gear;
        const listed = isLibraryListed(book);
        const publishBtn = document.getElementById("bookMenuPublish");
        const takeBtn = document.getElementById("bookMenuTakedown");
        if (publishBtn) publishBtn.hidden = listed;
        if (takeBtn) takeBtn.hidden = !listed;
        showMenuPane();
        placeGearPop(gear);
    }

    function confirmAtGear(title, confirmLabel, gear) {
        if (!gearPop || !publishPopYes) return Promise.resolve(false);
        if (gearMenuPane) gearMenuPane.hidden = true;
        if (gearPublishPane) gearPublishPane.hidden = false;
        placeGearPop(gear);
        return new Promise((resolve) => {
            let done = false;
            function paint() {
                if (publishPopCopy) publishPopCopy.textContent = title;
                publishPopYes.textContent = confirmLabel;
                placeGearPop(gear);
            }
            function finish(ok) {
                if (done) return;
                done = true;
                closeBookMenu();
                publishPopYes.removeEventListener("click", onYes);
                publishPopNo?.removeEventListener("click", onNo);
                document.removeEventListener("click", onDoc, true);
                document.removeEventListener("keydown", onKey);
                resolve(ok);
            }
            function onYes(event) {
                event.stopPropagation();
                finish(true);
            }
            function onNo(event) {
                event.stopPropagation();
                finish(false);
            }
            function onDoc(event) {
                if (gearPop.contains(event.target)) return;
                finish(false);
            }
            function onKey(event) {
                if (event.key === "Escape") finish(false);
            }
            paint();
            publishPopYes.addEventListener("click", onYes);
            publishPopNo?.addEventListener("click", onNo);
            document.addEventListener("keydown", onKey);
            window.setTimeout(() => {
                if (!done) document.addEventListener("click", onDoc, true);
            }, 0);
        });
    }

    async function confirmDelete(title) {
        const first = await confirmAction({
            title: `Delete ${title}?`,
            confirmLabel: "Continue",
        });
        if (!first) return false;
        return confirmAction({
            title: "Type the book title to delete it.",
            confirmLabel: "Delete",
            requireTitle: title,
        });
    }

    document.addEventListener("click", (event) => {
        if (!gearPop || gearPop.hidden) return;
        if (gearPop.contains(event.target)) return;
        if (event.target.closest("[data-book-gear]")) return;
        closeBookMenu();
    }, true);
    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || !gearPop || gearPop.hidden) return;
        if (gearPublishPane && !gearPublishPane.hidden) return;
        closeBookMenu();
    });
    document.getElementById("bookMenuSettings")?.addEventListener("click", () => {
        const book = menuBook;
        if (!book) return;
        window.location.href = `/editor?book=${encodeURIComponent(book.id)}&view=settings`;
    });
    document.getElementById("bookMenuPublish")?.addEventListener("click", async () => {
        const book = menuBook;
        const gear = menuGear;
        if (!book) return;
        const title = bookDisplayTitle(book);
        if (!await confirmAtGear(`Publish ${title}?`, "Publish", gear)) return;
        window.location.href = `/publish?book=${encodeURIComponent(book.id)}`;
    });
    document.getElementById("bookMenuTakedown")?.addEventListener("click", async () => {
        const book = menuBook;
        const gear = menuGear;
        if (!book) return;
        const title = bookDisplayTitle(book);
        if (!await confirmAtGear(`Take down ${title}?`, "Take down", gear)) return;
        if (status) status.textContent = "Taking down…";
        try {
            await unlistLibraryListing(supabase, session.user?.id, book.id);
            const next = await api.updateBook(book.id, { is_published: false });
            setBooks(getBooks().map((row) => (row.id === book.id ? { ...row, ...next } : row)));
            paintShelf();
            if (status) status.textContent = "Removed from the library.";
        } catch {
            if (status) status.textContent = "Could not take this book down.";
        }
    });
    document.getElementById("bookMenuDelete")?.addEventListener("click", async () => {
        const book = menuBook;
        closeBookMenu();
        if (!book) return;
        const title = bookDisplayTitle(book);
        if (!await confirmDelete(title)) return;
        if (status) status.textContent = "Deleting…";
        try {
            await api.deleteBook(book.id);
            setBooks(getBooks().filter((row) => row.id !== book.id));
            paintShelf();
            if (status) status.textContent = "Book deleted.";
        } catch {
            if (status) status.textContent = "Could not delete this book.";
        }
    });

    return {
        openFromGear(gear) {
            const book = getBooks().find((row) => row.id === gear.dataset.bookGear);
            if (book) openBookMenu(book, gear);
        },
    };
}
