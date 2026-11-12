import { supabase } from "/core/authentication/client.js";
import { resolveStudioSession } from "/core/desktop/studio-session.js";
import { goToLogin } from "/core/desktop/app.js";
import { userHasArtistAccess } from "@alysum/artist/access.js";
import { fetchArtistHubProfile } from "@alysum/artist/character-store.js";
import { addArtwork } from "@alysum/artist/artwork-store.js";
import { uploadArtistImage } from "@alysum/artist/media.js";
import {
    BLEND_MODES,
    BRUSHES,
    CANVAS_PRESETS,
    PAPER_COLORS,
    addLayer,
    brushById,
    brushCategories,
    canvasMemoryMb,
    clampDpi,
    measureFromPixels,
    pixelsFromMeasure,
    screenCanvasSize,
    undoLimitFor,
    createStudioDocument,
    deleteLayer,
    duplicateLayer,
    hexToRgb,
    hsvToRgb,
    moveLayer,
    rgbToHex,
    rgbToHsv,
    updateLayer,
} from "@alysum/artist/studio.js";
import { createPainter } from "./studio-paint.js";
import { createDrawStore } from "./studio-store.js";

const ICONS = {
    wrench: `<svg viewBox="0 0 24 24"><path d="M14.7 6.3a4.5 4.5 0 0 0-6.2 6.2L4 17l3 3 4.5-4.5a4.5 4.5 0 0 0 6.2-6.2L15 12l-3-3 2.7-2.7z"/></svg>`,
    wand: `<svg viewBox="0 0 24 24"><path d="M4 20 16 8M14 6l4-4 4 4-4 4M3 21l2-2"/></svg>`,
    lasso: `<svg viewBox="0 0 24 24"><path d="M8 7c0-3 8-3 8 1 0 5-9 4-9 9 0 3 6 3 7-1"/></svg>`,
    move: `<svg viewBox="0 0 24 24"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/></svg>`,
    brush: `<svg viewBox="0 0 24 24"><path d="M14 4l6 6-8 8H6v-6L14 4zM4 20h6"/></svg>`,
    smudge: `<svg viewBox="0 0 24 24"><path d="M8 14c0-4 2-8 4-10 1 3 2 5 2 8 2-2 3-5 3-7 2 3 3 6 3 9a6 6 0 0 1-12 0z"/></svg>`,
    eraser: `<svg viewBox="0 0 24 24"><path d="M4 16l8-8 6 6-6 6H8L4 16zM9 20h11"/></svg>`,
    layers: `<svg viewBox="0 0 24 24"><path d="M12 3l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 17l9 5 9-5"/></svg>`,
    undo: `<svg viewBox="0 0 24 24"><path d="M8 8H4v4M4 12a8 8 0 1 0 2.3-5.7L4 8"/></svg>`,
    redo: `<svg viewBox="0 0 24 24"><path d="M16 8h4v4M20 12a8 8 0 1 1-2.3-5.7L20 8"/></svg>`,
    fit: `<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>`,
};

