/**
 * Obsidian-style horizontal tab strip.
 * @param {HTMLElement} bar
 * @param {import("./notes-vault.js").VaultState} state
 * @param {{ select: (id: string) => void, close: (id: string) => void }} api
 */
export function renderTabStrip(bar, state, api) {
  bar.innerHTML = "";
  const ids = state.openTabIds && state.openTabIds.length ? state.openTabIds : state.activeNoteId ? [state.activeNoteId] : [];
  for (const id of ids) {
    const n = state.notes.find(x => x.id === id);
    if (!n) continue;
    const tab = document.createElement("div");
    tab.className = "ob-tab" + (id === state.activeNoteId ? " is-active" : "");
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", id === state.activeNoteId ? "true" : "false");
    const lab = document.createElement("span");
    lab.className = "ob-tab-label";
    lab.textContent = (n.title || "Untitled").replace(/\s+/g, " ").trim() || "Untitled";
    tab.appendChild(lab);
    if (ids.length > 1) {
      const x = document.createElement("button");
      x.type = "button";
      x.className = "ob-tab-close";
      x.setAttribute("aria-label", "Close tab");
      x.textContent = "×";
      x.addEventListener("click", ev => {
        ev.stopPropagation();
        api.close(id);
      });
      tab.appendChild(x);
    }
    tab.addEventListener("click", () => api.select(id));
    bar.appendChild(tab);
  }
}
