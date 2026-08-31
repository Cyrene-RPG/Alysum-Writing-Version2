import {
    cropFrameStyle,
    defaultCrops,
    loadDraftCover,
    peekCoverSrc,
    saveDraftCover,
} from "@alysum/publishing/cover-upload.js?v=2";

export async function resolvePreviewCoverSrc(bookId, coverUrl) {
    return (await loadDraftCover(bookId)) || peekCoverSrc(coverUrl) || "";
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
    const style = crop ? cropFrameStyle(crop) : "";
    if (style) img.setAttribute("style", style);
    else img.removeAttribute("style");
}

export function wideCropFromMeta(meta) {
    return meta?.coverWide || defaultCrops().coverWide;
}

function coverImgHtml(src, crop) {
    const safe = String(src || "");
    if (!safe) return "";
    const style = cropFrameStyle(crop);
    const attr = style ? ` style="${style}"` : "";
    return `<img src="${safe.replace(/"/g, "")}" alt="" decoding="async"${attr} />`;
}

export function paintBookHero(hero, coverEl, src, meta) {
    if (!hero || !coverEl) return;
    const wide = Boolean(meta?.coverWideEnabled && src);
    hero.classList.toggle("is-wide", wide);
    hero.querySelector(".book-hero-art")?.remove();
    if (wide) {
        coverEl.hidden = true;
        coverEl.innerHTML = "";
        coverEl.classList.remove("has-img");
        hero.insertAdjacentHTML(
            "afterbegin",
            `<button type="button" class="book-hero-art" id="libHeroArt" aria-label="Change cover">${coverImgHtml(src, null)}</button>`,
        );
        return;
    }
    coverEl.hidden = false;
    if (src) {
        coverEl.innerHTML = coverImgHtml(src, meta?.coverCrop);
        coverEl.classList.add("has-img");
    } else {
        coverEl.innerHTML = `<span class="lib-cover-ph">Add cover</span>`;
        coverEl.classList.remove("has-img");
    }
}
