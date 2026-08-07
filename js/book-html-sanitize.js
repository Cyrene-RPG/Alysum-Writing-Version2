/**
 * Sanitize HTML for Alysum chapter content (mirrors editor cleanEditorHtml).
 */
const INLINE_IMAGE_FIGURE_CLASS = "book-inline-image";
const INLINE_IMAGE_SIZE_CLASSES = new Set(["img-small", "img-medium", "img-large", "img-full"]);
const INLINE_IMAGE_FRAME_CLASSES = new Set(["frame-plain", "frame-soft", "frame-mat", "frame-rule", "frame-etched", "frame-vintage"]);
const INLINE_IMAGE_ALIGN_CLASSES = new Set(["align-left", "align-center", "align-right"]);
const INLINE_IMAGE_DEFAULT_SIZE = "img-medium";
const INLINE_IMAGE_DEFAULT_FRAME = "frame-plain";
const INLINE_IMAGE_DEFAULT_ALIGN = "align-center";

function normalizeChapterElementAttributes(el) {
  if (el.tagName === "FIGURE") {
    const isInlineImage = el.classList.contains(INLINE_IMAGE_FIGURE_CLASS);
    [...el.attributes].forEach((attr) => {
      if (/^on/i.test(attr.name) || attr.name === "style") el.removeAttribute(attr.name);
    });
    if (isInlineImage) {
      let sizeClass = [...el.classList].find((c) => INLINE_IMAGE_SIZE_CLASSES.has(c)) || INLINE_IMAGE_DEFAULT_SIZE;
      const frameClass = [...el.classList].find((c) => INLINE_IMAGE_FRAME_CLASSES.has(c)) || INLINE_IMAGE_DEFAULT_FRAME;
      let alignClass = [...el.classList].find((c) => INLINE_IMAGE_ALIGN_CLASSES.has(c)) || INLINE_IMAGE_DEFAULT_ALIGN;
      if ((alignClass === "align-left" || alignClass === "align-right") && sizeClass === "img-full") {
        sizeClass = "img-large";
      }
      el.className = `${INLINE_IMAGE_FIGURE_CLASS} ${sizeClass} ${frameClass} ${alignClass}`;
    } else {
      el.removeAttribute("class");
    }
    return;
  }
  if (el.tagName === "FIGCAPTION") {
    [...el.attributes].forEach((attr) => {
      if (/^on/i.test(attr.name) || attr.name === "style" || attr.name === "class") {
        el.removeAttribute(attr.name);
      }
    });
    if (el.parentElement?.classList?.contains(INLINE_IMAGE_FIGURE_CLASS)) {
      el.className = "book-inline-caption";
    }
    return;
  }
  if (el.tagName === "IMG") {
    const src = el.getAttribute("src") || "";
    const alt = el.getAttribute("alt") || "";
    [...el.attributes].forEach((attr) => el.removeAttribute(attr.name));
    if (src) el.setAttribute("src", src);
    el.setAttribute("alt", alt);
    el.setAttribute("loading", "lazy");
    return;
  }
  if (el.tagName === "P") {
    const isSpacer = el.classList.contains("scene-spacer");
    const isBreak = el.classList.contains("scene-break");
    if (isSpacer || isBreak) {
      const classes = isSpacer ? ["scene-spacer"] : ["scene-break"];
      if (isBreak) {
        for (const name of el.classList) {
          if (name.startsWith("scene-break--")) classes.push(name);
        }
      }
      [...el.attributes].forEach((attr) => {
        if (/^on/i.test(attr.name) || attr.name === "style") el.removeAttribute(attr.name);
      });
      el.className = [...new Set(classes)].join(" ");
      el.setAttribute("contenteditable", "false");
      const glyph = el.querySelector(".scene-break-glyph");
      if (glyph) {
        [...glyph.attributes].forEach((attr) => glyph.removeAttribute(attr.name));
        glyph.className = "scene-break-glyph";
        glyph.setAttribute("aria-hidden", "true");
        el.textContent = "";
        el.appendChild(glyph);
      }
      return;
    }
  }
  if (el.tagName === "HR" && el.classList.contains("scene-rule")) {
    [...el.attributes].forEach((attr) => {
      if (/^on/i.test(attr.name) || attr.name === "style") el.removeAttribute(attr.name);
    });
    el.className = "scene-rule";
    el.setAttribute("contenteditable", "false");
    return;
  }
  if (el.tagName === "SPAN") {
    if (el.classList.contains("scene-break-glyph")) {
      [...el.attributes].forEach((attr) => {
        if (/^on/i.test(attr.name) || attr.name === "style") el.removeAttribute(attr.name);
      });
      el.className = "scene-break-glyph";
      el.setAttribute("aria-hidden", "true");
      return;
    }
    const fontClass = [...el.classList].find((c) => c.startsWith("alysum-font-"));
    [...el.attributes].forEach((attr) => {
      if (/^on/i.test(attr.name) || attr.name === "style") el.removeAttribute(attr.name);
      else if (attr.name === "class" && !fontClass) el.removeAttribute(attr.name);
    });
    if (fontClass) el.className = fontClass;
    return;
  }
  [...el.attributes].forEach((attr) => {
    if (/^on/i.test(attr.name) || attr.name === "style" || attr.name === "class") {
      el.removeAttribute(attr.name);
    }
  });
}

