import "./beta-read-picker.css";
import { listBetaReadChapters, prepareBetaReadSnapshot } from "./beta-read-snapshot.js";

/** Isolated Beta Read picker; does not alter Image or Reading Link flows. */
export function mountBetaReadPicker({ host, getBook, getAuthor, api }) {
    const panel = document.createElement("section");
    panel.hidden = true;
    panel.className = "quote-beta-panel";
    const heading = document.createElement("h3");
    heading.textContent = "Beta Read";
    const hint = document.createElement("p");
    hint.className = "beta-intro";
    hint.textContent = "Select the chapters you want guests to read and comment on. Your original manuscript stays private and unchanged.";
    const choices = document.createElement("div");
    choices.className = "beta-chapters";
    choices.setAttribute("role", "group");
    choices.setAttribute("aria-label", "Chapters to share");
    const count = document.createElement("span");
    count.className = "beta-count";
    const create = document.createElement("button");
    create.type = "button";
    create.className = "quote-button quote-primary";
    create.textContent = "Create beta read";
    create.classList.add("beta-create");
    const result = document.createElement("div");
    result.hidden = true;
    result.className = "beta-result";
    const url = document.createElement("input");
    url.readOnly = true;
    url.setAttribute("aria-label", "Beta Read link");
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "quote-button";
    copy.textContent = "Copy link";
    const linkRow = document.createElement("div");
    linkRow.className = "beta-link-row";
    linkRow.append(url, copy);
    const ready = document.createElement("strong");
    ready.textContent = "Your reading link is ready";
    const note = document.createElement("p");
    note.className = "beta-note";
    note.textContent = "Anyone with this link can read the selected chapters after accepting your copyright notice.";
    result.append(ready, linkRow, note);
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    status.className = "beta-status";
    panel.append(heading, hint, count, choices, create, result, status);
    host.append(panel);
    function open() {
        panel.hidden = false;
        result.hidden = true;
        status.textContent = "";
        choices.replaceChildren();
        for (const chapter of listBetaReadChapters(getBook())) {
            const label = document.createElement("label");
            label.className = "beta-chapter";
            const check = document.createElement("input");
            check.type = "checkbox";
            check.value = chapter.id;
            check.addEventListener("change", update);
            const name = document.createElement("span");
            name.textContent = chapter.title;
            label.append(check, name);
            choices.append(label);
        }
        update();
    }
    function update() {
        const selected = choices.querySelectorAll("input:checked").length;
        count.textContent = selected ? selected + " chapters selected" : "Choose at least one chapter";
        create.disabled = !api || !selected;
        if (!api) status.textContent = "Beta Read storage is not configured.";
    }
    create.addEventListener("click", async () => {
        create.disabled = true;
        status.textContent = "Creating beta read…";
        try {
            if (!api) throw new Error("Beta Read storage is not configured.");
            const ids = [...choices.querySelectorAll("input:checked")].map(input => input.value);
            const snapshot = prepareBetaReadSnapshot(getBook(), ids, getAuthor());
            const saved = await api.create(snapshot);
            if (!saved?.url) throw new Error("No reading link was returned.");
            url.value = saved.url;
            result.hidden = false;
            status.textContent = "Beta Read created.";
        } catch (error) {
            status.textContent = error?.message || "Could not create beta read.";
        } finally { update(); }
    });
    copy.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(url.value); status.textContent = "Link copied."; }
        catch { url.focus(); url.select(); status.textContent = "Select and copy the link."; }
    });
    return { open, close: () => { panel.hidden = true; } };
}
