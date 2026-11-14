import { createStudioDocument } from "@alysum/artist/studio.js";

/** Local project gallery + IndexedDB persist helpers for Draw. */
export function attachDrawGallery(api) {
    const {
        store,
        state,
        painter,
        gallery,
        stage,
        panel,
        root,
        env,
        toastMessage,
        refreshChrome,
        resize,
        noticeDialog,
        help,
    } = api;

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
    requestAnimationFrame(() => { resize(); painter.fit(); refreshChrome(); showGestureHelp(); });
}

function openFresh(partial) {
    state.doc = createStudioDocument({ ...partial, characterId: env.characterId || "" });
    painter.setDocument(state.doc);
    gallery.hidden = true;
    stage.hidden = false;
    state.dirty = true;
    state.frames = [];
    history.replaceState(null, "", `/artist-draw?id=${encodeURIComponent(state.doc.id)}`);
    requestAnimationFrame(() => { resize(); painter.fit(); refreshChrome(); scheduleSave(); showGestureHelp(); });
}

function showGestureHelp() {
    if (noticeDialog.open) noticeDialog.close();
    if (!help.open) help.showModal();
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

    return { showGallery, openProject, openFresh, showGestureHelp, persist, scheduleSave };
}
