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
    addLayer,
    brushById,
    brushCategories,
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
import { createViewRectCache, midpoint, pointerSamples, pressureOf } from "/applications/artist/page-ui/studio-pointer.js";
import { mountCanvasCreator } from "/applications/artist/page-ui/studio-canvas-create.js";
import { drawDisc, harmony, railButton, slider, textButton, ICONS } from "/applications/artist/page-ui/studio-draw-widgets.js";
import { drawMarkup } from "/applications/artist/page-ui/studio-draw-markup.js";
import { attachDrawPanels } from "/applications/artist/page-ui/studio-draw-panels.js";
import { bindDrawInteractions } from "/applications/artist/page-ui/studio-draw-interactions.js";
import { attachDrawGallery } from "/applications/artist/page-ui/studio-draw-gallery.js";

function loadPrefs() {
    try { return JSON.parse(localStorage.getItem("alysum-draw-prefs") || "{}"); }
    catch { return {}; }
}

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
        brushes: {
            paint: prefs.paint || "studio-pen",
            smudge: prefs.smudge || "soft-airbrush",
            erase: prefs.erase === "hard-airbrush" || !prefs.erase ? "hard-eraser" : prefs.erase,
        },
        color: prefs.color || "#1c1c1e",
        hsv: rgbToHsv(...Object.values(hexToRgb(prefs.color || "#1c1c1e"))),
        colors: prefs.colors || ["#1c1c1e", "#ffffff", "#ff3b30", "#ff9f0a", "#ffd60a", "#32d74b", "#0a84ff", "#bf5af2"],
        panel: null,
        panelSide: "right",
        selectMode: "freehand",
        selectCombine: "replace",
        shapeKind: prefs.shapeKind || "line",
        fillTolerance: Number.isFinite(prefs.fillTolerance) ? prefs.fillTolerance : 28,
        quickShape: prefs.quickShape !== false,
        showCursor: prefs.showCursor !== false,
        frames: [],
        dirty: false,
        saveTimer: 0,
    };

    root.innerHTML = drawMarkup(ICONS);

    const gallery = root.querySelector("#draw-gallery");
    const stage = root.querySelector("#draw-stage");
    const viewport = root.querySelector("#draw-viewport");
    const canvas = root.querySelector("#draw-canvas");
    const painter = createPainter(canvas);
    const viewRect = createViewRectCache(canvas);
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
    let paintQueue = [];
    let paintRaf = 0;
    let viewRaf = 0;
    let cursorRaf = 0;
    let pendingCursor = null;
    let paintFramePending = false;
    const s = {
        pointers,
        get gesture() { return gesture; }, set gesture(v) { gesture = v; },
        get holdTimer() { return holdTimer; }, set holdTimer(v) { holdTimer = v; },
        get eyedrop() { return eyedrop; }, set eyedrop(v) { eyedrop = v; },
        get quickLocked() { return quickLocked; }, set quickLocked(v) { quickLocked = v; },
        get reach() { return reach; }, set reach(v) { reach = v; },
        get origin() { return origin; }, set origin(v) { origin = v; },
        get spaceDown() { return spaceDown; }, set spaceDown(v) { spaceDown = v; },
        get panDrag() { return panDrag; }, set panDrag(v) { panDrag = v; },
        get selectDraft() { return selectDraft; }, set selectDraft(v) { selectDraft = v; },
        get transformDrag() { return transformDrag; }, set transformDrag(v) { transformDrag = v; },
        get colorDrag() { return colorDrag; }, set colorDrag(v) { colorDrag = v; },
        get paintQueue() { return paintQueue; }, set paintQueue(v) { paintQueue = v; },
        get paintRaf() { return paintRaf; }, set paintRaf(v) { paintRaf = v; },
        get viewRaf() { return viewRaf; }, set viewRaf(v) { viewRaf = v; },
        get cursorRaf() { return cursorRaf; }, set cursorRaf(v) { cursorRaf = v; },
        get pendingCursor() { return pendingCursor; }, set pendingCursor(v) { pendingCursor = v; },
        get paintFramePending() { return paintFramePending; }, set paintFramePending(v) { paintFramePending = v; },
    };

    function scheduleViewRender() {
        if (viewRaf || paintFramePending) return;
        viewRaf = requestAnimationFrame(() => {
            viewRaf = 0;
            // Flat composite is unchanged during pan/zoom/rotate — view blit only.
            painter.renderView();
        });
    }

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
            shapeKind: state.shapeKind, fillTolerance: state.fillTolerance,
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
        root.querySelector("#draw-sliders").hidden = !["paint", "smudge", "erase", "shape"].includes(state.tool);
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
        return viewRect.localPoint(event, painter.cssWidth, painter.cssHeight);
    }

    function resize() {
        const rect = viewport.getBoundingClientRect();
        painter.resizeView(rect.width, rect.height);
        viewRect.invalidate();
        viewRect.sync();
        if (state.doc && painter.view.zoom === 1 && painter.view.panX === 40) painter.fit();
    }

    const galleryApi = attachDrawGallery({
        store, state, painter, gallery, stage, panel, root, env,
        toastMessage, refreshChrome, resize, noticeDialog, help,
    });
    const showGallery = galleryApi.showGallery;
    const openProject = galleryApi.openProject;
    const openFresh = galleryApi.openFresh;
    const showGestureHelp = galleryApi.showGestureHelp;
    const persist = galleryApi.persist;
    const scheduleSave = galleryApi.scheduleSave;



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
        else if (state.panel === "shape") panel.append(shapePanel());
        else if (state.panel === "fill") panel.append(fillPanel());
        refreshChrome();
    }

    function togglePanel(name, side) {
        state.panel = state.panel === name ? null : name;
        state.panelSide = side;
        renderPanel();
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

    const panels = attachDrawPanels({
        state,
        painter,
        brushSettings,
        BRUSHES,
        brushCategories,
        brushById,
        textButton,
        slider,
        adopt,
        reorder,
        BLEND_MODES,
        get renderPanel() { return renderPanel; },
        savePrefs,
        toastMessage,
        scheduleSave,
        refreshChrome,
        setColor,
        harmony,
        drawDisc,
        hexToRgb,
        hsvToRgb,
        rgbToHex,
        addLayer,
        duplicateLayer,
        deleteLayer,
        updateLayer,
        activeBrushId,
        activeSettings,
    });
    const brushPanel = panels.brushPanel;
    const layerPanel = panels.layerPanel;
    const colorPanel = panels.colorPanel;
    const actionPanel = panels.actionPanel;
    const setSymmetry = panels.setSymmetry;
    const adjustPanel = panels.adjustPanel;
    const selectPanel = panels.selectPanel;
    const transformPanel = panels.transformPanel;
    const shapePanel = panels.shapePanel;
    const fillPanel = panels.fillPanel;


















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



    bindDrawInteractions({
        root, viewport, canvas, painter, viewRect, state, brushSettings, sheet, stage,
        noticeDialog, help, env, midpoint, pointerSamples, pressureOf,
        scheduleViewRender, localPoint,
        setColor, rememberColor, refreshChrome, renderPanel, togglePanel, savePrefs,
        toastMessage, liveBrush, activeSettings, adopt, persist, openFresh, showGallery,
        scheduleSave, resize, mountCanvasCreator, cursor, loupe, s,
    });

    if (env.projectId) await openProject(env.projectId);
    else await showGallery();
    refreshChrome();
    if (!noticeDialog.open && !help.open && !sessionStorage.getItem("alysum-draw-notice")) {
        sessionStorage.setItem("alysum-draw-notice", "1");
        noticeDialog.showModal();
    }
}
