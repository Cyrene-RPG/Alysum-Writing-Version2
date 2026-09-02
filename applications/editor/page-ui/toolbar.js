import {
    EDITOR_FONT_GROUPS,
    EDITOR_FONT_SIZES,
    DEFAULT_FONT_ID,
    DEFAULT_FONT_SIZE_PX,
    fontStackForId,
    normalizeFontId,
    normalizeFontSize
} from "./font-catalog.js";
import {
    ensureAllEditorGoogleFonts,
    ensureEditorGoogleFont,
    loadEditorGoogleFontBootstrap
} from "./editor-google-fonts.js";
import { SCENE_BREAK_PRESETS, buildSceneBreakHtml } from "./scene-breaks.js";

const INDENT_KEY = "alysum:editor:auto-indent";
const SPACE_KEY = "alysum:editor:line-spacing";
const LINE_SPACES = ["book", "compact", "comfortable", "relaxed"];
const SPACE_LABELS = {
    book: "Book",
    compact: "Compact",
    comfortable: "Comfortable",
    relaxed: "Relaxed"
};
const DEFAULT_LINE_SPACE = "comfortable";

const ACTIONS = [
    { command: "bold", label: "B", title: "Bold" },
    { command: "italic", label: "I", title: "Italic" },
    { command: "underline", label: "U", title: "Underline" },
    { command: "strikeThrough", label: "S", title: "Strikethrough" },
    { command: "formatBlock", value: "h1", label: "H1", title: "Heading 1" },
    { command: "formatBlock", value: "h2", label: "H2", title: "Heading 2" },
    { command: "insertUnorderedList", label: "•", title: "Bullet list" },
    { command: "insertOrderedList", label: "1.", title: "Numbered list" },
    { command: "formatBlock", value: "blockquote", label: "“”", title: "Block quote" },
    { command: "undo", label: "↶", title: "Undo" },
    { command: "redo", label: "↷", title: "Redo" }
];

