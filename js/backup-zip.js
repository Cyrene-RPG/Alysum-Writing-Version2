/**
 * Package Alysum backups as ZIP archives with readable HTML book pages.
 * Restore uses alysum-manifest.json inside the zip (full account data).
 */

export const MANIFEST_FILENAME = "alysum-manifest.json";
export const BOOKS_FOLDER = "books";

function getJSZip() {
  if (typeof window !== "undefined" && window.JSZip) return window.JSZip;
  throw new Error("Backup packaging is not ready. Refresh the page and try again.");
}

export function localBackupTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slugifyBookFilename(title, id) {
  const base =
    String(title || "untitled")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "book";
  const idBit = String(id || "x")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 10);
  return `${base}-${idBit || "book"}.html`;
}

function allChapters(book) {
  const sections = book?.sections && typeof book.sections === "object" ? book.sections : {};
  const front = (Array.isArray(sections.front) ? sections.front : []).map((ch) => ({
    ...ch,
    section: "front",
  }));
  const body = (Array.isArray(sections.body) ? sections.body : []).map((ch) => ({
    ...ch,
    section: "body",
  }));
  const back = (Array.isArray(sections.back) ? sections.back : []).map((ch) => ({
    ...ch,
    section: "back",
  }));
  return [...front, ...body, ...back];
}

function sectionLabel(section) {
  if (section === "front") return "Front matter";
  if (section === "back") return "Back matter";
  return "Chapter";
}

export function bookToHtmlPage(book, exportedLabel) {
  const title = escapeHtml(book?.title || "Untitled");
  const chapters = allChapters(book);
  const chapterHtml = chapters
    .map((ch) => {
      const chTitle = escapeHtml(ch.title || "Untitled");
      const content = String(ch.content || "");
      return (
        `<section class="alysum-chapter" data-section="${escapeHtml(ch.section)}">` +
        `<p class="alysum-section-label">${sectionLabel(ch.section)}</p>` +
        `<h2>${chTitle}</h2>` +
        `<div class="alysum-chapter-body">${content}</div>` +
        `</section>`
      );
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — Alysum backup</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; max-width: 42rem; margin: 2rem auto; padding: 0 1.25rem; line-height: 1.65; color: #111; background: #fff; }
  h1 { font-size: 1.85rem; margin: 0 0 0.35rem; line-height: 1.2; }
  .alysum-meta { color: #555; font-size: 0.9rem; margin: 0 0 2rem; }
  .alysum-section-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: #888; margin: 0 0 0.35rem; }
  h2 { font-size: 1.2rem; margin: 2rem 0 0.75rem; }
  .alysum-chapter-body { font-size: 1rem; }
  .alysum-chapter-body p { margin: 0 0 1em; }
</style>
</head>
<body>
<header>
  <h1>${title}</h1>
  <p class="alysum-meta">Alysum backup · ${exportedLabel}</p>
</header>
<main>
${chapterHtml || "<p><em>No chapters in this book.</em></p>"}
</main>
</body>
</html>`;
}

function buildIndexHtml(exportedLabel, bookLinks) {
  const list =
    bookLinks.length > 0
      ? bookLinks
          .map(
            (b) =>
              `<li><a href="${escapeHtml(b.href)}">${escapeHtml(b.title || "Untitled")}</a></li>`
          )
          .join("\n")
      : "<li><em>No books in this backup.</em></li>";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Alysum backup</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 36rem; margin: 2.5rem auto; padding: 0 1.25rem; line-height: 1.5; color: #111; }
  h1 { font-size: 1.5rem; }
  .meta { color: #555; margin-bottom: 1.5rem; }
  ul { padding-left: 1.25rem; }
  a { color: #5b21b6; }
</style>
</head>
<body>
<h1>Alysum backup</h1>
<p class="meta">Created ${escapeHtml(exportedLabel)}</p>
<p>Your books are saved as HTML pages you can open in any browser:</p>
<ul>
${list}
</ul>
<p>To put everything back into Alysum, open <strong>Settings → Backup → Restore</strong> and choose this <strong>.zip</strong> file.</p>
</body>
</html>`;
}

function buildReadmeText(exportedLabel, bookCount) {
  return [
    "Alysum backup",
    "==============",
    "",
    `Created: ${exportedLabel}`,
    `Books: ${bookCount}`,
    "",
    "What's inside:",
    "- index.html      — start here; links to your books",
    "- books/          — each book as a readable HTML page",
    `- ${MANIFEST_FILENAME} — full data for Alysum restore`,
    "",
    "To restore: Alysum → Settings → Backup → choose this .zip file → Restore.",
    "",
  ].join("\n");
}

export function getBooksFromBackup(backup) {
  if (Array.isArray(backup?.tables?.books) && backup.tables.books.length) {
    return backup.tables.books;
  }
  if (Array.isArray(backup?.localData?.localStudio?.books) && backup.localData.localStudio.books.length) {
    return backup.localData.localStudio.books;
  }
  return [];
}

/**
 * @param {object} backup
 * @param {string} exportedLabel Human-readable export time (local)
 * @returns {Promise<Blob>}
 */
export async function buildBackupZipBlob(backup, exportedLabel) {
  const JSZip = getJSZip();
  const zip = new JSZip();
  const books = getBooksFromBackup(backup);
  const bookLinks = [];

  zip.file("README.txt", buildReadmeText(exportedLabel, books.length));
  zip.file(MANIFEST_FILENAME, JSON.stringify(backup, null, 2));

  const booksFolder = zip.folder(BOOKS_FOLDER);
  const usedNames = new Set();

  for (const book of books) {
    let fileName = slugifyBookFilename(book.title, book.id);
    let n = 2;
    while (usedNames.has(fileName)) {
      fileName = slugifyBookFilename(`${book.title || "book"}-${n}`, book.id);
      n++;
    }
    usedNames.add(fileName);
    const path = `${BOOKS_FOLDER}/${fileName}`;
    booksFolder.file(fileName, bookToHtmlPage(book, exportedLabel));
    bookLinks.push({ title: book.title || "Untitled", href: path });
  }

  zip.file("index.html", buildIndexHtml(exportedLabel, bookLinks));

  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

/**
 * @param {File | Blob} file
 * @returns {Promise<object>}
 */
export async function readManifestFromZip(file) {
  const JSZip = getJSZip();
  let data = file;
  if (file && typeof file.arrayBuffer === "function") {
    data = await file.arrayBuffer();
  }
  const zip = await JSZip.loadAsync(data);
  const manifestFile = zip.file(MANIFEST_FILENAME);
  if (!manifestFile) {
    throw new Error(`This ZIP is missing ${MANIFEST_FILENAME}. Choose an Alysum backup .zip file.`);
  }
  const text = await manifestFile.async("string");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The backup data inside this ZIP is damaged.");
  }
  return parsed;
}
