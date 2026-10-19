import { downloadManuscript } from "./manuscript-export.js";

export function openManuscriptDialog({ getBook, flushSave }) {
    const dialog = document.createElement("dialog");
    dialog.className = "draft-setup";
    dialog.setAttribute("aria-labelledby", "manuscript-export-title");
    dialog.innerHTML = `
        <form>
            <header><h2 id="manuscript-export-title">Manuscript export</h2><button type="button" data-close aria-label="Close">×</button></header>
            <p>Download a text manuscript with 12-point type, double spacing, half-inch paragraph indents, one-inch margins, and numbered headers. Your saved book stays unchanged.</p>
            <label>Layout<select name="layout"><option value="novel">Novel — separate title page and chapter breaks</option><option value="story">Short story — text starts on the first page</option></select></label>
            <label>Font<select name="font"><option>Courier New</option><option>Times New Roman</option></select></label>
            <label>Author / pen name<input name="authorName" maxlength="160" autocomplete="off"></label>
            <label>Contact name (optional)<input name="legalName" maxlength="160" autocomplete="off"></label>
            <label>Contact address (optional)<textarea name="address" rows="3" maxlength="600" autocomplete="off"></textarea></label>
            <label>Contact email (optional)<input name="email" type="email" maxlength="254" autocomplete="off"></label>
            <label>Surname for the header<input name="headerName" maxlength="100" autocomplete="off"></label>
            <label>Short title for the header<input name="shortTitle" maxlength="100" autocomplete="off"></label>
            <label class="manuscript-check"><input type="checkbox" name="hideFirstHeader" checked> Hide header on the first page</label>
            <label class="manuscript-check"><input type="checkbox" name="includeMatter"> Include front and back matter</label>
            <p>Italics stay; headings and lists become paragraphs; scene breaks become a centered #. Contact details are used for this download only. Check your recipient’s submission rules.</p>
            <p data-export-error role="alert" hidden></p>
            <footer><button type="button" data-close>Cancel</button><button type="submit" class="draft-primary">Download .docx</button></footer>
        </form>`;
    document.body.append(dialog);
    const form = dialog.querySelector("form");
    form.elements.shortTitle.value = String(getBook()?.title || "").slice(0, 100);
    const close = () => { dialog.close(); dialog.remove(); };
    dialog.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", close));
    dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
    form.addEventListener("submit", async event => {
        event.preventDefault();
        const submit = form.querySelector('[type="submit"]');
        const error = form.querySelector("[data-export-error]");
        submit.disabled = true;
        submit.textContent = "Preparing…";
        error.hidden = true;
        const details = Object.fromEntries(new FormData(form));
        details.hideFirstHeader = form.elements.hideFirstHeader.checked;
        details.includeMatter = form.elements.includeMatter.checked;
        try {
            const status = await flushSave?.();
            if (status === "error") throw new Error("The book could not be saved. Please retry before exporting.");
            await downloadManuscript(getBook(), details);
            close();
        } catch (failure) {
            error.textContent = failure.message || "Could not export. Please try again.";
            error.hidden = false;
        } finally {
            submit.disabled = false;
            submit.textContent = "Download .docx";
        }
    });
    dialog.showModal();
}
