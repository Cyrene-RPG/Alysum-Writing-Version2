import {
    cropFrameStyle,
    defaultCrops,
    isFullCoverCrop,
    coverPaintCrop,
    coverCropForImage,
    loadDraftCover,
    peekCoverSrc,
    saveDraftCover,
} from "@alysum/publishing/cover-upload.js?v=10";

export async function resolvePreviewCoverSrc(bookId, coverUrl, _preferLive = false) {
    const live = peekCoverSrc(coverUrl) || "";
    return (await loadDraftCover(bookId)) || live || "";
}

export async function storePickedCover(bookId, file) {
    return saveDraftCover(bookId, file);
}

export function paintCoverTile(btn, img, src, crop) {
    if (!btn || !img) return;
    if (!src) {
        img.removeAttribute("src");
        img.removeAttribute("style");
        btn.classList.remove("has-img");
        return;
    }
    img.src = src;
    btn.classList.add("has-img");
    const paint = coverPaintCrop(crop);
    const style = crop && !isFullCoverCrop(paint) ? cropFrameStyle(paint) : "";
    if (style) img.setAttribute("style", style);
    else img.removeAttribute("style");
    btn.classList.toggle("is-full-cover", Boolean(src) && isFullCoverCrop(paint));
}

export function wideCropFromMeta(meta) {
    return meta?.coverWide || defaultCrops().coverWide;
}

function coverImgHtml(src, crop) {
    const safe = String(src || "");
    if (!safe) return "";
    const paint = coverPaintCrop(crop);
    const style = !isFullCoverCrop(paint) ? cropFrameStyle(paint) : "";
    const attr = style ? ` style="${style}"` : "";
    return `<img src="${safe.replace(/"/g, "")}" alt="" decoding="async"${attr} />`;
}

export function paintBookHero(hero, coverEl, src, meta, options = {}) {
    if (!hero || !coverEl) return;
    const wide = Boolean(meta?.coverWideEnabled && src);
    hero.classList.toggle("is-wide", wide);
    hero.querySelector(".book-hero-art")?.remove();
    if (wide) {
        coverEl.hidden = true;
        coverEl.innerHTML = "";
        coverEl.classList.remove("has-img", "is-full-cover", "is-square");
        hero.insertAdjacentHTML(
            "afterbegin",
            `<label class="book-hero-art" id="libHeroArt" for="libCoverFile" aria-label="Change cover">${coverImgHtml(src, meta.coverWide)}</label>`,
        );
        return;
    }
    if (src) {
        coverEl.hidden = false;
        coverEl.innerHTML = coverImgHtml(src, meta.coverCrop);
        coverEl.classList.add("has-img");
        coverEl.classList.remove("is-full-cover", "is-square");
        const img = coverEl.querySelector("img");
        function applyFrame() {
            const w = img?.naturalWidth || 0;
            const h = img?.naturalHeight || 0;
            const next = coverCropForImage(meta.coverCrop, w, h);
            if (w > h) {
                coverEl.classList.remove("is-full-cover", "is-square");
                if (img) img.setAttribute("style", cropFrameStyle(next));
            } else {
                coverEl.classList.add("is-full-cover");
                coverEl.classList.remove("is-square");
                img?.removeAttribute("style");
            }
        }
        if (img?.complete && img.naturalWidth) applyFrame();
        else img?.addEventListener("load", applyFrame, { once: true });
        return;
    }
    coverEl.classList.remove("has-img");
    coverEl.classList.remove("is-full-cover");
    coverEl.classList.remove("is-square");
    if (options.allowPlaceholder === false) {
        coverEl.hidden = true;
        coverEl.innerHTML = "";
        return;
    }
    coverEl.hidden = false;
    coverEl.innerHTML = `<span class="lib-cover-ph">Add cover</span>`;
}
