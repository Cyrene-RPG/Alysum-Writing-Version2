/**
 * Export recovered Archangel manuscript as PDF.
 *   node recovery-audit/export-archangel-pdf.mjs
 */
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";

const JSON_IN = path.join(
  process.cwd(),
  "recovery-audit",
  "duckduckgo-extract",
  "archangel-SUPABASE-FULL-RECOVERY.json"
);
const OUT = path.join(
  process.cwd(),
  "recovery-audit",
  "your-novels",
  "Archangel_SUPABASE_41348words_DDG_RECOVERY.pdf"
);

const book = JSON.parse(fs.readFileSync(JSON_IN, "utf8"));
const sections = book.sections || {};

function stripHtml(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function countWords(text) {
  return stripHtml(text).split(/\s+/).filter(Boolean).length;
}

const chapters = [
  ...(sections.front || []).map((ch) => ({ ...ch, part: "Front" })),
  ...(sections.body || []).map((ch) => ({ ...ch, part: "Body" })),
  ...(sections.back || []).map((ch) => ({ ...ch, part: "Back" })),
].filter((ch) => countWords(ch.content) > 0 || (ch.title && ch.title.trim()));

const doc = new PDFDocument({
  size: "LETTER",
  margins: { top: 72, bottom: 72, left: 72, right: 72 },
  info: {
    Title: book.title || "Archangel",
    Author: "Recovered manuscript",
    Subject: "Archangel — Supabase recovery export",
  },
});

const stream = fs.createWriteStream(OUT);
doc.pipe(stream);

const bodyFont = "Times-Roman";
const boldFont = "Times-Bold";
const italicFont = "Times-Italic";
const bodySize = 11;
const lineGap = 4;

function writeParagraph(text, opts = {}) {
  const content = String(text || "").trim();
  if (!content) return;
  doc.font(opts.font || bodyFont)
    .fontSize(opts.size || bodySize)
    .fillColor(opts.color || "#111111")
    .text(content, {
      align: opts.align || "justify",
      lineGap: opts.lineGap ?? lineGap,
      paragraphGap: opts.paragraphGap ?? 8,
    });
}

// Title page
doc.font(boldFont).fontSize(28).fillColor("#111111").text(book.title || "Archangel", {
  align: "center",
});
doc.moveDown(2);
doc.font(bodyFont).fontSize(12).text("Recovered from DuckDuckGo browser cache", { align: "center" });
doc.fontSize(11).fillColor("#444444").text(
  `Supabase snapshot · ${book.words?.toLocaleString() || "?"} words · ${new Date(book.updated).toLocaleDateString()}`,
  { align: "center" }
);
doc.addPage();

let totalWords = 0;
for (const ch of chapters) {
  const plain = stripHtml(ch.content);
  const words = countWords(ch.content);
  totalWords += words;
  if (!plain && words === 0) continue;

  doc.font(boldFont).fontSize(16).fillColor("#111111").text(ch.title || "Untitled", {
    align: "left",
    lineGap: 2,
  });
  doc.moveDown(0.75);

  const paragraphs = plain.split(/\n\n+/).filter((p) => p.trim());
  for (const para of paragraphs) {
    writeParagraph(para.replace(/\n+/g, " "));
    doc.moveDown(0.35);
  }

  doc.addPage();
}

// Remove trailing blank page if we just added one
// pdfkit doesn't easily remove last page; acceptable for export

doc.end();

stream.on("finish", () => {
  const sizeMb = (fs.statSync(OUT).size / (1024 * 1024)).toFixed(2);
  console.log("PDF exported:", OUT);
  console.log("Chapters:", chapters.filter((c) => countWords(c.content) > 0).length);
  console.log("Approx words:", totalWords);
  console.log("File size:", sizeMb, "MB");
});

stream.on("error", (err) => {
  console.error("PDF write failed:", err);
  process.exit(1);
});
