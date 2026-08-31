import { mergePublishMeta, readPublishDraft } from "@alysum/publishing/publish-meta.js";
import { bindBookLookPicker, paintBookLookPicker } from "@alysum/site-appearance/js-runtime/book-look-picker.js";
import { applyVisitListingLook } from "@alysum/site-appearance/js-runtime/visit-page-look.js?v=8";

function lookHtml() {
    return `
        <div class="writer-look-menu" id="writerLookMenu">
            <button type="button" class="writer-look-drop-btn" data-look-drop-btn="listing" aria-expanded="false">UI elements</button>
            <div class="writer-look-drop" data-look-drop="listing" hidden>
                <div data-book-look-swatches class="book-look-swatches"></div>
                <div data-book-look-custom hidden>
                    <input type="color" data-book-look-color value="#111827" />
                </div>
            </div>
            <button type="button" class="writer-look-drop-btn" data-look-drop-btn="bg" aria-expanded="false">Page background</button>
            <div class="writer-look-drop" data-look-drop="bg" hidden>
                <div data-book-bg-chips class="book-look-bg-chips"></div>
                <div data-book-bg-custom hidden>
                    <input type="color" data-book-bg-color value="#0b1220" />
                </div>
            </div>
        </div>
    `;
}

function closeDrops(root) {
    root?.querySelectorAll("[data-look-drop]").forEach((el) => {
        el.hidden = true;
    });
    root?.querySelectorAll("[data-look-drop-btn]").forEach((btn) => {
        btn.setAttribute("aria-expanded", "false");
    });
}

function bindDrops(root) {
    root?.querySelectorAll("[data-look-drop-btn]").forEach((btn) => {
        btn.addEventListener("click", (event) => {
            event.stopPropagation();
            const id = btn.dataset.lookDropBtn;
            const drop = root.querySelector(`[data-look-drop="${id}"]`);
            const open = drop?.hidden;
            closeDrops(root);
            if (open && drop) {
                drop.hidden = false;
                btn.setAttribute("aria-expanded", "true");
            }
        });
    });
}

export function mountPageLookRail({
    rail,
    shell,
    getBook,
    persistMeta,
    previewPane,
    defaultAuthor = "",
}) {
    if (!rail) return { expand() {}, close() {} };

    if (!document.getElementById("writerLookMenu")) {
        rail.insertAdjacentHTML("beforeend", lookHtml());
    }
    const menu = document.getElementById("writerLookMenu");
    bindDrops(menu);
    bindBookLookPicker(menu, {
        onChange(look) {
            saveLook(look);
            applyLook(look);
        },
    });
    document.getElementById("railLookReset")?.addEventListener("click", (event) => {
        event.stopPropagation();
        const look = {
            pageLook: "dark",
            pageLookSaved: null,
            pageLookCustom: "",
            pageBgId: "",
            pageBg: "",
        };
        saveLook(look);
        applyLook(look);
        paintBookLookPicker(menu, look);
        closeDrops(menu);
    });

    function metaFromBook() {
        const book = getBook();
        const meta = readPublishDraft(book);
        if (!meta.author) meta.author = defaultAuthor;
        return { book, meta };
    }

    function saveLook(look) {
        const { book } = metaFromBook();
        const existing = book.publish_meta && typeof book.publish_meta === "object" && !Array.isArray(book.publish_meta)
            ? book.publish_meta
            : {};
        persistMeta({
            publish_meta: mergePublishMeta(existing, {
                pageLook: look.pageLook || "dark",
                pageLookSaved: look.pageLookSaved,
                pageLookCustom: look.pageLookCustom,
                pageBgId: look.pageBgId,
                pageBg: look.pageBg,
            }),
        });
    }

    function applyLook(look) {
        applyVisitListingLook(previewPane, previewPane?.querySelector(".book-page"), look);
    }

    function expand() {
        shell?.classList.remove("is-rail-collapsed");
        const toggle = document.getElementById("railToggle");
        if (toggle) {
            toggle.setAttribute("aria-expanded", "true");
            toggle.title = "Hide sidebar";
            toggle.textContent = "›";
        }
        try {
            localStorage.setItem("alysum:editor:rail-collapsed", "0");
        } catch {
            /* ignore */
        }
        paintBookLookPicker(menu, metaFromBook().meta);
        applyLook(metaFromBook().meta);
    }

    function close() {
        closeDrops(menu);
    }

    document.addEventListener("click", (event) => {
        const path = typeof event.composedPath === "function" ? event.composedPath() : [];
        if (path.includes(menu) || event.target.closest?.("#railLookReset")) return;
        closeDrops(menu);
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeDrops(menu);
    });
    paintBookLookPicker(menu, metaFromBook().meta);

    return { expand, close, toggle: expand };
}
