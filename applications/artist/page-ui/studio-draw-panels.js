/** Draw side panels — extracted for file length. */
export function attachDrawPanels(api) {
    const {
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
        renderPanel,
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
    } = api;

function brushPanel() {
    const wrap = document.createElement("div");
    wrap.className = "draw-brush-library";
    const cats = document.createElement("div");
    cats.className = "draw-cats";
    const list = document.createElement("div");
    list.className = "draw-brush-list";
    let category = state.tool === "erase"
        ? "Erasing"
        : brushById(activeBrushId()).category;
    const paintList = () => {
        list.replaceChildren();
        for (const brush of BRUSHES.filter((item) => item.category === category)) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = `draw-brush-item${brush.id === activeBrushId() ? " is-on" : ""}`;
            const swatch = document.createElement("img");
            swatch.alt = "";
            swatch.width = 40;
            swatch.height = 40;
            swatch.src = painter.brushSwatch(brush, state.tool === "erase" ? "#d1d1d6" : state.color);
            const label = document.createElement("span");
            label.textContent = brush.name;
            button.append(swatch, label);
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

function shapePanel() {
    const wrap = document.createElement("div");
    wrap.className = "draw-actions";
    for (const [id, label] of [["line", "Line"], ["rect", "Rectangle"], ["ellipse", "Ellipse"]]) {
        const button = textButton(label, () => {
            state.shapeKind = id;
            state.tool = "shape";
            savePrefs();
            renderPanel();
        });
        if (state.shapeKind === id) button.classList.add("is-on");
        wrap.append(button);
    }
    const note = document.createElement("p");
    note.className = "draw-note";
    note.textContent = "Drag on the canvas to place the shape with the current brush and color.";
    wrap.append(note);
    return wrap;
}

function fillPanel() {
    const wrap = document.createElement("div");
    wrap.className = "draw-actions";
    wrap.append(
        slider("Tolerance", 0, 120, state.fillTolerance, (value) => {
            state.fillTolerance = value;
            savePrefs();
        }),
        textButton("Fill whole layer", () => {
            painter.fill(state.color);
            painter.render();
            rememberColor();
            refreshChrome();
            scheduleSave();
            toastMessage("Filled the layer.");
        }),
    );
    const note = document.createElement("p");
    note.className = "draw-note";
    note.textContent = "Tap the canvas to flood-fill a region. Higher tolerance spills farther into nearby colors.";
    wrap.append(note);
    return wrap;
}

    return { brushPanel, layerPanel, colorPanel, actionPanel, setSymmetry, adjustPanel, selectPanel, transformPanel, shapePanel, fillPanel };
}
