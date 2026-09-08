import { deleteRoadmapFiling } from "@alysum/roadmap/store.js?v=9";
import { isRoadmapStaff } from "@alysum/roadmap/quotas.js";
import { supabase } from "@alysum/authentication/client.js";
import { state } from "./state.js";
import { playUiSound } from "./ui-sounds.js?v=13";

function dropFromList(kind, stub) {
    const key = kind === "bug" ? "bugs" : "suggestions";
    state.catalog[key] = (state.catalog[key] || []).filter((row) => Number(row.stub) !== stub);
}

export function bindFilingDelete(meta, row) {
    if (!isRoadmapStaff(state.user?.username)) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "filing-delete";
    button.textContent = "delete";
    button.addEventListener("click", async (event) => {
        event.stopPropagation();
        if (button.dataset.sure !== "1") {
            button.dataset.sure = "1";
            button.textContent = "confirm_delete";
            return;
        }
        if (button.dataset.busy === "1") return;
        button.dataset.busy = "1";
        try {
            await deleteRoadmapFiling(supabase, row.kind, row.stub);
            dropFromList(row.kind, Number(row.stub));
            playUiSound("commentsFail");
            window.dispatchEvent(new Event("roadmap:refresh-lists"));
        } catch (err) {
            button.dataset.busy = "";
            button.dataset.sure = "";
            button.textContent = "delete";
            playUiSound("error");
            console.error(err);
        }
    });
    meta.appendChild(button);
}
