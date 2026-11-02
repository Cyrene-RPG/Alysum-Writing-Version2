import { listBetaReadChapters, prepareBetaReadSnapshot } from "./beta-read-snapshot.js";

/** Isolated Beta Read picker; does not alter Image or Reading Link flows. */
export function mountBetaReadPicker({ host, getBook, getAuthor, api }) {
    // Styles are injected at runtime: no CSS module import or editor bootstrap changes.
    if (!document.getElementById("alysum-beta-picker-styles")) {
        const style = document.createElement("style");
        style.id = "alysum-beta-picker-styles";
        style.textContent = `
.quote-beta-panel{display:flex;flex-direction:column;gap:16px;padding:20px 0 12px;min-width:0}
.quote-beta-panel[hidden],.quote-beta-panel .beta-result[hidden]{display:none!important}
.quote-beta-panel h3{font:600 clamp(1.5rem,5vw,1.9rem)/1.2 Georgia,serif;margin:0}
.quote-beta-panel .beta-intro{margin:0;color:#c8c1d1;line-height:1.6;font-size:.95rem}
.quote-beta-panel .beta-chapter-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.quote-beta-panel .beta-chapter-head strong{font-size:.94rem}
.quote-beta-panel .beta-count{color:#cbb0f0;font-size:.84rem}
.quote-beta-panel .beta-chapters{display:grid;gap:5px;padding:8px;border:1px solid #51475e;border-radius:14px;background:rgba(255,255,255,.035);max-height:300px;overflow-y:auto;min-width:0}
.quote-beta-panel .beta-chapter{display:flex!important;align-items:center;gap:12px;padding:12px;border:1px solid transparent;border-radius:10px;min-width:0;cursor:pointer;color:#f4eff7}
.quote-beta-panel .beta-chapter:has(input:checked){background:rgba(176,135,236,.17);border-color:rgba(190,158,242,.48)}
.quote-beta-panel .beta-chapter input{flex:0 0 20px;width:20px;height:20px;margin:0;accent-color:#c3a0f3}
.quote-beta-panel .beta-chapter span{flex:1;min-width:0;overflow-wrap:anywhere;font-size:.94rem;line-height:1.4}
.quote-beta-panel .beta-create{align-self:flex-start;min-height:46px;border-radius:12px;padding:12px 19px}
.quote-beta-panel .beta-result{display:grid;gap:12px;padding:15px;border:1px solid rgba(157,206,168,.5);background:rgba(105,165,118,.09);border-radius:14px;min-width:0}
.quote-beta-panel .beta-result strong{color:#bde4c4}
.quote-beta-panel .beta-link-row{display:flex;gap:8px;min-width:0}
.quote-beta-panel .beta-link-row input{flex:1;min-width:0;width:0;padding:10px;border:1px solid #6b6275;border-radius:9px;background:#17151d;color:#f5f0fa;font:inherit;font-size:.85rem}
.quote-beta-panel .beta-link-row button{flex-shrink:0;border-radius:9px}
.quote-beta-panel .beta-note{margin:0;color:#bdb5c7;font-size:.82rem;line-height:1.5}
.quote-beta-panel .beta-status{margin:0;color:#d6c8e7;font-size:.87rem}
@media(max-width:520px){.quote-beta-panel .beta-link-row{flex-direction:column}.quote-beta-panel .beta-link-row input{width:100%;box-sizing:border-box;min-height:44px}.quote-beta-panel .beta-link-row button{width:100%}}
`;
        document.head.append(style);
    }
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
    const chapterHead = document.createElement("div");
    chapterHead.className = "beta-chapter-head";
    const chapterTitle = document.createElement("strong");
    chapterTitle.textContent = "Choose chapters";
    const count = document.createElement("span");
    count.className = "beta-count";
    chapterHead.append(chapterTitle, count);
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
    const success = document.createElement("strong");
    success.textContent = "Your private reading link is ready";
    const note = document.createElement("p");
    note.className = "beta-note";
    note.textContent = "Anyone with the link can read your selected chapters after accepting the copyright notice.";
    result.append(success, linkRow, note);
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    status.className = "beta-status";
    panel.append(heading, hint, chapterHead, choices, create, result, status);
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
        count.textContent = selected ? selected + " selected" : "None selected";
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
