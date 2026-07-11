/**
 * Note Graph — standalone app with its own notes, editor, and link graph.
 */
import { bindVaultUI } from "./alysum-vault-ui.js?v=18";
import { requireStudioSession } from "./studio-session.js?v=1";
import { ensureNoteGraphStorage, NOTE_GRAPH_STORAGE_KEY } from "./note-graph-store.js?v=1";
import { buildVaultGraph, mountVaultGraph } from "./vault-graph.js?v=1";

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {object} elements
 * @param {{ nextPath: string, setStatus?: (msg: string) => void }} opts
 */
export async function createNoteGraphApp(supabase, elements, opts) {
    const session = await requireStudioSession(supabase, opts.nextPath);
    if (!session) return null;

    const setStatus = opts.setStatus || (() => {});
    ensureNoteGraphStorage();

    let graphHandle = null;
    let notesHandle = null;

    function noteIdFromHash() {
        const raw = location.hash.replace(/^#/, "");
        if (!raw) return null;
        const params = new URLSearchParams(raw.includes("=") ? raw : `note=${raw}`);
        const id = params.get("note");
        return id ? decodeURIComponent(id) : null;
    }

    function refreshGraph() {
        if (!notesHandle) return;
        const state = notesHandle.getState();
        const graph = buildVaultGraph(state);
        const filter = elements.graphFilter?.value || "";
        const hasNotes = graph.nodes.length > 0;

        elements.empty?.classList.toggle("is-hidden", hasNotes);

        if (graphHandle) {
            graphHandle.refresh(graph, filter, state.lastActiveId);
        } else if (elements.graphHost) {
            graphHandle = mountVaultGraph(elements.graphHost, graph, {
                filter,
                activeId: state.lastActiveId,
                onNodeClick: id => {
                    notesHandle?.selectItem(id);
                    setStatus("Editing graph note");
                }
            });
        }

        if (elements.statNotes) elements.statNotes.textContent = String(graph.nodes.length);
        if (elements.statLinks) elements.statLinks.textContent = String(graph.edges.length);
    }

    notesHandle = bindVaultUI(
        {
            tree: elements.tree,
            find: elements.find,
            title: elements.title,
            body: elements.body,
            newNote: elements.newNote,
            newFolder: elements.newFolder,
            deleteItem: elements.deleteItem
        },
        {
            storageKey: NOTE_GRAPH_STORAGE_KEY,
            compact: true,
            setStatus,
            onStateChange: refreshGraph,
            supabase: session.mode === "local" ? undefined : supabase,
            supabaseUserId: session.mode === "local" ? undefined : session.user.id,
            supabaseTable: "note_graph"
        }
    );

    elements.graphFilter?.addEventListener("input", () => refreshGraph());

    const hashNote = noteIdFromHash();
    if (hashNote) {
        notesHandle.selectItem(hashNote);
    }

    refreshGraph();
    setStatus("Note Graph ready");

    return {
        destroy() {
            graphHandle?.destroy();
            notesHandle?.destroy();
        },
        refresh: refreshGraph
    };
}
