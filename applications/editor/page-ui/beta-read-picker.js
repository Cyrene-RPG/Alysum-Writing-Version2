import { listBetaReadChapters, prepareBetaReadSnapshot } from "./beta-read-snapshot.js";

/** Isolated Beta Read picker; does not alter Image or Reading Link flows. */
export function mountBetaReadPicker({ host, getBook, getAuthor, api }) {
    const panel = document.createElement("section");
    panel.hidden = true;
    panel.className = "quote-beta-panel";
    const heading = document.createElement("h3");
    heading.textContent = "Beta Read";
    const hint = document.createElement("p");
    hint.textContent = "Select the chapters you want guests to read and comment on. Your original manuscript stays private and unchanged.";
    const choices = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = "Chapters";
    choices.append(legend);
    const create = document.createElement("button");
    create.type = "button";
    create.className = "quote-button quote-primary";
    create.textContent = "Create beta read";
    const result = document.createElement("div");
    result.hidden = true;
    const url = document.createElement("input");
    url.readOnly = true;
    url.setAttribute("aria-label", "Beta Read link");
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "quote-button";
    copy.textContent = "Copy link";
    result.append(url, copy);
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    status.className = "quote-hint";
    panel.append(heading, hint, choices, create, result, status);
    host.append(panel);
    function open() {
        panel.hidden = false;
        result.hidden = true;
        status.textContent = "";
        choices.replaceChildren(legend);
        for (const chapter of listBetaReadChapters(getBook())) {
            const label = document.createElement("label");
            label.className = "quote-check";
            const check = document.createElement("input");
            check.type = "checkbox";
            check.value = chapter.id;
            check.addEventListener("change", update);
            label.append(check, document.createTextNode(" " + chapter.title));
            choices.append(label);
        }
        update();
    }
    function update() {
        create.disabled = !api || !choices.querySelector("input:checked");
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