export async function mountDrawApp(root, env) {
    const store = env.store;
    const prefs = loadPrefs();
    const brushSettings = {};
    for (const brush of BRUSHES) {
        brushSettings[brush.id] = {
            size: Number(prefs.sizes?.[brush.id]) || brush.defaultSize,
            opacity: Number(prefs.opacities?.[brush.id] ?? brush.defaultOpacity),
            streamline: brush.streamline,
        };
    }
    const state = {
        doc: null,
        tool: "paint",
        brushes: { paint: prefs.paint || "studio-pen", smudge: prefs.smudge || "soft-airbrush", erase: prefs.erase || "hard-airbrush" },
        color: prefs.color || "#1c1c1e",
        hsv: rgbToHsv(...Object.values(hexToRgb(prefs.color || "#1c1c1e"))),
        colors: prefs.colors || ["#1c1c1e", "#ffffff", "#ff3b30", "#ff9f0a", "#ffd60a", "#32d74b", "#0a84ff", "#bf5af2"],
        panel: null,
        panelSide: "right",
        selectMode: "freehand",
        selectCombine: "replace",
        quickShape: prefs.quickShape !== false,
        showCursor: prefs.showCursor !== false,
        frames: [],
        dirty: false,
        saveTimer: 0,
    };

    root.innerHTML = `
        <section class="draw-gallery" id="draw-gallery">
            <header class="draw-gallery-head">
                <div class="draw-gallery-bar">
                    <a href="/artist">Characters</a>
                    <button type="button" class="draw-new" id="draw-new">New canvas</button>
                </div>
                <div class="draw-gallery-heading">
                    <p class="draw-kicker">Studio</p>
                    <h1>Draw</h1>
                </div>
            </header>
            <div class="draw-cards" id="draw-cards"></div>
        </section>
        <section class="draw-stage" id="draw-stage" hidden>
            <header class="draw-top">
                <button type="button" class="draw-gallery-btn" id="draw-back">Gallery</button>
                <button type="button" class="draw-title" id="draw-title">Untitled Canvas</button>
                <div class="draw-top-actions">
                    <button type="button" id="draw-undo" aria-label="Undo">${ICONS.undo}</button>
                    <button type="button" id="draw-redo" aria-label="Redo">${ICONS.redo}</button>
                    <button type="button" id="draw-fit" aria-label="Fit canvas">${ICONS.fit}</button>
                </div>
            </header>
            <div class="draw-body">
                <nav class="draw-rail draw-rail-left" aria-label="Canvas tools">
                    ${railButton("actions", "wrench", "Actions")}
                    ${railButton("adjust", "wand", "Adjustments")}
                    ${railButton("select", "lasso", "Selection")}
                    ${railButton("transform", "move", "Transform")}
                </nav>
                <div class="draw-viewport" id="draw-viewport">
                    <canvas id="draw-canvas"></canvas>
                    <div class="draw-cursor" id="draw-cursor" hidden></div>
                    <div class="draw-loupe" id="draw-loupe" hidden><canvas width="112" height="112"></canvas></div>
                </div>
                <div class="draw-sliders" id="draw-sliders">
                    <label>Size<input id="draw-size" type="range" min="1" max="240" value="8"></label>
                    <label>Opacity<input id="draw-opacity" type="range" min="1" max="100" value="100"></label>
                </div>
                <nav class="draw-rail draw-rail-right" aria-label="Paint tools">
                    ${railButton("paint", "brush", "Brush")}
                    ${railButton("smudge", "smudge", "Smudge")}
                    ${railButton("erase", "eraser", "Eraser")}
                    ${railButton("layers", "layers", "Layers")}
                    <button type="button" class="draw-tool draw-color-btn" data-panel="color" aria-label="Color"><span id="draw-swatch"></span></button>
                </nav>
            </div>
            <aside class="draw-panel from-right" id="draw-panel" hidden></aside>
            <p class="draw-toast" id="draw-toast" hidden></p>
            <div class="draw-timelapse" id="draw-timelapse" hidden><img alt=""></div>
        </section>
        <button type="button" class="draw-notice" id="draw-notice">
            <strong>Work in progress</strong>
            <span>Tap for details</span>
        </button>
        <dialog class="draw-sheet" id="draw-notice-dialog">
            <form method="dialog">
                <h2>Work in progress</h2>
                <p class="draw-notice-copy">This is a work in progress. Features may break. It works best on a tablet.</p>
                <div class="draw-sheet-actions">
                    <button type="submit" class="draw-new">OK</button>
                </div>
            </form>
        </dialog>
        <dialog class="draw-sheet draw-create-sheet" id="draw-sheet">
            <form method="dialog" id="draw-create" class="draw-create">
                <header class="draw-create-bar">
                    <button type="button" id="draw-cancel">Cancel</button>
                    <h2>New canvas</h2>
                    <button type="submit" class="draw-new">Create</button>
                </header>
                <div class="draw-create-body">
                    <div class="draw-create-stage">
                        <div class="draw-sheetlet" id="draw-sheetlet"></div>
                        <p id="draw-canvas-preview"></p>
                        <p class="draw-note" id="draw-canvas-physical"></p>
                        <p class="draw-note" id="draw-canvas-memory"></p>
                    </div>
                    <div class="draw-create-settings">
                        <label class="draw-field">Name<input name="title" id="draw-canvas-name" maxlength="80" value="Untitled Canvas"></label>
                        <div class="draw-segment" id="draw-units" role="group" aria-label="Units"></div>
                        <div class="draw-dims">
                            <label>Width<input id="draw-width-input" inputmode="decimal"></label>
                            <button type="button" id="draw-flip" aria-label="Swap width and height">Swap</button>
                            <label>Height<input id="draw-height-input" inputmode="decimal"></label>
                        </div>
                        <input type="hidden" name="width" value="1600">
                        <input type="hidden" name="height" value="1200">
                        <div class="draw-segment" id="draw-dpi" role="group" aria-label="Resolution"></div>
                        <p class="draw-field-label">Paper</p>
                        <div class="draw-bgs" id="draw-bgs"></div>
                        <p class="draw-field-label">Presets</p>
                        <div class="draw-presets" id="draw-presets"></div>
                    </div>
                </div>
            </form>
        </dialog>
        <dialog class="draw-sheet draw-help" id="draw-help">
            <form method="dialog">
                <h2>Gestures</h2>
                <ul>
                    <li>Draw with one finger, the pencil, or the mouse.</li>
                    <li>Pinch to zoom, twist to rotate, drag with two fingers to move.</li>
                    <li>Tap with two fingers to undo. Tap with three to redo.</li>
                    <li>Hold still on a stroke to snap a line, ellipse, or rectangle.</li>
                    <li>Hold without moving to pick a color.</li>
                    <li>Drag the color button onto the canvas to fill.</li>
                    <li>Drag up or down on the brush, smudge, or eraser to change size.</li>
                </ul>
                <button type="submit" class="draw-new">Start drawing</button>
            </form>
        </dialog>`;

    const gallery = root.querySelector("#draw-gallery");
    const stage = root.querySelector("#draw-stage");
    const viewport = root.querySelector("#draw-viewport");
    const canvas = root.querySelector("#draw-canvas");
    const painter = createPainter(canvas);
    const cursor = root.querySelector("#draw-cursor");
    const loupe = root.querySelector("#draw-loupe");
    const panel = root.querySelector("#draw-panel");
    const toast = root.querySelector("#draw-toast");
    const sheet = root.querySelector("#draw-sheet");
    const help = root.querySelector("#draw-help");
    const noticeDialog = root.querySelector("#draw-notice-dialog");
    root.querySelector("#draw-notice").addEventListener("click", () => {
        if (!noticeDialog.open) noticeDialog.showModal();
    });
    let pointers = new Map();
    let gesture = null;
    let holdTimer = 0;
    let eyedrop = false;
    let quickLocked = false;
    let reach = 0;
    let origin = null;
    let spaceDown = false;
    let panDrag = null;
    let selectDraft = null;
    let transformDrag = null;
    let colorDrag = null;

    function toastMessage(text) {
        toast.hidden = !text;
        toast.textContent = text || "";
        if (!text) return;
        clearTimeout(toastMessage.timer);
        toastMessage.timer = setTimeout(() => { toast.hidden = true; }, 2800);
    }

    function activeBrushId() {
        if (state.tool === "erase") return state.brushes.erase;
        if (state.tool === "smudge") return state.brushes.smudge;
        return state.brushes.paint;
    }

    function activeSettings() {
        return brushSettings[activeBrushId()];
    }

    function liveBrush() {
        const base = brushById(activeBrushId());
        const settings = activeSettings();
        return { ...base, streamline: settings.streamline };
    }

    function savePrefs() {
        const sizes = {};
        const opacities = {};
        for (const [id, settings] of Object.entries(brushSettings)) {
            sizes[id] = settings.size;
            opacities[id] = settings.opacity;
        }
        localStorage.setItem("alysum-draw-prefs", JSON.stringify({
            sizes, opacities, color: state.color, colors: state.colors.slice(0, 12),
            paint: state.brushes.paint, smudge: state.brushes.smudge, erase: state.brushes.erase,
            quickShape: state.quickShape, showCursor: state.showCursor,
        }));
    }

    function setColor(hex) {
        state.color = hex;
        state.hsv = rgbToHsv(hexToRgb(hex).r, hexToRgb(hex).g, hexToRgb(hex).b);
        root.querySelector("#draw-swatch").style.background = hex;
        if (state.panel === "color") renderPanel();
        savePrefs();
    }

    function rememberColor() {
        if (state.colors[0] === state.color) return;
        state.colors = [state.color, ...state.colors.filter((color) => color !== state.color)].slice(0, 12);
        savePrefs();
    }

    function refreshChrome() {
        root.querySelector("#draw-title").textContent = state.doc?.name || "Untitled Canvas";
        root.querySelector("#draw-undo").disabled = !painter.canUndo;
        root.querySelector("#draw-redo").disabled = !painter.canRedo;
        root.querySelector("#draw-swatch").style.background = state.color;
        const settings = activeSettings();
        root.querySelector("#draw-size").value = String(Math.round(settings.size));
        root.querySelector("#draw-opacity").value = String(Math.round(settings.opacity * 100));
        root.querySelector("#draw-sliders").hidden = !["paint", "smudge", "erase"].includes(state.tool);
        for (const button of root.querySelectorAll(".draw-tool")) {
            const key = button.dataset.tool || button.dataset.panel;
            const on = key === state.tool || (state.panel && key === state.panel && !button.dataset.tool);
            button.classList.toggle("is-on", key === state.tool || (button.dataset.panel === state.panel && !["paint", "smudge", "erase", "select", "transform"].includes(state.tool) && button.dataset.panel === state.panel));
            button.classList.toggle("is-on", on && (button.dataset.tool ? button.dataset.tool === state.tool : button.dataset.panel === state.panel));
        }
        for (const button of root.querySelectorAll("[data-tool]")) {
            button.classList.toggle("is-on", button.dataset.tool === state.tool);
        }
        for (const button of root.querySelectorAll("[data-panel]")) {
            if (button.dataset.tool) continue;
            button.classList.toggle("is-on", button.dataset.panel === state.panel);
        }
    }

    function localPoint(event) {
        const rect = canvas.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    function resize() {
        const rect = viewport.getBoundingClientRect();
        painter.resizeView(rect.width, rect.height);
        if (state.doc && painter.view.zoom === 1 && painter.view.panX === 40) painter.fit();
    }

    async function showGallery() {
        if (state.doc && state.dirty) await persist();
        state.doc = null;
        stage.hidden = true;
        gallery.hidden = false;
        panel.hidden = true;
        const cards = root.querySelector("#draw-cards");
        cards.replaceChildren();
        let rows = [];
        try { rows = await store.list(); } catch (error) { toastMessage(error.message || "Could not open saved canvases."); }
        const openNew = () => root.querySelector("#draw-new").click();
        if (!rows.length) {
            const empty = document.createElement("button");
            empty.type = "button";
            empty.className = "draw-empty";
            const page = document.createElement("span");
            page.className = "draw-paper";
            page.setAttribute("aria-hidden", "true");
            const title = document.createElement("strong");
            title.textContent = "Start a canvas";
            const note = document.createElement("span");
            note.textContent = "A blank page, kept on this device until you save a copy to My art.";
            empty.append(page, title, note);
            empty.addEventListener("click", openNew);
            cards.append(empty);
        } else {
            const create = document.createElement("button");
            create.type = "button";
            create.className = "draw-card-new";
            const page = document.createElement("span");
            page.className = "draw-paper";
            page.setAttribute("aria-hidden", "true");
            const title = document.createElement("strong");
            title.textContent = "New canvas";
            create.append(page, title);
            create.addEventListener("click", openNew);
            cards.append(create);
        }
        for (const row of rows) {
            const card = document.createElement("article");
            card.className = "draw-card";
            const open = document.createElement("button");
            open.type = "button";
            open.className = "draw-card-open";
            if (row.thumb) {
                const img = document.createElement("img");
                img.src = row.thumb;
                img.alt = "";
                open.append(img);
            } else {
                const page = document.createElement("span");
                page.className = "draw-paper";
                page.setAttribute("aria-hidden", "true");
                open.append(page);
            }
            const name = document.createElement("strong");
            name.textContent = row.name || "Untitled Canvas";
            const meta = document.createElement("span");
            meta.textContent = `${row.width} × ${row.height}`;
            open.append(name, meta);
            open.addEventListener("click", () => openProject(row.id));
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "draw-card-delete";
            remove.textContent = "Delete";
            remove.addEventListener("click", async () => {
                await store.remove(row.id);
                showGallery();
            });
            card.append(open, remove);
            cards.append(card);
        }
    }

    async function openProject(id) {
        const loaded = await store.load(id);
        if (!loaded) { toastMessage("That canvas is gone."); return showGallery(); }
        state.doc = createStudioDocument(loaded.doc);
        painter.setDocument(state.doc);
        await Promise.all([...loaded.blobs].map(([layerId, blob]) => painter.loadLayerBlob(layerId, blob)));
        gallery.hidden = true;
        stage.hidden = false;
        state.dirty = false;
        state.frames = [];
        history.replaceState(null, "", `/artist-draw?id=${encodeURIComponent(id)}`);
        requestAnimationFrame(() => { resize(); painter.fit(); refreshChrome(); });
        if (!localStorage.getItem("alysum-draw-help")) {
            localStorage.setItem("alysum-draw-help", "1");
            help.showModal();
        }
    }

    function openFresh(partial) {
        state.doc = createStudioDocument({ ...partial, characterId: env.characterId || "" });
        painter.setDocument(state.doc);
        gallery.hidden = true;
        stage.hidden = false;
        state.dirty = true;
        state.frames = [];
        history.replaceState(null, "", `/artist-draw?id=${encodeURIComponent(state.doc.id)}`);
        requestAnimationFrame(() => { resize(); painter.fit(); refreshChrome(); scheduleSave(); });
    }

    async function persist() {
        if (!state.doc) return;
        const blobs = new Map();
        for (const layer of state.doc.layers) blobs.set(layer.id, await painter.layerBlob(layer.id));
        const thumb = await painter.thumbnail();
        state.doc.updatedAt = Date.now();
        await store.save(state.doc, blobs, thumb);
        state.dirty = false;
    }

    function scheduleSave() {
        state.dirty = true;
        clearTimeout(state.saveTimer);
        state.saveTimer = setTimeout(() => { persist().catch((error) => toastMessage(error.message || "Could not store this canvas.")); }, 700);
    }

    function renderPanel() {
        panel.hidden = !state.panel;
        panel.classList.toggle("from-left", state.panelSide === "left");
        panel.classList.toggle("from-right", state.panelSide !== "left");
        panel.replaceChildren();
        if (!state.panel) return;
        if (state.panel === "brushes") panel.append(brushPanel());
        else if (state.panel === "layers") panel.append(layerPanel());
        else if (state.panel === "color") panel.append(colorPanel());
        else if (state.panel === "actions") panel.append(actionPanel());
        else if (state.panel === "adjust") panel.append(adjustPanel());
        else if (state.panel === "select") panel.append(selectPanel());
        else if (state.panel === "transform") panel.append(transformPanel());
        refreshChrome();
    }

    function togglePanel(name, side) {
        state.panel = state.panel === name ? null : name;
        state.panelSide = side;
        renderPanel();
    }

    function brushPanel() {
        const wrap = document.createElement("div");
        wrap.className = "draw-brush-library";
        const cats = document.createElement("div");
        cats.className = "draw-cats";
        const list = document.createElement("div");
        list.className = "draw-brush-list";
        let category = brushById(activeBrushId()).category;
        const paintList = () => {
            list.replaceChildren();
            for (const brush of BRUSHES.filter((item) => item.category === category)) {
                const button = document.createElement("button");
                button.type = "button";
                button.className = brush.id === activeBrushId() ? "is-on" : "";
                button.textContent = brush.name;
                button.addEventListener("click", () => {
                    if (state.tool === "erase") state.brushes.erase = brush.id;
                    else if (state.tool === "smudge") state.brushes.smudge = brush.id;
                    else state.brushes.paint = brush.id;
                    savePrefs();
                    paintList();
                    refreshChrome();
                });
                list.append(button);
            }
        };
        for (const name of brushCategories()) {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = name;
            button.className = name === category ? "is-on" : "";
            button.addEventListener("click", () => {
                category = name;
                for (const child of cats.children) child.classList.toggle("is-on", child.textContent === name);
                paintList();
            });
            cats.append(button);
        }
        const settings = activeSettings();
        const size = slider("Size", 1, 240, Math.round(settings.size), (value) => {
            activeSettings().size = value;
            savePrefs();
            refreshChrome();
        });
        const opacity = slider("Opacity", 1, 100, Math.round(settings.opacity * 100), (value) => {
            activeSettings().opacity = value / 100;
            savePrefs();
            refreshChrome();
        });
        const stream = slider("StreamLine", 0, 100, Math.round(settings.streamline * 100), (value) => {
            activeSettings().streamline = value / 100;
            savePrefs();
        });
        paintList();
        wrap.append(cats, list, size, opacity, stream);
        return wrap;
    }

    function layerPanel() {
        const wrap = document.createElement("div");
        const layer = state.doc.layers.find((item) => item.id === state.doc.activeLayerId);
        const opacity = slider("Opacity", 0, 100, Math.round((layer?.opacity ?? 1) * 100), (value) => {
            adopt(updateLayer(state.doc, state.doc.activeLayerId, { opacity: value / 100 }));
            painter.render();
            scheduleSave();
        });
        const blend = document.createElement("label");
        blend.className = "draw-field";
        blend.textContent = "Blend";
        const select = document.createElement("select");
        for (const mode of BLEND_MODES) {
            const option = document.createElement("option");
            option.value = mode.id;
            option.textContent = mode.label;
            option.selected = mode.id === layer?.blend;
            select.append(option);
        }
        select.addEventListener("change", () => {
            adopt(updateLayer(state.doc, state.doc.activeLayerId, { blend: select.value }));
            painter.render();
            scheduleSave();
        });
        blend.append(select);
        const list = document.createElement("div");
        list.className = "draw-layer-list";
        for (const item of [...state.doc.layers].reverse()) {
            const row = document.createElement("div");
            row.className = "draw-layer" + (item.id === state.doc.activeLayerId ? " is-on" : "");
            const eye = document.createElement("button");
            eye.type = "button";
            eye.textContent = item.visible ? "●" : "○";
            eye.addEventListener("click", (event) => {
                event.stopPropagation();
                adopt(updateLayer(state.doc, item.id, { visible: !item.visible }));
                painter.render();
                renderPanel();
                scheduleSave();
            });
            const thumb = document.createElement("img");
            thumb.alt = "";
            thumb.src = painter.layerThumbnail(item.id);
            const name = document.createElement("span");
            name.textContent = item.name;
            row.append(eye, thumb, name);
            row.addEventListener("click", () => {
                adopt({ ...state.doc, activeLayerId: item.id });
                renderPanel();
            });
            list.append(row);
        }
        const ops = document.createElement("div");
        ops.className = "draw-layer-ops";
        ops.append(
            textButton("Add", () => {
                adopt(addLayer(state.doc));
                renderPanel();
                scheduleSave();
            }),
            textButton("Up", () => reorder(1)),
            textButton("Down", () => reorder(-1)),
            textButton(layer?.alphaLock ? "Unlock alpha" : "Alpha lock", () => {
                adopt(updateLayer(state.doc, state.doc.activeLayerId, { alphaLock: !layer?.alphaLock }));
                renderPanel();
                scheduleSave();
            }),
            textButton(layer?.clipping ? "Unclip" : "Clipping mask", () => {
                adopt(updateLayer(state.doc, state.doc.activeLayerId, { clipping: !layer?.clipping }));
                painter.render();
                renderPanel();
                scheduleSave();
            }),
            textButton("Duplicate", () => {
                const result = duplicateLayer(state.doc, state.doc.activeLayerId);
                adopt(result.document);
                painter.copyPixels(result.sourceId, result.layerId);
                renderPanel();
                scheduleSave();
            }),
            textButton("Merge down", () => {
                const index = state.doc.layers.findIndex((item) => item.id === state.doc.activeLayerId);
                if (index <= 0) return;
                painter.mergeOnto(state.doc.layers[index - 1].id);
                adopt(deleteLayer(state.doc, state.doc.activeLayerId));
                renderPanel();
                scheduleSave();
            }),
            textButton("Clear", () => { painter.clearLayer(); renderPanel(); scheduleSave(); refreshChrome(); }),
            textButton("Rename", () => {
                const name = window.prompt("Layer name", layer?.name || "Layer");
                if (!name) return;
                adopt(updateLayer(state.doc, state.doc.activeLayerId, { name }));
                renderPanel();
                scheduleSave();
            }),
            textButton("Delete", () => {
                adopt(deleteLayer(state.doc, state.doc.activeLayerId));
                renderPanel();
                scheduleSave();
            }),
        );
        wrap.append(opacity, blend, list, ops);
        return wrap;
    }

    function reorder(direction) {
        const id = state.doc.activeLayerId;
        adopt(moveLayer(state.doc, id, direction));
        painter.render();
        renderPanel();
        scheduleSave();
    }

    function adopt(next) {
        state.doc = next;
        painter.syncDocument(next);
        return next;
    }

    function colorPanel() {
        const wrap = document.createElement("div");
        const disc = document.createElement("canvas");
        disc.width = 220;
        disc.height = 220;
        disc.className = "draw-disc";
        drawDisc(disc, state.hsv);
        const move = (event) => {
            const rect = disc.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / rect.width) * disc.width;
            const y = ((event.clientY - rect.top) / rect.height) * disc.height;
            const dx = x - 110;
            const dy = y - 110;
            const dist = Math.hypot(dx, dy);
            if (dist > 78) {
                state.hsv = { ...state.hsv, h: (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360 };
            } else {
                const s = Math.min(1, Math.max(0, (x - 48) / 124));
                const v = Math.min(1, Math.max(0, 1 - (y - 48) / 124));
                state.hsv = { ...state.hsv, s, v };
            }
            const rgb = hsvToRgb(state.hsv.h, state.hsv.s, state.hsv.v);
            setColor(rgbToHex(rgb.r, rgb.g, rgb.b));
            drawDisc(disc, state.hsv);
        };
        disc.addEventListener("pointerdown", (event) => { disc.setPointerCapture(event.pointerId); move(event); });
        disc.addEventListener("pointermove", (event) => { if (disc.hasPointerCapture(event.pointerId)) move(event); });
        const hex = document.createElement("input");
        hex.value = state.color;
        hex.addEventListener("change", () => { if (/^#[0-9a-fA-F]{6}$/.test(hex.value)) setColor(hex.value.toLowerCase()); });
        const swatches = document.createElement("div");
        swatches.className = "draw-swatches";
        for (const color of harmony(state.hsv.h).concat(state.colors)) {
            const button = document.createElement("button");
            button.type = "button";
            button.style.background = color;
            button.addEventListener("click", () => setColor(color));
            swatches.append(button);
        }
        const note = document.createElement("p");
        note.className = "draw-note";
        note.textContent = "Drag this color onto the canvas to fill the layer. Hold on the canvas to pick.";
        wrap.append(disc, hex, swatches, note);
        return wrap;
    }

    function actionPanel() {
        const wrap = document.createElement("div");
        wrap.className = "draw-actions";
        const file = document.createElement("input");
        file.type = "file";
        file.accept = "image/png,image/jpeg,image/webp,image/gif";
        file.hidden = true;
        file.addEventListener("change", async () => {
            const image = file.files?.[0];
            if (!image) return;
            adopt(addLayer(state.doc, { name: "Image" }));
            await painter.insertImage(image);
            painter.render();
            scheduleSave();
            refreshChrome();
        });
        wrap.append(
            file,
            textButton("Insert photo", () => file.click()),
            textButton("Save to My art", () => saveToGallery()),
            textButton("Download PNG", () => downloadPng()),
            textButton("Symmetry: off", () => setSymmetry("off")),
            textButton("Symmetry: vertical", () => setSymmetry("vertical")),
            textButton("Symmetry: horizontal", () => setSymmetry("horizontal")),
            textButton("Symmetry: quadrant", () => setSymmetry("both")),
            textButton("Symmetry: radial", () => setSymmetry("radial")),
            textButton(state.quickShape ? "QuickShape on" : "QuickShape off", () => {
                state.quickShape = !state.quickShape;
                savePrefs();
                renderPanel();
            }),
            textButton("Play timelapse", () => playTimelapse()),
            textButton("Gesture guide", () => help.showModal()),
        );
        const note = document.createElement("p");
        note.className = "draw-note";
        note.textContent = state.doc.symmetry === "off"
            ? `${state.doc.width} × ${state.doc.height}. Saved copies in My art stay private.`
            : `Guide: ${state.doc.symmetry}. ${state.doc.width} × ${state.doc.height}.`;
        wrap.append(note);
        return wrap;
    }

    function setSymmetry(mode) {
        adopt({ ...state.doc, symmetry: mode });
        painter.render();
        scheduleSave();
        renderPanel();
    }

    function adjustPanel() {
        const wrap = document.createElement("div");
        let kind = null;
        const bind = (name, label, min, max, step, param) => {
            const input = slider(label, min, max, 0, () => {}, step);
            const range = input.querySelector("input");
            range.addEventListener("input", () => {
                if (kind && kind !== name) painter.commitAdjust();
                kind = name;
                painter.previewAdjust(name, { [param]: Number(range.value) });
                painter.render();
            });
            range.addEventListener("change", () => {
                painter.commitAdjust();
                kind = null;
                range.value = "0";
                refreshChrome();
                scheduleSave();
            });
            return input;
        };
        wrap.append(
            bind("hsb", "Hue", -180, 180, 1, "hue"),
            bind("hsb", "Saturation", -100, 100, 1, "saturation"),
            bind("hsb", "Brightness", -100, 100, 1, "brightness"),
            bind("blur", "Gaussian blur", 0, 24, 1, "radius"),
            bind("noise", "Noise", 0, 80, 1, "amount"),
            bind("sharpen", "Sharpen", 0, 150, 1, "amount"),
            textButton("Invert colors", () => {
                painter.previewAdjust("invert", {});
                painter.commitAdjust();
                painter.render();
                refreshChrome();
                scheduleSave();
            }),
            textButton("Cancel adjustment", () => { painter.cancelAdjust(); painter.render(); }),
        );
        const hue = wrap.querySelectorAll("input")[0];
        const sat = wrap.querySelectorAll("input")[1];
        const bri = wrap.querySelectorAll("input")[2];
        const sendHsb = () => painter.previewAdjust("hsb", { hue: Number(hue.value), saturation: Number(sat.value) / 100, brightness: Number(bri.value) / 100 });
        hue.addEventListener("input", sendHsb);
        sat.addEventListener("input", sendHsb);
        bri.addEventListener("input", sendHsb);
        const noise = wrap.querySelectorAll("input")[4];
        noise.addEventListener("input", () => painter.previewAdjust("noise", { amount: Number(noise.value) / 100 }));
        const sharp = wrap.querySelectorAll("input")[5];
        sharp.addEventListener("input", () => painter.previewAdjust("sharpen", { amount: Number(sharp.value) / 100 }));
        return wrap;
    }

    function selectPanel() {
        const wrap = document.createElement("div");
        wrap.className = "draw-actions";
        for (const [id, label] of [["freehand", "Freehand"], ["rect", "Rectangle"], ["ellipse", "Ellipse"]]) {
            const button = textButton(label, () => { state.selectMode = id; state.tool = "select"; renderPanel(); });
            if (state.selectMode === id) button.classList.add("is-on");
            wrap.append(button);
        }
        wrap.append(
            textButton(state.selectCombine === "add" ? "Adding to selection" : "Replacing selection", () => {
                state.selectCombine = state.selectCombine === "add" ? "replace" : "add";
                renderPanel();
            }),
            textButton("Select all", () => { painter.selectAll(); painter.render(); }),
            textButton("Invert", () => { painter.invertSelection(); painter.render(); }),
            textButton("Deselect", () => { painter.clearSelection(); painter.render(); }),
        );
        const note = document.createElement("p");
        note.className = "draw-note";
        note.textContent = "Draw inside the marching outline. Adjustments and fill stay inside it too.";
        wrap.append(note);
        return wrap;
    }

    function transformPanel() {
        const wrap = document.createElement("div");
        if (!painter.transforming) painter.beginTransform();
        const scale = slider("Scale", 10, 300, 100, (value) => {
            const n = value / 100;
            painter.previewTransform({ sx: n, sy: n });
            painter.render();
        });
        const rotate = slider("Rotate", -180, 180, 0, (value) => {
            painter.previewTransform({ rot: value * Math.PI / 180 });
            painter.render();
        });
        wrap.append(
            scale,
            rotate,
            textButton("Flip horizontal", () => { painter.cancelTransform(); painter.flip("h"); painter.beginTransform(); painter.render(); refreshChrome(); scheduleSave(); }),
            textButton("Flip vertical", () => { painter.cancelTransform(); painter.flip("v"); painter.beginTransform(); painter.render(); refreshChrome(); scheduleSave(); }),
            textButton("Apply transform", () => { painter.commitTransform(); painter.beginTransform(); painter.render(); refreshChrome(); scheduleSave(); }),
            textButton("Cancel transform", () => { painter.cancelTransform(); state.tool = "paint"; state.panel = null; painter.render(); renderPanel(); }),
        );
        const note = document.createElement("p");
        note.className = "draw-note";
        note.textContent = "Drag the canvas to move this layer. Scale and rotate from these sliders, then apply.";
        wrap.append(note);
        return wrap;
    }

    async function saveToGallery() {
        if (!env.upload) { toastMessage("Sign in to save a copy to My art."); return; }
        toastMessage("Saving to My art…");
        try {
            let blob = await painter.exportBlob("image/png");
            let type = "image/png";
            if (blob.size > 12 * 1024 * 1024) {
                blob = await painter.exportBlob("image/jpeg", 0.9);
                type = "image/jpeg";
            }
            const file = new File([blob], `${state.doc.name || "canvas"}.${type === "image/jpeg" ? "jpg" : "png"}`, { type });
            const uploaded = await env.upload(file, state.doc);
            toastMessage(uploaded || "Saved to My art as a private image.");
        } catch (error) {
            toastMessage(error.message || "Could not save that image.");
        }
    }

    async function downloadPng() {
        const blob = await painter.exportBlob("image/png");
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${state.doc.name || "canvas"}.png`;
        link.click();
        URL.revokeObjectURL(url);
    }

    function playTimelapse() {
        const box = root.querySelector("#draw-timelapse");
        const img = box.querySelector("img");
        if (state.frames.length < 2) { toastMessage("Draw a few strokes first."); return; }
        box.hidden = false;
        let index = 0;
        clearInterval(playTimelapse.timer);
        playTimelapse.timer = setInterval(() => {
            img.src = state.frames[index % state.frames.length];
            index += 1;
            if (index > state.frames.length + 4) {
                clearInterval(playTimelapse.timer);
                box.hidden = true;
            }
        }, 90);
    }

    function placeCursor(event) {
        if (!state.showCursor || !["paint", "smudge", "erase"].includes(state.tool)) {
            cursor.hidden = true;
            return;
        }
        const point = localPoint(event);
        const radius = Math.max(2, activeSettings().size * painter.view.zoom);
        cursor.hidden = false;
        cursor.style.width = `${radius * 2}px`;
        cursor.style.height = `${radius * 2}px`;
        cursor.style.left = `${point.x - radius}px`;
        cursor.style.top = `${point.y - radius}px`;
    }

    function showLoupe(docPoint, client) {
        const point = localPoint(client);
        loupe.hidden = false;
        loupe.style.left = `${point.x - 56}px`;
        loupe.style.top = `${Math.max(8, point.y - 150)}px`;
        painter.paintLoupe(loupe.querySelector("canvas"), docPoint.x, docPoint.y);
    }

    function armHold() {
        clearTimeout(holdTimer);
        holdTimer = setTimeout(() => {
            if (!painter.stroking || eyedrop) return;
            if (reach < 14) {
                const spot = origin;
                painter.cancelStroke();
                eyedrop = true;
                setColor(painter.pick(spot.x, spot.y));
                painter.render();
                return;
            }
            if (state.quickShape && painter.tryQuickShape()) {
                quickLocked = true;
                painter.render();
            }
        }, 460);
    }

    function selectionShape(end) {
        if (!selectDraft || !end) return null;
        if (selectDraft.mode === "rect" || selectDraft.mode === "ellipse") {
            const x = Math.min(selectDraft.x, end.x);
            const y = Math.min(selectDraft.y, end.y);
            const w = Math.abs(end.x - selectDraft.x);
            const h = Math.abs(end.y - selectDraft.y);
            if (w < 1 || h < 1) return null;
            return selectDraft.mode === "rect"
                ? { kind: "rect", x, y, w, h }
                : { kind: "ellipse", cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2 };
        }
        if (selectDraft.points.length > 1) return { kind: "freehand", points: selectDraft.points.slice() };
        return null;
    }

    function finishPointers(event) {
        if (eyedrop) {
            eyedrop = false;
            loupe.hidden = true;
            rememberColor();
            return;
        }
        if (selectDraft && pointers.size === 0) {
            painter.setDraft(null);
            const end = painter.screenToDoc(localPoint(event).x, localPoint(event).y);
            let shape = null;
            if (selectDraft.mode === "rect" || selectDraft.mode === "ellipse") {
                const x = Math.min(selectDraft.x, end.x);
                const y = Math.min(selectDraft.y, end.y);
                const w = Math.abs(end.x - selectDraft.x);
                const h = Math.abs(end.y - selectDraft.y);
                if (w > 2 && h > 2) {
                    shape = selectDraft.mode === "rect"
                        ? { kind: "rect", x, y, w, h }
                        : { kind: "ellipse", cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2 };
                }
            } else if (selectDraft.points.length > 2) shape = { kind: "freehand", points: selectDraft.points };
            if (shape) painter.selectShape(shape, state.selectCombine);
            selectDraft = null;
            painter.render();
            return;
        }
        if (transformDrag && pointers.size === 0) transformDrag = null;
        if (painter.stroking && pointers.size === 0) {
            painter.commitStroke();
            quickLocked = false;
            rememberColor();
            painter.thumbnail().then((frame) => {
                state.frames.push(frame);
                if (state.frames.length > 80) state.frames.shift();
            }).catch(() => {});
            painter.render();
            refreshChrome();
            scheduleSave();
            if (state.panel === "layers") renderPanel();
        }
    }

    viewport.addEventListener("pointerdown", (event) => {
        if (event.target.closest?.(".draw-rail, .draw-sliders, .draw-panel, .draw-top")) return;
        if (event.pointerType === "touch" && event.width > 100 && [...pointers.values()].some((item) => item.type === "pen")) return;
        try { viewport.setPointerCapture?.(event.pointerId); } catch { /* Synthetic events have no capture. */ }
        pointers.set(event.pointerId, { type: event.pointerType, x: event.clientX, y: event.clientY, ox: event.clientX, oy: event.clientY });
        if (pointers.size >= 2) {
            if (painter.stroking) painter.commitStroke();
            clearTimeout(holdTimer);
            quickLocked = false;
            const all = [...pointers.values()];
            const mid = midpoint(all[0], all[1]);
            const local = { x: mid.x - canvas.getBoundingClientRect().left, y: mid.y - canvas.getBoundingClientRect().top };
            gesture = {
                kind: pointers.size === 2 ? "pinch" : "three",
                dist: Math.hypot(all[1].x - all[0].x, all[1].y - all[0].y) || 1,
                ang: Math.atan2(all[1].y - all[0].y, all[1].x - all[0].x),
                zoom: painter.view.zoom,
                rot: painter.view.rotation,
                doc: painter.screenToDoc(local.x, local.y),
                moved: false,
            };
            return;
        }
        const docPoint = painter.screenToDoc(localPoint(event).x, localPoint(event).y);
        if (spaceDown) {
            panDrag = { x: event.clientX, y: event.clientY, panX: painter.view.panX, panY: painter.view.panY };
            return;
        }
        if (state.tool === "select") {
            selectDraft = { mode: state.selectMode, x: docPoint.x, y: docPoint.y, points: [docPoint] };
            return;
        }
        if (state.tool === "transform") {
            const current = painter.transforming || painter.beginTransform();
            transformDrag = { x: docPoint.x, y: docPoint.y, dx: current.dx, dy: current.dy };
            return;
        }
        if (event.altKey) {
            eyedrop = true;
            origin = docPoint;
            setColor(painter.pick(docPoint.x, docPoint.y));
            showLoupe(docPoint, event);
            return;
        }
        origin = docPoint;
        reach = 0;
        quickLocked = false;
        const brush = liveBrush();
        const settings = activeSettings();
        painter.beginStroke({
            tool: state.tool === "erase" ? "erase" : state.tool === "smudge" ? "smudge" : "paint",
            brush,
            color: state.color,
            size: settings.size,
            opacity: settings.opacity,
        });
        const samples = pointerSamples(event);
        for (const sample of samples) {
            painter.extendStroke(painter.screenToDoc(localPoint(sample).x, localPoint(sample).y), pressureOf(sample));
        }
        painter.render();
        armHold();
    });

    viewport.addEventListener("pointermove", (event) => {
        if (!pointers.has(event.pointerId)) { placeCursor(event); return; }
        pointers.set(event.pointerId, { ...pointers.get(event.pointerId), x: event.clientX, y: event.clientY });
        placeCursor(event);
        if (gesture?.kind === "pinch" && pointers.size >= 2) {
            const all = [...pointers.values()];
            const dist = Math.hypot(all[1].x - all[0].x, all[1].y - all[0].y) || 1;
            const ang = Math.atan2(all[1].y - all[0].y, all[1].x - all[0].x);
            const mid = midpoint(all[0], all[1]);
            if (Math.abs(dist - gesture.dist) > 6 || Math.hypot(all[0].x - all[0].ox, all[0].y - all[0].oy) > 8) gesture.moved = true;
            const zoom = Math.max(0.05, Math.min(12, gesture.zoom * (dist / gesture.dist)));
            const rotation = gesture.rot + (ang - gesture.ang);
            const local = { x: mid.x - canvas.getBoundingClientRect().left, y: mid.y - canvas.getBoundingClientRect().top };
            const pan = painter.panFor(gesture.doc, local, zoom, rotation);
            painter.view.zoom = zoom;
            painter.view.rotation = rotation;
            painter.view.panX = pan.panX;
            painter.view.panY = pan.panY;
            painter.render();
            return;
        }
        if (panDrag) {
            painter.view.panX = panDrag.panX + (event.clientX - panDrag.x);
            painter.view.panY = panDrag.panY + (event.clientY - panDrag.y);
            painter.render();
            return;
        }
        const docPoint = painter.screenToDoc(localPoint(event).x, localPoint(event).y);
        if (eyedrop) {
            setColor(painter.pick(docPoint.x, docPoint.y));
            showLoupe(docPoint, event);
            return;
        }
        if (selectDraft) {
            if (selectDraft.mode === "freehand") selectDraft.points.push(docPoint);
            painter.setDraft(selectionShape(docPoint));
            painter.render();
            return;
        }
        if (transformDrag && painter.transforming) {
            painter.previewTransform({
                dx: transformDrag.dx + (docPoint.x - transformDrag.x),
                dy: transformDrag.dy + (docPoint.y - transformDrag.y),
            });
            painter.render();
            return;
        }
        if (!painter.stroking) return;
        reach = Math.max(reach, Math.hypot(docPoint.x - origin.x, docPoint.y - origin.y));
        if (quickLocked) {
            painter.updateQuickShape(docPoint);
            painter.render();
            return;
        }
        const samples = pointerSamples(event);
        for (const sample of samples) {
            painter.extendStroke(painter.screenToDoc(localPoint(sample).x, localPoint(sample).y), pressureOf(sample));
        }
        painter.render();
        armHold();
    });

    viewport.addEventListener("pointerup", (event) => endPointer(event));
    viewport.addEventListener("pointercancel", (event) => endPointer(event));
    viewport.addEventListener("pointerleave", () => { cursor.hidden = true; });
    viewport.addEventListener("contextmenu", (event) => event.preventDefault());
    viewport.addEventListener("wheel", (event) => {
        event.preventDefault();
        const local = localPoint(event);
        if (event.ctrlKey || event.metaKey) {
            const docPoint = painter.screenToDoc(local.x, local.y);
            const zoom = Math.max(0.05, Math.min(12, painter.view.zoom * Math.exp(-event.deltaY * 0.0015)));
            const pan = painter.panFor(docPoint, local, zoom, painter.view.rotation);
            painter.view.zoom = zoom;
            painter.view.panX = pan.panX;
            painter.view.panY = pan.panY;
        } else {
            painter.view.panX -= event.deltaX;
            painter.view.panY -= event.deltaY;
        }
        painter.render();
    }, { passive: false });

    function endPointer(event) {
        const wasGesture = gesture;
        pointers.delete(event.pointerId);
        if (pointers.size === 0 && wasGesture && !wasGesture.moved && Date.now()) {
            if (wasGesture.kind === "pinch") { painter.undo(); painter.render(); refreshChrome(); }
            if (wasGesture.kind === "three") { painter.redo(); painter.render(); refreshChrome(); }
            gesture = null;
            return;
        }
        if (pointers.size === 0) gesture = null;
        if (pointers.size > 0) return;
        clearTimeout(holdTimer);
        panDrag = null;
        finishPointers(event);
    }

    root.querySelector("#draw-back").addEventListener("click", () => showGallery());
    root.querySelector("#draw-new").addEventListener("click", () => sheet.showModal());
    root.querySelector("#draw-cancel").addEventListener("click", () => sheet.close());
    root.querySelector("#draw-title").addEventListener("click", () => {
        const name = window.prompt("Canvas name", state.doc?.name || "Untitled Canvas");
        if (!name || !state.doc) return;
        adopt({ ...state.doc, name: name.slice(0, 80) });
        refreshChrome();
        scheduleSave();
    });
    root.querySelector("#draw-undo").addEventListener("click", () => { painter.undo(); painter.render(); refreshChrome(); scheduleSave(); });
    root.querySelector("#draw-redo").addEventListener("click", () => { painter.redo(); painter.render(); refreshChrome(); scheduleSave(); });
    root.querySelector("#draw-fit").addEventListener("click", () => painter.fit());
    root.querySelector("#draw-size").addEventListener("input", (event) => {
        activeSettings().size = Number(event.target.value);
        savePrefs();
    });
    root.querySelector("#draw-opacity").addEventListener("input", (event) => {
        activeSettings().opacity = Number(event.target.value) / 100;
        savePrefs();
    });
    wireToolDrag(root.querySelector('[data-tool="paint"]'), "paint");
    wireToolDrag(root.querySelector('[data-tool="smudge"]'), "smudge");
    wireToolDrag(root.querySelector('[data-tool="erase"]'), "erase");
    root.querySelector('[data-tool="select"]').addEventListener("click", () => {
        state.tool = "select";
        state.panel = "select";
        state.panelSide = "left";
        if (painter.transforming) painter.commitTransform();
        renderPanel();
    });
    root.querySelector('[data-tool="transform"]').addEventListener("click", () => {
        state.tool = "transform";
        state.panel = "transform";
        state.panelSide = "left";
        painter.beginTransform();
        painter.render();
        renderPanel();
    });
    root.querySelector('[data-panel="actions"]').addEventListener("click", () => { state.tool = state.tool; togglePanel("actions", "left"); });
    root.querySelector('[data-panel="adjust"]').addEventListener("click", () => togglePanel("adjust", "left"));
    root.querySelector('[data-panel="layers"]').addEventListener("click", () => togglePanel("layers", "right"));
    const colorButton = root.querySelector('[data-panel="color"]');
    colorButton.addEventListener("pointerdown", (event) => {
        colorDrag = { x: event.clientX, y: event.clientY, moved: false, pointerId: event.pointerId };
        try { colorButton.setPointerCapture(event.pointerId); } catch { /* Synthetic events have no capture. */ }
    });
    colorButton.addEventListener("pointermove", (event) => {
        if (!colorDrag || colorDrag.pointerId !== event.pointerId) return;
        if (Math.hypot(event.clientX - colorDrag.x, event.clientY - colorDrag.y) > 8) colorDrag.moved = true;
    });
    colorButton.addEventListener("pointerup", (event) => {
        if (!colorDrag) return;
        const rect = viewport.getBoundingClientRect();
        const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
        if (colorDrag.moved && inside && state.doc) {
            painter.fill(state.color);
            painter.render();
            refreshChrome();
            scheduleSave();
            toastMessage("Filled the layer.");
        } else if (!colorDrag.moved) togglePanel("color", "right");
        colorDrag = null;
    });

    function wireToolDrag(button, tool) {
        let drag = null;
        button.addEventListener("pointerdown", (event) => {
            drag = { y: event.clientY, size: brushSettings[state.brushes[tool] || activeBrushId()].size, moved: false, pointerId: event.pointerId };
            try { button.setPointerCapture(event.pointerId); } catch { /* Synthetic events have no capture. */ }
            if (tool === "paint") drag.size = brushSettings[state.brushes.paint].size;
            if (tool === "smudge") drag.size = brushSettings[state.brushes.smudge].size;
            if (tool === "erase") drag.size = brushSettings[state.brushes.erase].size;
        });
        button.addEventListener("pointermove", (event) => {
            if (!drag || drag.pointerId !== event.pointerId) return;
            const delta = drag.y - event.clientY;
            if (Math.abs(delta) < 6) return;
            drag.moved = true;
            state.tool = tool;
            const id = tool === "erase" ? state.brushes.erase : tool === "smudge" ? state.brushes.smudge : state.brushes.paint;
            brushSettings[id].size = Math.max(1, Math.min(240, drag.size + delta * 0.7));
            refreshChrome();
        });
        button.addEventListener("pointerup", () => {
            if (!drag) return;
            if (!drag.moved) {
                state.tool = tool;
                if (painter.transforming) painter.commitTransform();
                state.panel = state.panel === "brushes" && state.tool === tool ? null : "brushes";
                state.panelSide = "right";
                savePrefs();
                renderPanel();
            } else savePrefs();
            drag = null;
            refreshChrome();
        });
    }

    window.addEventListener("keydown", (event) => {
        if (event.code === "Space") { spaceDown = true; event.preventDefault(); }
        const meta = event.metaKey || event.ctrlKey;
        if (meta && event.key.toLowerCase() === "z") {
            event.preventDefault();
            if (event.shiftKey) painter.redo();
            else painter.undo();
            painter.render();
            refreshChrome();
        }
        if (event.key === "[") activeSettings().size = Math.max(1, activeSettings().size - 2);
        if (event.key === "]") activeSettings().size = Math.min(240, activeSettings().size + 2);
        if (event.key === "[" || event.key === "]") refreshChrome();
    });
    window.addEventListener("keyup", (event) => { if (event.code === "Space") spaceDown = false; });
    window.addEventListener("resize", resize);
    new ResizeObserver(() => { if (!stage.hidden) resize(); }).observe(viewport);

    mountCanvasCreator(root, (partial) => {
        sheet.close();
        openFresh(partial);
    });

    document.addEventListener("keydown", (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
            event.preventDefault();
            persist().then(() => toastMessage("Canvas stored on this device.")).catch((error) => toastMessage(error.message));
        }
    });

    if (env.projectId) await openProject(env.projectId);
    else await showGallery();
    refreshChrome();
    if (!noticeDialog.open && !help.open && !sessionStorage.getItem("alysum-draw-notice")) {
        sessionStorage.setItem("alysum-draw-notice", "1");
        noticeDialog.showModal();
    }
}

function mountCanvasCreator(root, onCreate) {
    const form = root.querySelector("#draw-create");
    const presets = root.querySelector("#draw-presets");
    const papers = root.querySelector("#draw-bgs");
    const units = root.querySelector("#draw-units");
    const dpiRow = root.querySelector("#draw-dpi");
    const widthInput = root.querySelector("#draw-width-input");
    const heightInput = root.querySelector("#draw-height-input");
    const sheetlet = root.querySelector("#draw-sheetlet");
    const preview = root.querySelector("#draw-canvas-preview");
    const physical = root.querySelector("#draw-canvas-physical");
    const memory = root.querySelector("#draw-canvas-memory");
    const custom = document.createElement("input");
    custom.type = "color";
    custom.value = "#7eb6ff";
    custom.setAttribute("aria-label", "Custom paper color");
    const setup = { unit: "px", dpi: 300, background: "#ffffff", presetId: "sketch" };

    function pixels() {
        return { width: Number(form.width.value), height: Number(form.height.value) };
    }

    function setPixels(width, height) {
        form.width.value = String(pixelsFromMeasure(width, "px", setup.dpi));
        form.height.value = String(pixelsFromMeasure(height, "px", setup.dpi));
    }

    function writeMeasures() {
        const size = pixels();
        const width = measureFromPixels(size.width, setup.unit, setup.dpi);
        const height = measureFromPixels(size.height, setup.unit, setup.dpi);
        widthInput.value = setup.unit === "px" ? String(Math.round(width)) : width.toFixed(2);
        heightInput.value = setup.unit === "px" ? String(Math.round(height)) : height.toFixed(2);
    }

    function readMeasures() {
        setPixels(
            pixelsFromMeasure(widthInput.value, setup.unit, setup.dpi),
            pixelsFromMeasure(heightInput.value, setup.unit, setup.dpi),
        );
        const size = pixels();
        const match = CANVAS_PRESETS.find((preset) => preset.width === size.width && preset.height === size.height);
        setup.presetId = match ? match.id : "";
        refresh();
    }

    function refresh() {
        const size = pixels();
        const wide = window.innerWidth >= 700;
        const short = window.innerHeight < 760;
        const availW = wide
            ? Math.min(460, Math.max(160, window.innerWidth * 0.34))
            : Math.min(320, Math.max(120, window.innerWidth - 96));
        const availH = wide
            ? Math.min(short ? 300 : 520, Math.max(140, window.innerHeight - 210))
            : Math.min(190, Math.max(96, window.innerHeight * 0.26));
        const scale = Math.min(availW / size.width, availH / size.height);
        sheetlet.style.width = `${Math.max(48, Math.round(size.width * scale))}px`;
        sheetlet.style.height = `${Math.max(48, Math.round(size.height * scale))}px`;
        sheetlet.style.background = setup.background === "transparent"
            ? "repeating-conic-gradient(#d8d8dc 0% 25%, #f4f4f6 0% 50%) 50% / 18px 18px"
            : setup.background;
        const inchesW = measureFromPixels(size.width, "in", setup.dpi);
        const inchesH = measureFromPixels(size.height, "in", setup.dpi);
        preview.textContent = `${size.width} × ${size.height} px`;
        physical.textContent = `${inchesW.toFixed(2)} × ${inchesH.toFixed(2)} in · ${setup.dpi} DPI`;
        const mb = canvasMemoryMb(size.width, size.height);
        const amount = mb >= 10 ? String(Math.round(mb)) : mb.toFixed(1);
        memory.textContent = undoLimitFor(size.width, size.height) < 24
            ? `About ${amount} MB for one layer. Undo history is shorter at this size.`
            : `About ${amount} MB for one layer.`;
        for (const button of presets.querySelectorAll("button")) {
            button.classList.toggle("is-on", button.dataset.preset === setup.presetId);
            const page = button.querySelector("i");
            if (page) page.style.background = sheetlet.style.background;
        }
        for (const button of papers.querySelectorAll("button")) {
            button.classList.toggle("is-on", button.dataset.paper === setup.background);
        }
        for (const button of units.querySelectorAll("button")) button.classList.toggle("is-on", button.dataset.unit === setup.unit);
        for (const button of dpiRow.querySelectorAll("button")) button.classList.toggle("is-on", Number(button.dataset.dpi) === setup.dpi);
        writeMeasures();
    }

    function choosePreset(preset) {
        setup.presetId = preset.id;
        setup.unit = "px";
        if (preset.width === 0) {
            const screen = screenCanvasSize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
            setPixels(screen.width, screen.height);
        } else setPixels(preset.width, preset.height);
        refresh();
    }

    for (const [id, label] of [["px", "Pixels"], ["in", "Inches"], ["cm", "Centimeters"]]) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.unit = id;
        button.textContent = label;
        button.addEventListener("click", () => { setup.unit = id; refresh(); });
        units.append(button);
    }
    for (const [dpi, label] of [[72, "72 Web"], [132, "132 Screen"], [300, "300 Print"]]) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.dpi = String(dpi);
        button.textContent = label;
        button.addEventListener("click", () => {
            const size = pixels();
            const width = measureFromPixels(size.width, setup.unit, setup.dpi);
            const height = measureFromPixels(size.height, setup.unit, setup.dpi);
            setup.dpi = clampDpi(dpi);
            if (setup.unit === "px") setPixels(size.width, size.height);
            else {
                setPixels(pixelsFromMeasure(width, setup.unit, setup.dpi), pixelsFromMeasure(height, setup.unit, setup.dpi));
                setup.presetId = "";
            }
            refresh();
        });
        dpiRow.append(button);
    }
    for (const paper of PAPER_COLORS) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.paper = paper.value;
        button.setAttribute("aria-label", paper.name);
        button.title = paper.name;
        button.style.background = paper.value === "transparent"
            ? "repeating-conic-gradient(#d8d8dc 0% 25%, #f4f4f6 0% 50%) 50% / 12px 12px"
            : paper.value;
        button.addEventListener("click", () => { setup.background = paper.value; refresh(); });
        papers.append(button);
    }
    custom.addEventListener("input", () => { setup.background = custom.value; refresh(); });
    papers.append(custom);
    for (const preset of CANVAS_PRESETS) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.preset = preset.id;
        const page = document.createElement("i");
        const sample = preset.width === 0 ? { width: 3, height: 4 } : preset;
        const side = 42 / Math.max(sample.width, sample.height);
        page.style.width = `${Math.max(12, Math.round(sample.width * side))}px`;
        page.style.height = `${Math.max(12, Math.round(sample.height * side))}px`;
        const name = document.createElement("strong");
        name.textContent = preset.name;
        const meta = document.createElement("span");
        meta.textContent = preset.width === 0 ? "This device" : `${preset.width} × ${preset.height}`;
        button.append(page, name, meta);
        button.addEventListener("click", () => choosePreset(preset));
        presets.append(button);
    }
    widthInput.addEventListener("change", readMeasures);
    heightInput.addEventListener("change", readMeasures);
    root.querySelector("#draw-flip").addEventListener("click", () => {
        const size = pixels();
        setPixels(size.height, size.width);
        const next = pixels();
        const found = CANVAS_PRESETS.find((preset) => preset.width === next.width && preset.height === next.height);
        setup.presetId = found ? found.id : "";
        refresh();
    });
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        readMeasures();
        const size = pixels();
        const name = String(new FormData(form).get("title") || "").trim() || "Untitled Canvas";
        onCreate({ width: size.width, height: size.height, background: setup.background, name });
    });
    choosePreset(CANVAS_PRESETS.find((preset) => preset.id === "sketch"));
    window.addEventListener("resize", () => {
        if (root.querySelector("#draw-sheet")?.open) refresh();
    });
}

function railButton(id, icon, label) {
    const kind = ["paint", "smudge", "erase", "select", "transform"].includes(id) ? "data-tool" : "data-panel";
    return `<button type="button" class="draw-tool" ${kind}="${id}" aria-label="${label}">${ICONS[icon]}</button>`;
}

function textButton(label, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
}

function slider(label, min, max, value, onInput, step = 1) {
    const wrap = document.createElement("label");
    wrap.className = "draw-field";
    wrap.append(document.createTextNode(label));
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.addEventListener("input", () => onInput(Number(input.value)));
    wrap.append(input);
    return wrap;
}

function harmony(h) {
    return [0, 180, 30, -30, 120, 240].map((offset) => {
        const rgb = hsvToRgb(h + offset, 0.85, 1);
        return rgbToHex(rgb.r, rgb.g, rgb.b);
    });
}

function drawDisc(canvas, hsv) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, 220, 220);
    for (let angle = 0; angle < 360; angle += 2) {
        ctx.beginPath();
        ctx.strokeStyle = `hsl(${angle} 100% 50%)`;
        ctx.lineWidth = 18;
        ctx.arc(110, 110, 92, (angle - 2) * Math.PI / 180, (angle + 2) * Math.PI / 180);
        ctx.stroke();
    }
    const pure = hsvToRgb(hsv.h, 1, 1);
    const horizontal = ctx.createLinearGradient(48, 0, 172, 0);
    horizontal.addColorStop(0, "#ffffff");
    horizontal.addColorStop(1, rgbToHex(pure.r, pure.g, pure.b));
    ctx.fillStyle = horizontal;
    ctx.fillRect(48, 48, 124, 124);
    const vertical = ctx.createLinearGradient(0, 48, 0, 172);
    vertical.addColorStop(0, "rgba(0,0,0,0)");
    vertical.addColorStop(1, "#000000");
    ctx.fillStyle = vertical;
    ctx.fillRect(48, 48, 124, 124);
    const hueAngle = hsv.h * Math.PI / 180;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(110 + Math.cos(hueAngle) * 92, 110 + Math.sin(hueAngle) * 92, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgbToHex(hsvToRgb(hsv.h, hsv.s, hsv.v).r, hsvToRgb(hsv.h, hsv.s, hsv.v).g, hsvToRgb(hsv.h, hsv.s, hsv.v).b);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(48 + hsv.s * 124, 48 + (1 - hsv.v) * 124, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
}

function midpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function pointerSamples(event) {
    try {
        const extra = event.getCoalescedEvents?.();
        if (extra?.length && extra.some((item) => item.clientX || item.clientY)) return extra;
    } catch { /* Use the pointer event itself. */ }
    return [event];
}

function pressureOf(event) {
    if (event.pointerType === "mouse") return 1;
    if (!event.pressure) return event.pointerType === "pen" ? 0.2 : 0.75;
    return event.pressure;
}

function loadPrefs() {
    try { return JSON.parse(localStorage.getItem("alysum-draw-prefs") || "{}"); }
    catch { return {}; }
}

function keepMessage(root, text) {
    root.innerHTML = `<p class="draw-gate">${text}</p>`;
}

async function boot() {
    const root = document.getElementById("draw-app");
    if (!root || root.dataset.manual === "1") return;
    const session = await resolveStudioSession(supabase);
    if (!session.user?.id || session.mode !== "cloud") {
        keepMessage(root, "Sign in with an Artist account to draw.");
        if (session.mode === "none") goToLogin(`/artist-draw${location.search}`);
        return;
    }
    let profile;
    try {
        profile = await fetchArtistHubProfile(supabase, session.user.id);
    } catch (error) {
        keepMessage(root, error.message || "Could not open Draw.");
        return;
    }
    if (!userHasArtistAccess(profile.accountType)) {
        keepMessage(root, "This account does not include Artist. Change it in Settings, then come back to Draw.");
        return;
    }
    const params = new URLSearchParams(location.search);
    const userId = session.user.id;
    await mountDrawApp(root, {
        projectId: params.get("id") || "",
        characterId: params.get("character") || "",
        store: createDrawStore(),
        upload: async (file, doc) => {
            const uploaded = await uploadArtistImage(supabase, userId, file);
            await addArtwork(supabase, userId, {
                characterId: doc.characterId || null,
                storagePath: uploaded.path,
                publicUrl: uploaded.url,
                caption: doc.name,
                visibility: "private",
                offerKind: "none",
            });
            return "Saved to My art as a private image.";
        },
    });
}

void boot().catch((error) => {
    const root = document.getElementById("draw-app");
    if (root && root.dataset.manual !== "1") keepMessage(root, error.message || "Draw did not open.");
});
