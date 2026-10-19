import {normalizeSubmissionDetails,manuscriptExportChapters,MANUSCRIPT_PRESETS} from '/core/writing-engine/manuscript-export.js';
import {downloadManuscriptDocx,loadDocxLibrary} from './manuscript-docx.js';
const FIELDS=['byline','surname','shortTitle','legalName','address','email','phone','preset','paper','titlePage','includeMatter'];
export function mountManuscriptExport({button,getBook,getAuthor=()=>'',flushSave,storageScope=''}) {
    if(!button)return;
    let dialog;
    const storageKey=storageScope?`alysum:manuscript-export:details:${encodeURIComponent(storageScope)}:${encodeURIComponent(getBook().id)}`:'';
    let lastDetails;
    function open() {
        if(dialog){dialog.showModal();return;}
        let saved=null;
        if(storageKey)try{saved=JSON.parse(localStorage.getItem(storageKey)||'null');}catch{}
        const book=getBook(),author=getAuthor();
        const details=normalizeSubmissionDetails({byline:author,surname:String(author).trim().split(/\s+/).at(-1)||'',shortTitle:book.title,...saved,...lastDetails});
        dialog=document.createElement('dialog');dialog.className='manuscript-export-dialog';
        dialog.setAttribute('aria-labelledby','manuscriptExportHeading');
        dialog.innerHTML=`<form class="manuscript-export-form">
            <header><div><p class="manuscript-eyebrow">Export this draft</p><h2 id="manuscriptExportHeading">Manuscript .docx</h2></div><button type="button" data-close aria-label="Close manuscript export">×</button></header>
            <p class="manuscript-export-intro">One Word document, formatted for submission. Your draft stays as it is.</p>
            <div class="manuscript-export-columns">
            <section aria-labelledby="manuscriptAuthorHeading"><h3 id="manuscriptAuthorHeading">Author details</h3><p class="manuscript-help">Optional. Leave out any details you don’t want in the file.</p>
            <label>Author / pen name<input name="byline" maxlength="200" autocomplete="off"></label>
            <div class="manuscript-pair"><label>Surname for header<input name="surname" maxlength="200" autocomplete="off"></label><label>Short title for header<input name="shortTitle" maxlength="200" autocomplete="off"></label></div>
            <details><summary>Contact details for the first page</summary>
            <label>Legal name<input name="legalName" maxlength="200" autocomplete="off"></label>
            <label>Address<textarea name="address" rows="3" maxlength="1000" autocomplete="off"></textarea></label>
            <div class="manuscript-pair"><label>Email<input name="email" type="email" maxlength="200" autocomplete="off"></label><label>Phone<input name="phone" type="tel" maxlength="200" autocomplete="off"></label></div></details>
            <label class="manuscript-check"><input type="checkbox" name="remember" ${storageKey?'':'disabled'}>Remember these details on this device</label>
            <p class="manuscript-help">Contact details are only used in your download. They aren’t added to your public profile.</p></section>
            <section aria-labelledby="manuscriptFormatHeading"><h3 id="manuscriptFormatHeading">Format</h3>
            <label>Preset<select name="preset"><option value="classic">Shunn Classic · Courier New</option><option value="times">Manuscript · Times New Roman</option></select></label>
            <label>Paper<select name="paper"><option value="letter">US Letter · 8.5 × 11 in</option><option value="a4">A4 · 210 × 297 mm</option></select></label>
            <label class="manuscript-check"><input name="titlePage" type="checkbox">Separate title page</label>
            <label class="manuscript-check"><input name="includeMatter" type="checkbox">Include front and back matter</label>
            <div class="manuscript-spec"><strong data-font>Courier New · 12 pt</strong><ul><li>Double spaced, 1-inch margins</li><li>½-inch first-line paragraph indents</li><li>Surname / short title / page number</li><li>No header on the submission title page</li><li>Each chapter starts on a new page</li><li>Scene breaks become a centered #</li><li>Italics stay; custom fonts and headings become plain text</li></ul></div>
            <p class="manuscript-help" data-chapter-count></p></section></div>
            <p class="manuscript-export-status" role="status" aria-live="polite"></p>
            <footer><button type="button" data-close>Cancel</button><button type="submit" class="manuscript-primary">Download .docx</button></footer>
        </form>`;
        const form=dialog.querySelector('form'),status=dialog.querySelector('[role=status]'),submit=form.querySelector('[type=submit]');
        for(const key of FIELDS){const el=form.elements.namedItem(key);if(el.type==='checkbox')el.checked=details[key];else el.value=details[key];}
        form.elements.remember.checked=Boolean(saved);
        function values(){const v={};for(const key of FIELDS){const el=form.elements.namedItem(key);v[key]=el.type==='checkbox'?el.checked:el.value;}return normalizeSubmissionDetails(v);}
        function paint(){const v=values();dialog.querySelector('[data-font]').textContent=MANUSCRIPT_PRESETS[v.preset].font+' · 12 pt';const n=manuscriptExportChapters(getBook(),v).length;dialog.querySelector('[data-chapter-count]').textContent=`${n} chapter${n===1?'':'s'} in this download. Notes are excluded.`;}
        form.addEventListener('change',paint);paint();
        function close(){if(submit.disabled)return;lastDetails=values();dialog.close();dialog.remove();dialog=null;button.focus();}
        dialog.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',close));
        dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
        form.addEventListener('submit',async event=>{
            event.preventDefault();if(submit.disabled)return;submit.disabled=true;submit.textContent='Preparing…';status.textContent='Preparing your Word document…';
            try {
                const result=await flushSave?.();if(result==='error')throw Error('Your latest edits could not be saved. Close this panel and try again.');
                const v=values();
                await downloadManuscriptDocx(getBook(),v);
                lastDetails=v;
                if(storageKey)try{if(form.elements.remember.checked)localStorage.setItem(storageKey,JSON.stringify(v));else localStorage.removeItem(storageKey);}catch{status.textContent='Download started. Your browser could not remember these details.';return;}
                status.textContent='Download started. Look in your browser’s Downloads.';
            }catch(error){status.textContent=String(error?.message||'Could not export this draft.');}
            finally{submit.disabled=false;submit.textContent='Download .docx';}
        });
        document.body.appendChild(dialog);dialog.showModal();
        void loadDocxLibrary().catch(()=>{});
    }
    button.addEventListener('click',open);
    return {open};
}
