/**
 * Import manuscripts from Word (.docx), Google Docs exports (.docx / .html),
 * and other HTML sources into Alysum book sections.
 */
import { newChapterId } from "./book-media-format.js?v=2";
import { countWordsFromHTML } from "./book-word-count.js?v=1";
import { cleanImportHtml } from "./book-html-sanitize.js?v=1";

const ACCEPTED_EXTENSIONS = new Set(["docx", "html", "htm"]);

const CHAPTER_HEADING_RE =
  /^(?:chapter|part|book|section|act)\s+(?:\d+|[ivxlc]+|[a-z]+)|^(?:prologue|epilogue|interlude|preface|introduction|afterword|appendix|dedication)$/i;

const FRONT_MATTER_RE =
  /^(?:copyright|title\s*page|dedication|acknowledg(?:e)?ments?|table\s+of\s+contents|contents|half[\-\s]?title|imprint|about\s+the\s+author)$/i;

let mammothPromise = null;

function loadMammoth() {
  if (!mammothPromise) {
    mammothPromise = import("https://esm.sh/mammoth@1.8.0").then((mod) => mod.default || mod);
  }
  return mammothPromise;
}

function titleFromFilename(name) {
  const base = String(name || "")
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim();
  return base || "Untitled Book";
}

function normalizeHeadingText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function isChapterHeadingElement(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
  const tag = el.tagName.toLowerCase();
  const text = normalizeHeadingText(el.textContent);
  if (!text) return false;

  if (tag === "h1") return true;
  if (tag === "h2" && CHAPTER_HEADING_RE.test(text)) return true;

  if (tag === "p") {
    const boldOnly =
      el.childNodes.length === 1 &&
      el.firstChild?.nodeType === Node.ELEMENT_NODE &&
      ["strong", "b"].includes(el.firstChild.tagName.toLowerCase()) &&
      normalizeHeadingText(el.firstChild.textContent) === text;
    const shortBold = text.length <= 80 && (boldOnly || el.querySelector("strong, b"));
    if (shortBold && CHAPTER_HEADING_RE.test(text)) return true;
    if (el.getAttribute("role") === "heading") return true;
  }
  return false;
}

function isFrontMatterHeading(text) {
  const t = normalizeHeadingText(text);
  return t && FRONT_MATTER_RE.test(t);
}

function extractChapterTitle(el) {
  return normalizeHeadingText(el.textContent) || "Untitled Chapter";
}

function collectBlockNodes(root) {
  const nodes = [];
  const walk = (parent) => {
    for (const child of [...parent.childNodes]) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = child.tagName.toLowerCase();
        if (["h1", "h2", "h3", "h4", "h5", "h6", "p", "ul", "ol", "blockquote", "table", "hr"].includes(tag)) {
          nodes.push(child);
        } else if (tag === "div" || tag === "section" || tag === "article" || tag === "body") {
          walk(child);
        } else {
          nodes.push(child);
        }
      }
    }
  };
  walk(root);
  return nodes;
}

/**
 * Split HTML into chapter drafts: { title, contentHtml, isFrontMatter? }[]
 */
export function splitHtmlIntoChapters(html) {
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
  const blocks = collectBlockNodes(doc.body);

  if (!blocks.length) {
    return [{ title: "Chapter 1", contentHtml: "", isFrontMatter: false }];
  }

  const segments = [];
  let current = null;

  const pushCurrent = () => {
    if (!current) return;
    segments.push(current);
    current = null;
  };

  for (const block of blocks) {
    if (isChapterHeadingElement(block)) {
      pushCurrent();
      const title = extractChapterTitle(block);
      current = {
        title,
        contentHtml: "",
        isFrontMatter: isFrontMatterHeading(title),
      };
      continue;
    }

    if (!current) {
      current = { title: "", contentHtml: "", isFrontMatter: false, isPreamble: true };
    }

    const wrapper = document.createElement("div");
    wrapper.appendChild(block.cloneNode(true));
    current.contentHtml += wrapper.innerHTML;
  }
  pushCurrent();

  if (segments.length === 0) {
    const all = doc.body.innerHTML;
    return [{ title: "Chapter 1", contentHtml: cleanImportHtml(all), isFrontMatter: false }];
  }

  // If no explicit chapter headings were found, try splitting on h2 tags
  const hasRealChapters = segments.some((s) => !s.isPreamble && s.title);
  if (!hasRealChapters && segments.length === 1 && segments[0].isPreamble) {
    const h2Blocks = blocks.filter((b) => b.tagName?.toLowerCase() === "h2");
    if (h2Blocks.length >= 2) {
      return splitOnTag(doc.body, "h2");
    }
    const single = segments[0];
    return [
      {
        title: "Chapter 1",
        contentHtml: cleanImportHtml(single.contentHtml),
        isFrontMatter: false,
      },
    ];
  }

  const result = [];
  let preamble = null;

  for (const seg of segments) {
    if (seg.isPreamble) {
      preamble = seg;
      continue;
    }
    if (preamble?.contentHtml?.trim()) {
      const pre = preamble.contentHtml.trim();
      if (result.length === 0) {
        result.push({
          title: "Front Matter",
          contentHtml: cleanImportHtml(pre),
          isFrontMatter: true,
        });
      } else {
        seg.contentHtml = pre + seg.contentHtml;
      }
      preamble = null;
    }
    result.push({
      title: seg.title || `Chapter ${result.filter((r) => !r.isFrontMatter).length + 1}`,
      contentHtml: cleanImportHtml(seg.contentHtml),
      isFrontMatter: seg.isFrontMatter,
    });
  }

  if (result.length === 0 && preamble) {
    return [
      {
        title: "Chapter 1",
        contentHtml: cleanImportHtml(preamble.contentHtml),
        isFrontMatter: false,
      },
    ];
  }

  return result.length ? result : [{ title: "Chapter 1", contentHtml: "", isFrontMatter: false }];
}

