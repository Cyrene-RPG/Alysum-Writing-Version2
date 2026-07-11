/**
 * Note Graph — dedicated note store (separate from Alysum Vault / Notes).
 */
import { loadVault, saveVault, defaultVault } from "./alysum-vault.js";

export const NOTE_GRAPH_STORAGE_KEY = "alysum-note-graph-v1";

export function defaultNoteGraph() {
    const state = defaultVault();
    if (state.items[0]?.type === "note") {
        state.items[0].name = "Start here";
        state.items[0].content = "Map your story web. Link ideas with [[Another note]].";
    }
    return state;
}

export function ensureNoteGraphStorage() {
    try {
        if (!localStorage.getItem(NOTE_GRAPH_STORAGE_KEY)) {
            saveVault(defaultNoteGraph(), NOTE_GRAPH_STORAGE_KEY);
        }
    } catch {
        /* ignore quota */
    }
}

export function loadNoteGraph() {
    ensureNoteGraphStorage();
    return loadVault(NOTE_GRAPH_STORAGE_KEY);
}

export function saveNoteGraph(state) {
    saveVault(state, NOTE_GRAPH_STORAGE_KEY);
}