const SEARCH_ICON = `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="6.5" cy="6.5" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10.2 10.2 L14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;

function readAutoIndent() {
    try {
        return localStorage.getItem(INDENT_KEY) !== "0";
    } catch {
        return true;
    }
}

function writeAutoIndent(on) {
    try {
        localStorage.setItem(INDENT_KEY, on ? "1" : "0");
    } catch {
        /* ignore */
    }
}

function readLineSpacing() {
    try {
        const value = localStorage.getItem(SPACE_KEY);
        return LINE_SPACES.includes(value) ? value : DEFAULT_LINE_SPACE;
    } catch {
        return DEFAULT_LINE_SPACE;
    }
}

function writeLineSpacing(value) {
    try {
        localStorage.setItem(SPACE_KEY, value);
    } catch {
        /* ignore */
    }
}

function breakPreview(preset) {
    if (preset.type === "rule") {
        return `<hr class="scene-rule writer-break-preview-rule" />`;
    }
    if (preset.type === "spacer") {
        return `<span class="writer-break-preview-gap">blank</span>`;
    }
    return buildSceneBreakHtml(preset.id).replace(
        'class="scene-break',
        'class="scene-break writer-break-preview'
    );
}

function fontMenuHtml() {
    return EDITOR_FONT_GROUPS.map((group) => {
        const fonts = group.fonts.map((font) => (
            `<button type="button" class="writer-menu-item writer-font-face" data-font-id="${font.id}" style="font-family:${font.stack}" title="${font.label}">${font.label}</button>`
        )).join("");
        return `<div class="writer-font-group"><p class="writer-font-group-label">${group.label}</p>${fonts}</div>`;
    }).join("");
}

function sizeMenuHtml() {
    return EDITOR_FONT_SIZES.map((s) => (
        `<button type="button" class="writer-menu-item writer-font-size" data-font-size="${s.px}">${s.px}</button>`
    )).join("");
}

function spacingMenuHtml() {
    return LINE_SPACES.map((value) => (
        `<button type="button" class="writer-menu-item writer-line-space" data-line-space="${value}">${SPACE_LABELS[value]}</button>`
    )).join("");
}

function breakMenuHtml() {
    return SCENE_BREAK_PRESETS.map((preset) => (
        `<button type="button" class="writer-menu-item writer-break-pick" data-break-id="${preset.id}" title="${preset.name}">
            <span class="writer-break-pick-name">${preset.name}</span>
            ${breakPreview(preset)}
        </button>`
    )).join("");
}

function menuBlock(id, label, title, body) {
    return `<div class="writer-tool-menu" data-menu="${id}">
        <button type="button" class="writer-tool writer-tool--menu" data-menu-toggle="${id}" aria-expanded="false" aria-haspopup="true" title="${title}" aria-label="${label}">${label}</button>
        <div class="writer-tool-dropdown writer-tool-dropdown--${id}" hidden>${body}</div>
    </div>`;
}

function paintActive(mount, typography, activeFontId) {
    const fontId = normalizeFontId(activeFontId || typography.fontId || DEFAULT_FONT_ID);
    const size = normalizeFontSize(typography.fontSizePx || DEFAULT_FONT_SIZE_PX);
    mount.querySelectorAll(".writer-font-face").forEach((btn) => {
        btn.classList.toggle("is-active", btn.dataset.fontId === fontId);
    });
    mount.querySelectorAll(".writer-font-size").forEach((btn) => {
        btn.classList.toggle("is-active", btn.dataset.fontSize === String(size));
    });
}

export function mountToolbar({
    mount,
    editor,
    pageEl,
    onTypewriter,
    onFind,
    onTypographyChange,
    getChapterTypography
}) {
    if (!mount || !editor) return;

    const indentOn = readAutoIndent();
    editor.setAutoIndent(indentOn);
    // In-session source of truth — stays correct even where localStorage throws.
    let currentSpacing = readLineSpacing();
    if (pageEl) pageEl.dataset.writerSpace = currentSpacing;
    void loadEditorGoogleFontBootstrap();

    const wordcount = mount.querySelector(".writer-wordcount");
    mount.innerHTML = [
        `<button type="button" class="writer-tool" data-indent-toggle aria-pressed="${indentOn ? "true" : "false"}" title="Auto indent" aria-label="Auto indent">Indent</button>`,
        ...ACTIONS.map((action) => (
            `<button type="button" class="writer-tool" data-command="${action.command}" data-value="${action.value || ""}" title="${action.title}" aria-label="${action.title}">${action.label}</button>`
        )),
        menuBlock("font", "Font", "Font", fontMenuHtml()),
        menuBlock("size", "Size", "Text size", sizeMenuHtml()),
        menuBlock("spacing", "Spacing", "Line spacing", spacingMenuHtml()),
        menuBlock("breaks", "Breaks", "Scene break", breakMenuHtml()),
        `<button type="button" class="writer-tool writer-tool--find" data-find-toggle title="Find" aria-label="Find">${SEARCH_ICON}</button>`,
        `<button type="button" class="writer-tool writer-tool--type" data-typewriter title="Typewriter mode" aria-label="Typewriter mode">Type</button>`
    ].join("");
    if (wordcount) mount.appendChild(wordcount);

    function typography() {
        return getChapterTypography?.() || { fontId: DEFAULT_FONT_ID, fontSizePx: String(DEFAULT_FONT_SIZE_PX) };
    }

    function paintSpacing() {
        mount.querySelectorAll(".writer-line-space").forEach((btn) => {
            btn.classList.toggle("is-active", btn.dataset.lineSpace === currentSpacing);
        });
    }

    function closeMenus() {
        mount.querySelectorAll(".writer-tool-dropdown").forEach((el) => {
            el.hidden = true;
        });
        mount.querySelectorAll("[data-menu-toggle]").forEach((btn) => {
            btn.setAttribute("aria-expanded", "false");
        });
    }

    function openMenu(id) {
        closeMenus();
        const wrap = mount.querySelector(`[data-menu="${id}"]`);
        const panel = wrap?.querySelector(".writer-tool-dropdown");
        const btn = wrap?.querySelector("[data-menu-toggle]");
        if (!panel) return;
        if (id === "font") void ensureAllEditorGoogleFonts();
        paintActive(mount, typography(), editor.activeFontId?.());
        paintSpacing();
        panel.hidden = false;
        btn?.setAttribute("aria-expanded", "true");
    }

    mount.addEventListener("mousedown", (event) => {
        if (event.target.closest(".writer-tool, .writer-tool-dropdown")) event.preventDefault();
    });

    mount.addEventListener("click", (event) => {
        const indentBtn = event.target.closest("[data-indent-toggle]");
        if (indentBtn) {
            closeMenus();
            const next = indentBtn.getAttribute("aria-pressed") !== "true";
            indentBtn.setAttribute("aria-pressed", next ? "true" : "false");
            writeAutoIndent(next);
            editor.setAutoIndent(next);
            return;
        }
        if (event.target.closest("[data-typewriter]")) {
            closeMenus();
            onTypewriter?.();
            return;
        }
        if (event.target.closest("[data-find-toggle]")) {
            closeMenus();
            onFind?.();
            return;
        }
        const menuBtn = event.target.closest("[data-menu-toggle]");
        if (menuBtn) {
            const id = menuBtn.dataset.menuToggle;
            const panel = mount.querySelector(`[data-menu="${id}"] .writer-tool-dropdown`);
            if (panel && !panel.hidden) closeMenus();
            else openMenu(id);
            return;
        }
        const sizeBtn = event.target.closest("[data-font-size]");
        if (sizeBtn) {
            const fontSizePx = normalizeFontSize(sizeBtn.dataset.fontSize);
            onTypographyChange?.({ fontSizePx });
            paintActive(mount, { ...typography(), fontSizePx }, editor.activeFontId?.());
            closeMenus();
            return;
        }
        const faceBtn = event.target.closest("[data-font-id]");
        if (faceBtn) {
            const fontId = normalizeFontId(faceBtn.dataset.fontId);
            void ensureEditorGoogleFont(fontId);
            const result = editor.applyFont(fontId);
            if (result?.mode === "chapter") onTypographyChange?.({ fontId });
            paintActive(mount, typography(), result?.fontId || fontId);
            closeMenus();
            return;
        }
        const spaceBtn = event.target.closest("[data-line-space]");
        if (spaceBtn) {
            const value = spaceBtn.dataset.lineSpace;
            if (LINE_SPACES.includes(value)) {
                currentSpacing = value;
                writeLineSpacing(value);
                if (pageEl) pageEl.dataset.writerSpace = value;
                paintSpacing();
            }
            closeMenus();
            return;
        }
        const breakBtn = event.target.closest("[data-break-id]");
        if (breakBtn) {
            editor.insertSceneBreak(breakBtn.dataset.breakId);
            closeMenus();
            return;
        }
        const btn = event.target.closest(".writer-tool");
        if (!btn?.dataset.command) return;
        closeMenus();
        editor.command(btn.dataset.command, btn.dataset.value || undefined);
    });

    document.addEventListener("mousedown", (event) => {
        if (mount.contains(event.target)) return;
        closeMenus();
    });

    window.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        const open = mount.querySelector(".writer-tool-dropdown:not([hidden])");
        if (!open) return;
        event.preventDefault();
        closeMenus();
    });

    return {
        closePopover: closeMenus,
        closeMenus,
        isPopoverOpen() {
            return !!mount.querySelector(".writer-tool-dropdown:not([hidden])");
        },
        syncTypography() {
            paintActive(mount, typography(), editor.activeFontId?.());
        }
    };
}

export { fontStackForId };
