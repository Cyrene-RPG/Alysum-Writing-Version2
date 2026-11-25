// Parse the chapter in an inert template. Only plain text goes into the snapshot.
function chapterText(html) {
    const template = document.createElement("template");
    template.innerHTML = html;
    const root = template.content;
    root.querySelectorAll("script,style,template,[hidden]").forEach(node => node.remove());
    root.querySelectorAll("br").forEach(node => node.replaceWith("\n"));
    root.querySelectorAll("p,div,li,blockquote,h1,h2,h3,h4,h5,h6").forEach(node => node.append("\n"));
    return root.textContent.trim();
}

export function mountExcerptUpdate(row, { item, excerptApi, getManuscriptPages, showError, onSaved }) {
    const open = document.createElement("button");
    open.type = "button";
    open.className = "quote-button";
    open.textContent = "Update chapters";
    open.setAttribute("aria-expanded", "false");
    row.append(open);
    open.addEventListener("click", async () => {
        const previous = row.querySelector(".quote-update");
        if (previous) {
            previous.remove();
            open.setAttribute("aria-expanded", "false");
            return;
        }
        open.disabled = true;
        try {
            const pages = await excerptApi.managedPages(item.id);
            if (!row.isConnected || !pages.length) return;
            const chapters = getManuscriptPages();
            const panel = document.createElement("div");
            panel.className = "quote-update";
            panel.innerHTML = `
                <label>Shared page<select data-page></select></label>
                <details><summary>Currently shared text</summary><p data-saved></p></details>
                <label>Current manuscript chapter<select data-chapter></select></label>
                <label>Current chapter text<textarea rows="6" readonly></textarea></label>
                <p class="quote-hint">Highlight the passage to share, or use the entire chapter.</p>
                <div class="quote-actions">
                    <button type="button" class="quote-button" data-selection>Update with selected text</button>
                    <button type="button" class="quote-button" data-whole>Update with entire chapter</button>
                </div>`;
            const pageSelect = panel.querySelector("[data-page]");
            const source = panel.querySelector("[data-chapter]");
            const text = panel.querySelector("textarea");
            const selection = panel.querySelector("[data-selection]");
            const whole = panel.querySelector("[data-whole]");
            for (const [index, page] of pages.entries()) {
                const title = chapters.find(chapter => chapter.id === page.source)?.title;
                pageSelect.add(new Option(`Page ${index + 1} · ${title || page.text.trim().slice(0, 48)}`, String(index)));
            }
            source.add(new Option("Choose a chapter", ""));
            for (const chapter of chapters) source.add(new Option(chapter.title, chapter.id));
            function latestText() {
                const chapter = getManuscriptPages().find(chapter => chapter.id === source.value);
                return chapter ? chapterText(chapter.content) : "";
            }
            function paintSource() {
                text.value = latestText();
                text.setSelectionRange(0, 0);
                whole.disabled = !text.value;
                selection.disabled = true;
            }
            function paintPage() {
                const page = pages[pageSelect.selectedIndex];
                panel.querySelector("[data-saved]").textContent = page.text;
                source.value = page.source;
                if (source.selectedIndex < 0) source.selectedIndex = 0;
                paintSource();
            }
            pageSelect.addEventListener("change", paintPage);
            source.addEventListener("change", paintSource);
            function selectedText() { return text.value.slice(text.selectionStart, text.selectionEnd).trim(); }
            const syncSelection = () => { selection.disabled = !selectedText(); };
            for (const event of ["select", "selectionchange", "keyup", "pointerup"]) text.addEventListener(event, syncSelection);
            for (const event of ["change", "input"]) panel.addEventListener(event, e => e.stopPropagation());
            async function save(replacement) {
                if (!replacement || panel.inert) return;
                panel.inert = true;
                open.disabled = true;
                try {
                    if (latestText() !== text.value) {
                        paintSource();
                        throw new Error("The manuscript changed. Review the current text before updating this page.");
                    }
                    await excerptApi.updatePage(item.id, pages[pageSelect.selectedIndex], replacement, source.value);
                    await onSaved();
                } catch (error) {
                    showError(error);
                } finally {
                    panel.inert = false;
                    open.disabled = false;
                }
            }
            selection.addEventListener("click", () => save(selectedText()));
            whole.addEventListener("click", () => save(text.value));
            row.append(panel);
            open.setAttribute("aria-expanded", "true");
            paintPage();
            pageSelect.focus();
        } catch (error) {
            showError(error);
        } finally {
            open.disabled = false;
        }
    });
}
