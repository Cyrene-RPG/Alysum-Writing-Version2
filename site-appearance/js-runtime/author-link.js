/** The application supplies a verified destination; appearance never resolves identity. */
function escape(value) {
    return String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
export function authorNameHtml({url, label, className = "author-link"}) {
    const text=escape(label || "Author");
    return typeof url === "string" && url.startsWith("/author?")
        ? '<a class="' + escape(className) + '" href="' + escape(url) + '">' + text + '</a>' : text;
}
