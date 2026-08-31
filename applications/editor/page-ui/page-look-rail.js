import { DEFAULT_PAGE_LOOK, mergePublishMeta, readPublishDraft } from "@alysum/publishing/publish-meta.js?v=7";
import { bindBookLookPicker, paintBookLookPicker } from "@alysum/site-appearance/js-runtime/book-look-picker.js?v=4";
import { applyVisitListingLook, applyVisitSiteAccent, applyVisitTitleColor } from "@alysum/site-appearance/js-runtime/visit-page-look.js?v=10";

function lookHtml() {
    return `
        <div class="writer-look-menu" id="writerLookMenu">
            <button type="button" class="writer-look-reset" id="railLookReset">Reset look</button>
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
            <button type="button" class="writer-look-drop-btn" data-look-drop-btn="title" aria-expanded="false">Title colors</button>
            <div class="writer-look-drop" data-look-drop="title" hidden>
                <div data-book-title-swatches class="book-look-swatches"></div>
                <div data-book-title-custom hidden>
                    <input type="color" data-book-title-main value="#f59e0b" />
                    <input type="color" data-book-title-accent value="#fde68a" />
                </div>
            </div>
            <button type="button" class="writer-look-drop-btn" data-look-drop-btn="accent" aria-expanded="false">Site accents</button>
            <div class="writer-look-drop" data-look-drop="accent" hidden>
                <div data-book-accent-swatches class="book-look-swatches"></div>
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
    getBook,
    persistMeta,
    previewPane,
    defaultAuthor = "",
}) {
    if (!rail) return { expand() {}, close() {}, hide() {} };
    rail.hidden = false;

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
            pageLook: DEFAULT_PAGE_LOOK,
            pageLookSaved: null,
            pageLookCustom: "",
            pageBgId: "",
            pageBg: "",
            textColor: "",
            textColorMain: "",
            textColorAccent: "",
            siteAccent: "",
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
                pageLook: look.pageLook || DEFAULT_PAGE_LOOK,
                pageLookSaved: look.pageLookSaved,
                pageLookCustom: look.pageLookCustom,
                pageBgId: look.pageBgId,
                pageBg: look.pageBg,
                textColor: look.textColor || "",
                textColorMain: look.textColorMain || "",
                textColorAccent: look.textColorAccent || "",
                siteAccent: look.siteAccent || "",
            }),
        });
    }

    function applyLook(look) {
        applyVisitListingLook(previewPane, previewPane?.querySelector(".book-page"), look);
        applyVisitTitleColor(previewPane?.querySelector("#libTitle"), look);
        applyVisitSiteAccent(previewPane?.querySelector(".book-card"), look);
    }

    function expand() {
        rail.hidden = false;
        if (menu) menu.hidden = false;
        paintBookLookPicker(menu, metaFromBook().meta);
        applyLook(metaFromBook().meta);
    }

    function hide() {
        closeDrops(menu);
        if (menu) menu.hidden = true;
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
    hide();

    return { expand, close, hide, toggle: expand };
}
