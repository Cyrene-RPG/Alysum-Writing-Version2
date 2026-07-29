/**
 * Sanitize HTML for Alysum chapter content (mirrors editor cleanEditorHtml).
 */
export function cleanImportHtml(html) {
  const holder = document.createElement("div");
  holder.innerHTML = String(html || "");

  holder.querySelectorAll("script, style, meta, link, iframe, object, embed").forEach((el) => el.remove());
  holder.querySelectorAll("*").forEach((el) => {
    [...el.attributes].forEach((attr) => {
      if (/^on/i.test(attr.name) || attr.name === "style" || attr.name === "class") {
        el.removeAttribute(attr.name);
      }
    });
  });

  holder.querySelectorAll("div").forEach((div) => {
    const p = document.createElement("p");
    while (div.firstChild) p.appendChild(div.firstChild);
    div.replaceWith(p);
  });

  // Normalize headings: h1/h3/h4+ become h2 (h1 is reserved for chapter titles in split logic)
  holder.querySelectorAll("h1, h3, h4, h5, h6").forEach((heading) => {
    const h2 = document.createElement("h2");
    while (heading.firstChild) h2.appendChild(heading.firstChild);
    heading.replaceWith(h2);
  });

  holder.querySelectorAll("p").forEach((p) => {
    if (!p.textContent.trim() && !p.querySelector("img, br")) p.remove();
  });

  return holder.innerHTML
    .replace(/<p>(\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, "")
    .replace(/<div>(\s|&nbsp;|<br\s*\/?>)*<\/div>/gi, "")
    .trim();
}