export function cleanImportHtml(html) {
  const holder = document.createElement("div");
  holder.innerHTML = String(html || "");

  holder.querySelectorAll("script, style, meta, link, iframe, object, embed").forEach((el) => el.remove());
  holder.querySelectorAll("hr.alysum-page-break, .alysum-page-view-spacer").forEach((el) => el.remove());
  holder.querySelectorAll("*").forEach((el) => {
    normalizeChapterElementAttributes(el);
    for (const attr of ["href", "src", "xlink:href"]) {
      const val = (el.getAttribute(attr) || "").trim().toLowerCase();
      if (/^(javascript:|data:text\/html|vbscript:)/.test(val)) el.removeAttribute(attr);
    }
  });

  holder.querySelectorAll("div").forEach((div) => {
    const p = document.createElement("p");
    while (div.firstChild) p.appendChild(div.firstChild);
    div.replaceWith(p);
  });

  holder.querySelectorAll(`p figure.${INLINE_IMAGE_FIGURE_CLASS}, div figure.${INLINE_IMAGE_FIGURE_CLASS}`).forEach((fig) => {
    const block = fig.parentElement;
    if (!block || block === holder) return;
    const hasOtherContent = [...block.childNodes].some((node) => {
      if (node === fig) return false;
      if (node.nodeType === Node.TEXT_NODE) return !!node.textContent.trim();
      return true;
    });
    if (!hasOtherContent) block.replaceWith(fig);
    else block.parentElement.insertBefore(fig, block.nextSibling);
  });

  // Normalize headings: h1/h3/h4+ become h2 (h1 is reserved for chapter titles in split logic)
  holder.querySelectorAll("h1, h3, h4, h5, h6").forEach((heading) => {
    const h2 = document.createElement("h2");
    while (heading.firstChild) h2.appendChild(heading.firstChild);
    heading.replaceWith(h2);
  });

  holder.querySelectorAll(`.${INLINE_IMAGE_FIGURE_CLASS} figcaption`).forEach((caption) => {
    if (!caption.textContent.trim()) caption.remove();
  });

  holder.querySelectorAll("p").forEach((p) => {
    if (p.classList.contains("scene-break") || p.classList.contains("scene-spacer")) return;
    const isCaretOnly = !p.textContent.replace(/\u200B/g, "").trim() &&
      !p.querySelector("img, figure") &&
      (p.querySelector("br") || p.textContent.includes("\u200B"));
    if (isCaretOnly || (!p.textContent.trim() && !p.querySelector("img, br, figure"))) p.remove();
  });

  holder.querySelectorAll("span").forEach((span) => {
    if (span.classList.length) return;
    if (span.attributes.length > 0) return;
    const parent = span.parentNode;
    if (!parent) return;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    parent.removeChild(span);
  });

  holder.querySelectorAll("p.scene-break, p.scene-spacer, hr.scene-rule").forEach((el) => {
    normalizeChapterElementAttributes(el);
  });

  return holder.innerHTML
    .replace(/<p(?![^>]*scene-break)(?![^>]*scene-spacer)>(\s|&nbsp;)*<\/p>/gi, "")
    .replace(/<div>(\s|&nbsp;|<br\s*\/?>)*<\/div>/gi, "")
    .trim();
}

/** Reader-safe chapter HTML (defense in depth on publish/read paths). */
export function sanitizeChapterHtml(html) {
  return cleanImportHtml(html);
}
