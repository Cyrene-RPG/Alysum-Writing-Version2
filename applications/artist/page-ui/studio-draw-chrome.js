/** Post-pointer chrome bindings for Draw (rails, shortcuts, creator). */
export function bindDrawChrome(ctx) {
    const {
        root, painter, state, brushSettings, sheet, stage, viewport,
        savePrefs, renderPanel, toastMessage, activeSettings, adopt, persist,
        openFresh, showGallery, scheduleSave, resize, mountCanvasCreator,
        refreshChrome, s,
    } = ctx;

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
root.querySelector('[data-tool="shape"]').addEventListener("click", () => {
    state.tool = "shape";
    state.panel = "shape";
    state.panelSide = "left";
    if (painter.transforming) painter.commitTransform();
    renderPanel();
});
root.querySelector('[data-tool="fill"]').addEventListener("click", () => {
    state.tool = "fill";
    state.panel = "fill";
    state.panelSide = "left";
    if (painter.transforming) painter.commitTransform();
    renderPanel();
});
root.querySelector('[data-tool="pick"]').addEventListener("click", () => {
    state.tool = "pick";
    state.panel = null;
    if (painter.transforming) painter.commitTransform();
    renderPanel();
    toastMessage("Tap the canvas to pick a color.");
});
root.querySelector('[data-panel="actions"]').addEventListener("click", () => { state.tool = state.tool; togglePanel("actions", "left"); });
root.querySelector('[data-panel="adjust"]').addEventListener("click", () => togglePanel("adjust", "left"));
root.querySelector('[data-panel="layers"]').addEventListener("click", () => togglePanel("layers", "right"));
const colorButton = root.querySelector('[data-panel="color"]');
colorButton.addEventListener("pointerdown", (event) => {
    s.colorDrag = { x: event.clientX, y: event.clientY, moved: false, pointerId: event.pointerId };
    try { colorButton.setPointerCapture(event.pointerId); } catch { /* Synthetic events have no capture. */ }
});
colorButton.addEventListener("pointermove", (event) => {
    if (!s.colorDrag || s.colorDrag.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - s.colorDrag.x, event.clientY - s.colorDrag.y) > 8) s.colorDrag.moved = true;
});
colorButton.addEventListener("pointerup", (event) => {
    if (!s.colorDrag) return;
    const rect = viewport.getBoundingClientRect();
    const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (s.colorDrag.moved && inside && state.doc) {
        painter.fill(state.color);
        painter.render();
        refreshChrome();
        scheduleSave();
        toastMessage("Filled the layer.");
    } else if (!s.colorDrag.moved) togglePanel("color", "right");
    s.colorDrag = null;
});
function wireToolDrag(button, tool) {
    let drag = null;
    button.addEventListener("pointerdown", (event) => {
        const id = tool === "erase" ? state.brushes.erase : tool === "smudge" ? state.brushes.smudge : state.brushes.paint;
        drag = { y: event.clientY, size: brushSettings[id].size, moved: false, pointerId: event.pointerId, id };
        try { button.setPointerCapture(event.pointerId); } catch { /* Synthetic events have no capture. */ }
    });
    button.addEventListener("pointermove", (event) => {
        if (!drag || drag.pointerId !== event.pointerId) return;
        const delta = drag.y - event.clientY;
        if (Math.abs(delta) < 14) return;
        drag.moved = true;
        state.tool = tool;
        brushSettings[drag.id].size = Math.max(1, Math.min(240, Math.round(drag.size + delta * 0.55)));
        refreshChrome();
        toastMessage(`${Math.round(brushSettings[drag.id].size)} px`);
    });
    button.addEventListener("pointerup", () => {
        if (!drag) return;
        if (!drag.moved) {
            const sameTool = state.tool === tool;
            const brushesOpen = state.panel === "brushes";
            state.tool = tool;
            if (painter.transforming) painter.commitTransform();
            state.panel = brushesOpen && sameTool ? null : "brushes";
            state.panelSide = "right";
            savePrefs();
            renderPanel();
        } else savePrefs();
        drag = null;
        refreshChrome();
    });
}
window.addEventListener("keydown", (event) => {
    if (event.code === "Space") { s.spaceDown = true; event.preventDefault(); }
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
window.addEventListener("keyup", (event) => { if (event.code === "Space") s.spaceDown = false; });
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

}
