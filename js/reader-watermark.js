/**
 * Forensic-style read stamps for public/beta readers (leak tracing, light deterrence).
 * Does not prevent copying or screenshots.
 */

const STYLE_ID = "alysum-reader-watermark-style";
const STYLE_VERSION = 3;
const LS_GUEST = "alysum-reader-guest-mark";

function injectStyles() {
  const existing = document.getElementById(STYLE_ID);
  if (existing && existing.dataset.version === String(STYLE_VERSION)) return;

  let el = existing;
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.dataset.version = String(STYLE_VERSION);
  el.textContent = `
.alysum-rw-wrap {
  position: relative;
}
.alysum-rw-sheet {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  user-select: none;
  display: grid;
  grid-template-columns: repeat(3, minmax(260px, 1fr));
  grid-auto-rows: minmax(180px, auto);
  opacity: 0.08;
}
body.light .alysum-rw-sheet {
  opacity: 0.1;
}
.alysum-rw-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  transform: rotate(-19deg);
  font-size: clamp(24px, 4.5vw, 40px);
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
  color: inherit;
}
.alysum-rw-footer {
  position: relative;
  z-index: 1;
  margin-top: 4px;
  padding: 8px 24px 18px;
  font-size: 13px;
  line-height: 1.45;
  font-weight: 600;
  letter-spacing: 0.02em;
  opacity: 0.72;
  user-select: none;
  color: var(--muted);
}
body.light .alysum-rw-footer {
  opacity: 0.78;
}
.alysum-rw-body {
  position: relative;
  z-index: 1;
}
`;
  if (!existing) document.head.appendChild(el);
}

export function getGuestReaderMark() {
  try {
    let t = localStorage.getItem(LS_GUEST);
    if (!t) {
      t = "g" + Math.random().toString(36).slice(2, 11);
      localStorage.setItem(LS_GUEST, t);
    }
    return t;
  } catch {
    return "guest";
  }
}

/**
 * @param {{ bookId: string | null, currentUser: { uid?: string, email?: string | null, displayName?: string | null } | null, profileUsername?: string | null, bookOwnerUsername?: string | null }} opts
 */
export function buildReaderWatermarkLines(opts) {
  const bookId = opts.bookId || "";
  const currentUser = opts.currentUser || null;
  const profileUsername = opts.profileUsername ? String(opts.profileUsername).trim() : "";
  const ownerUsername = opts.bookOwnerUsername
    ? String(opts.bookOwnerUsername).trim().replace(/^@/, "")
    : "";

  const dateStr = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
  const bookPart = bookId.length >= 6 ? bookId.slice(0, 8) : "—";

  let who;
  let ownerLabel = "";
  if (ownerUsername) {
    who = `@${ownerUsername}`;
    ownerLabel = `@${ownerUsername}`;
  } else if (currentUser?.uid) {
    const fromEmail =
      currentUser.email && String(currentUser.email).includes("@")
        ? String(currentUser.email).split("@")[0]
        : "";
    const dn = String(currentUser.displayName || "").trim();
    const un = profileUsername.replace(/^@/, "");
    who = un ? `@${un}` : dn ? dn : fromEmail ? `@${fromEmail}` : `reader …${currentUser.uid.slice(-6)}`;
  } else {
    who = `read-as ${getGuestReaderMark()}`;
  }

  const footer = ownerLabel
    ? `© ${ownerLabel} on Alysum · book ${bookPart} · ${dateStr}`
    : `Personal read stamp · Alysum · ${who} · book ${bookPart} · ${dateStr}`;
  const gridSource = `Alysum ${who} ${bookPart}`.replace(/\s+/g, " ");
  const grid = gridSource.length > 72 ? gridSource.slice(0, 72) : gridSource;
  return { footer, grid };
}

export function renderWatermarkCells(sheetEl, gridPhrase, cellCount = 16) {
  if (!sheetEl) return;
  sheetEl.innerHTML = "";
  if (!gridPhrase) return;
  const n = Math.max(6, Math.min(20, cellCount));
  for (let i = 0; i < n; i++) {
    const span = document.createElement("span");
    span.className = "alysum-rw-cell";
    span.setAttribute("aria-hidden", "true");
    span.textContent = gridPhrase;
    sheetEl.appendChild(span);
  }
}

/**
 * @param {HTMLElement | null} sheetEl
 * @param {HTMLElement | null} footerEl
 * @param {{ bookId: string | null, currentUser: { uid?: string, email?: string | null, displayName?: string | null } | null, profileUsername?: string | null, bookOwnerUsername?: string | null }} opts
 */
export function applyReaderWatermark(sheetEl, footerEl, opts) {
  injectStyles();
  if (!sheetEl && !footerEl) return;

  const { bookId } = opts;
  if (!bookId) {
    if (sheetEl) sheetEl.innerHTML = "";
    if (footerEl) footerEl.textContent = "";
    return;
  }

  const { footer, grid } = buildReaderWatermarkLines(opts);
  if (footerEl) footerEl.textContent = footer;
  if (sheetEl) renderWatermarkCells(sheetEl, grid);
}