function splitOnTag(body, tagName) {
  const blocks = collectBlockNodes(body);
  const segments = [];
  let current = null;

  const push = () => {
    if (current) segments.push(current);
    current = null;
  };

  for (const block of blocks) {
    if (block.tagName?.toLowerCase() === tagName) {
      push();
      current = { title: extractChapterTitle(block), contentHtml: "", isFrontMatter: false };
      continue;
    }
    if (!current) current = { title: "Chapter 1", contentHtml: "", isFrontMatter: false };
    const wrapper = document.createElement("div");
    wrapper.appendChild(block.cloneNode(true));
    current.contentHtml += wrapper.innerHTML;
  }
  push();

  return segments.map((s, i) => ({
    title: s.title || `Chapter ${i + 1}`,
    contentHtml: cleanImportHtml(s.contentHtml),
    isFrontMatter: false,
  }));
}

export function buildSectionsFromChapterDrafts(drafts) {
  const front = [];
  const body = [];
  const back = [];

  for (const draft of drafts) {
    const chapter = {
      id: newChapterId(),
      title: draft.title || "Untitled Chapter",
      content: draft.contentHtml || "",
    };
    if (draft.isFrontMatter) front.push(chapter);
    else body.push(chapter);
  }

  if (body.length === 0 && front.length > 0) {
    body.push(...front.splice(0, front.length));
    body[0].title = body[0].title || "Chapter 1";
  }

  if (body.length === 0) {
    body.push({ id: newChapterId(), title: "Chapter 1", content: "" });
  }

  return { front, body, back };
}

export function countSectionsWords(sections) {
  let total = 0;
  for (const key of ["front", "body", "back"]) {
    const list = Array.isArray(sections?.[key]) ? sections[key] : [];
    for (const ch of list) total += countWordsFromHTML(ch.content || "");
  }
  return total;
}

export function isAcceptedImportFile(file) {
  if (!file?.name) return false;
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  return ACCEPTED_EXTENSIONS.has(ext);
}

export function acceptedImportAcceptAttr() {
  return ".docx,.html,.htm,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/html";
}

/**
 * @returns {Promise<{ html: string, suggestedTitle: string, warnings: string[] }>}
 */
export async function parseManuscriptFile(file) {
  if (!file) throw new Error("No file selected.");
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (!ACCEPTED_EXTENSIONS.has(ext)) {
    throw new Error("Unsupported file type. Use a Word (.docx) or HTML (.html) export.");
  }

  if (ext === "docx") return parseDocxFile(file);
  return parseHtmlFile(file);
}

async function parseDocxFile(file) {
  const mammoth = await loadMammoth();
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      styleMap: [
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
        "p[style-name='Title'] => h1:fresh",
      ],
    }
  );
  const warnings = (result.messages || [])
    .filter((m) => m.type === "warning")
    .map((m) => m.message);
  return {
    html: result.value || "",
    suggestedTitle: titleFromFilename(file.name),
    warnings,
  };
}

async function parseHtmlFile(file) {
  const text = await file.text();
  const doc = new DOMParser().parseFromString(text, "text/html");
  const titleEl = doc.querySelector("title");
  const suggestedTitle = normalizeHeadingText(titleEl?.textContent) || titleFromFilename(file.name);
  const bodyHtml = doc.body?.innerHTML || text;
  return { html: bodyHtml, suggestedTitle, warnings: [] };
}

/**
 * Full import pipeline from file → Alysum sections + metadata.
 * @returns {Promise<{ sections, words, chapterCount, warnings, suggestedTitle }>}
 */
export async function importManuscriptFile(file) {
  const { html, suggestedTitle, warnings } = await parseManuscriptFile(file);
  if (!html.trim()) throw new Error("The file appears to be empty.");

  const drafts = splitHtmlIntoChapters(html);
  const sections = buildSectionsFromChapterDrafts(drafts);
  const words = countSectionsWords(sections);
  const chapterCount = sections.body.length;

  return {
    sections,
    words,
    chapterCount,
    warnings,
    suggestedTitle,
    preview: drafts.map((d) => ({
      title: d.title,
      wordCount: countWordsFromHTML(d.contentHtml),
      isFrontMatter: d.isFrontMatter,
    })),
  };
}
