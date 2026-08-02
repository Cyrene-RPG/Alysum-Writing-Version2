/**
 * Shared Magic System worksheet UI (soft / hard).
 */

import { getJsonBlob, setJsonBlob, removeJsonBlob, getEncyclopediaBlobStorageMode } from "./encyclopedia-blob-store.js";

export function magicStorageKey(type, encyclopediaId) {
    const base = "alysum-magic-" + type + "-v1";
    return encyclopediaId ? base + "-" + encyclopediaId : base;
}

/**
 * @param {HTMLElement} container
 * @param {{
 *   sections: { id: string, title: string, hint: string, questions: [string, string, string, string, boolean?][] }[],
 *   intro: string,
 *   storageKey: string,
 *   compileHeading: string,
 *   clearLabel: string,
 * }} config
 */
export function mountMagicSystemBuilder(container, config) {
    const { sections, intro, storageKey, compileHeading, clearLabel } = config;

    const shell = document.createElement("div");
    shell.className = "ms-shell";

    const aside = document.createElement("aside");
    aside.className = "ms-panel";
    aside.innerHTML = [
        '<div class="ms-panel-inner">',
        '  <p class="ms-panel-title">Magic system file</p>',
        '  <div class="ms-field"><label>System name</label>',
        '    <input class="ms-input" data-ms-top="systemName" placeholder="e.g. The Veil Cantrips, Ashbinding" /></div>',
        '  <div class="ms-field"><label>Short tagline</label>',
        '    <input class="ms-input" data-ms-top="systemTagline" placeholder="One-line summary for your bible" /></div>',
        '  <nav class="ms-nav" data-ms-nav></nav>',
        '  <div class="ms-progress"><span data-ms-progress-bar></span></div>',
        '  <p class="ms-progress-text" data-ms-progress-text></p>',
        '  <p class="ms-status" data-ms-status>Autosaved locally</p>',
        '  <div class="ms-actions">',
        '    <button type="button" class="ms-btn ms-btn-primary" data-ms-copy>Copy bible</button>',
        '    <button type="button" class="ms-btn" data-ms-download>Download .md</button>',
        '    <button type="button" class="ms-btn ms-danger" data-ms-clear>Clear</button>',
        "  </div>",
        "</div>"
    ].join("\n");

    const main = document.createElement("section");
    main.className = "ms-main";
    const questionPanel = document.createElement("div");
    questionPanel.setAttribute("data-ms-questions", "");
    main.appendChild(questionPanel);

    shell.append(aside, main);

    const output = document.createElement("section");
    output.className = "ms-output";
    output.innerHTML =
        "<h2>Compiled magic bible</h2>" +
        "<p>Only answered fields appear here. Paste into your encyclopedia or manuscript notes.</p>" +
        "<pre data-ms-output></pre>";

    container.replaceChildren(shell, output);

    const sectionNav = container.querySelector("[data-ms-nav]");
    const compiledOutput = container.querySelector("[data-ms-output]");
    const progressBar = container.querySelector("[data-ms-progress-bar]");
    const progressText = container.querySelector("[data-ms-progress-text]");
    const saveStatus = container.querySelector("[data-ms-status]");

    function defaultState() {
        return {
            answers: {},
            activeSectionId: sections[0]?.id || "",
            updatedAt: 0
        };
    }

    function loadState() {
        try {
            const raw = getJsonBlob(storageKey);
            return raw && typeof raw === "object" ? { ...defaultState(), ...raw } : defaultState();
        } catch {
            return defaultState();
        }
    }

    let state = loadState();
    let activeSectionId = state.activeSectionId || sections[0]?.id || "";

    function saveState() {
        state.activeSectionId = activeSectionId;
        state.updatedAt = Date.now();
        void setJsonBlob(storageKey, state).catch(console.error);
        const cloud = getEncyclopediaBlobStorageMode() === "cloud";
        saveStatus.textContent = cloud ? "Saved to your account" : "Autosaved locally";
        saveStatus.className = "ms-status ok";
        refreshOutput();
    }

    function valueFor(key) {
        return state.answers[key] || "";
    }

    function setValue(key, value) {
        state.answers[key] = value;
        saveStatus.textContent = "Saving…";
        saveStatus.className = "ms-status";
        clearTimeout(setValue.timer);
        setValue.timer = setTimeout(saveState, 200);
    }

    function escapeHtml(s) {
        return String(s || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function renderNav() {
        sectionNav.replaceChildren();
        sections.forEach((section, index) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "ms-btn" + (section.id === activeSectionId ? " is-active" : "");
            btn.dataset.section = section.id;
            btn.textContent = index + 1 + ". " + section.title;
            btn.addEventListener("click", () => {
                activeSectionId = section.id;
                state.activeSectionId = activeSectionId;
                void setJsonBlob(storageKey, state).catch(console.error);
                renderAll();
            });
            sectionNav.appendChild(btn);
        });
    }

    function renderQuestions() {
        const section = sections.find((s) => s.id === activeSectionId) || sections[0];
        questionPanel.replaceChildren();

        const head = document.createElement("div");
        head.className = "ms-section-head";
        head.innerHTML =
            "<h2></h2><p class=\"ms-section-intro\"></p><p></p>";
        head.querySelector("h2").textContent = section.title;
        head.querySelector(".ms-section-intro").textContent = intro;
        head.querySelector("p:last-child").textContent = section.hint;
        questionPanel.appendChild(head);

        const grid = document.createElement("div");
        grid.className = "ms-question-grid";

        for (const [key, title, hint, type, wide] of section.questions) {
            const block = document.createElement("div");
            block.className = "ms-question" + (wide ? " wide" : "");
            const h3 = document.createElement("h3");
            h3.textContent = title;
            const p = document.createElement("p");
            p.textContent = hint;
            let control;
            if (type === "input") {
                control = document.createElement("input");
                control.className = "ms-input";
                control.placeholder = "Answer here...";
            } else {
                control = document.createElement("textarea");
                control.className = "ms-ta";
                control.placeholder = "Answer in as much detail as you want...";
            }
            control.dataset.key = key;
            control.value = valueFor(key);
            control.addEventListener("input", () => setValue(key, control.value));
            block.append(h3, p, control);
            grid.appendChild(block);
        }

        questionPanel.appendChild(grid);
    }

    function compileBible() {
        const name = valueFor("systemName") || "Unnamed magic system";
        const lines = [];
        lines.push("# " + name);
        if (valueFor("systemTagline")) lines.push("_" + valueFor("systemTagline") + "_");
        lines.push("");
        lines.push("## " + compileHeading);
        lines.push("");

        for (const section of sections) {
            const answered = section.questions
                .filter(([key]) => valueFor(key).trim())
                .map(([key, title]) => "### " + title + "\n" + valueFor(key).trim());
            if (!answered.length) continue;
            lines.push("## " + section.title);
            lines.push(answered.join("\n\n"));
            lines.push("");
        }

        return lines.join("\n").trim();
    }

    function refreshOutput() {
        compiledOutput.textContent =
            compileBible() || "Start answering questions to build your magic system bible.";
        refreshProgress();
    }

    function refreshProgress() {
        const allKeys = sections
            .flatMap((section) => section.questions.map(([key]) => key))
            .concat(["systemName", "systemTagline"]);
        const filled = allKeys.filter((key) => valueFor(key).trim()).length;
        const pct = allKeys.length ? Math.round((filled / allKeys.length) * 100) : 0;
        progressBar.style.width = pct + "%";
        progressText.textContent = pct + "% complete · " + filled + "/" + allKeys.length + " fields answered";
    }

    function renderTopFields() {
        container.querySelectorAll("[data-ms-top]").forEach((el) => {
            el.value = valueFor(el.dataset.msTop);
            el.addEventListener("input", () => setValue(el.dataset.msTop, el.value));
        });
    }

    function renderAll() {
        renderNav();
        renderQuestions();
        refreshOutput();
    }

    async function copyText(text) {
        try {
            await navigator.clipboard.writeText(text);
            alert("Copied.");
        } catch {
            alert("Could not copy — try selecting the text manually.");
        }
    }

    function downloadMarkdown() {
        const text = compileBible();
        const slug = (valueFor("systemName") || "magic-system")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
        const blob = new Blob([text], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = (slug || "magic-system") + ".md";
        a.click();
        URL.revokeObjectURL(url);
    }

    container.querySelector("[data-ms-copy]").addEventListener("click", () => copyText(compileBible()));
    container.querySelector("[data-ms-download]").addEventListener("click", downloadMarkdown);
    container.querySelector("[data-ms-clear]").addEventListener("click", () => {
        if (!confirm(clearLabel)) return;
        void removeJsonBlob(storageKey).catch(console.error);
        state = defaultState();
        activeSectionId = sections[0]?.id || "";
        renderTopFields();
        renderAll();
        saveStatus.textContent = "Cleared";
        saveStatus.className = "ms-status warn";
    });

    renderTopFields();
    renderAll();

    return { refresh: renderAll };
}
