import { listBookVersions, getBookVersion, formatVersionWhen } from '/core/writing-engine/version-api.js';
import { referenceSnapshot, revisionChapterList, revisionLabel, blankRevisionPayload, saveBeforeRevisionNavigation } from '/core/writing-engine/draft-revisions.js';

/** Optional reference UI. It never mounts an editor or a save handler on reference content. */
export function mountDraftRevisions({ button, shell, writePane, getBook, api, session, supabase, saveCurrent, navigate = url => window.location.assign(url) }) {
    if (!button || !writePane?.parentElement) return;
    const main = writePane.parentElement;
    const dialog = document.createElement('dialog');
    dialog.className = 'draft-setup'; dialog.setAttribute('aria-labelledby', 'draft-setup-title');
    dialog.innerHTML = `<form><header><h2 id="draft-setup-title">Drafts and reference</h2><button type="button" data-close aria-label="Close">×</button></header>
      <p>Keep a reference beside your editor, switch drafts, or start a blank revision.</p>
      <label>Reference book or draft<select data-source></select></label>
      <label>Reference version<select data-version><option value="">Current draft · read-only snapshot</option></select></label><p data-version-note class="draft-hint" hidden></p>
      <label>Writing version<select data-action><option value="current">Keep editing this draft</option><option value="existing">Edit another existing draft</option><option value="blank">Start a blank revision</option></select></label>
      <label data-existing hidden>Draft to edit<select data-target></select></label>
      <section data-new hidden><label>New draft name<input data-name maxlength="80" value="New revision"></label><label>Keep the revision<select data-destination><option value="same">Under the same book</option><option value="separate">As a separate book</option></select></label><label data-book-title-label hidden>New book title<input data-book-title maxlength="200"></label><label>Start with<select data-structure><option value="chapters">Original chapter names, with empty chapters</option><option value="blank">One blank document</option></select></label></section>
      <p class="draft-error" role="alert" data-error hidden></p><footer><button type="button" data-close>Cancel</button><button type="submit" class="draft-primary">Open workspace</button></footer></form>`;
    document.body.append(dialog);
    const find = selector => dialog.querySelector(selector);
    const wrapper = document.createElement('div'); wrapper.className = 'draft-workspace';
    const referencePane = document.createElement('section'); referencePane.className = 'draft-reference'; referencePane.setAttribute('aria-label', 'Read-only reference');
    referencePane.innerHTML = `<header><div><strong data-reference-title></strong><span data-reference-label></span></div><span class="draft-readonly">Read-only</span></header><label>Chapter<select data-reference-chapter></select></label><article class="writer-page draft-reference-text" tabindex="0" contenteditable="false" aria-label="Read-only reference text"></article>`;
    const divider = document.createElement('div'); divider.className = 'draft-divider'; divider.tabIndex = 0; divider.setAttribute('role','separator'); divider.setAttribute('aria-label','Resize writing pane'); divider.setAttribute('aria-orientation','vertical'); divider.setAttribute('aria-valuemin','35'); divider.setAttribute('aria-valuemax','75'); divider.setAttribute('aria-valuenow','60');
    const bar = document.createElement('div');bar.className='draft-mode-bar';bar.hidden=true;
    bar.innerHTML='<span data-writing-label></span><div class="draft-mobile-tabs" role="tablist" aria-label="Draft pane"><button type="button" role="tab" aria-selected="true" data-pane="write">Write</button><button type="button" role="tab" aria-selected="false" data-pane="reference">Reference</button></div><button type="button" data-choose>Choose versions</button><button type="button" data-end>Close reference</button>';
    let reference=null, source=null, generation=0, books=[], loading=0, busy=false, open=false;
    let split=60, railWasCollapsed=false;
    const scrollPositions=new Map();
    function error(message){find('[data-error]').textContent=message;find('[data-error]').hidden=false;}
    function fill(select,rows,value){select.replaceChildren(...rows.map(row=>{const option=document.createElement('option');option.value=String(row.id);option.textContent=row.label;return option;}));if(rows.some(row=>String(row.id)===String(value)))select.value=String(value);}
    function bookLabel(book){return book.title+(book.draft_parent_id||book.draft_label?` · ${revisionLabel(book)}`:'');}
    function referenceParams(url,snapshot){url.searchParams.set('referenceBook',snapshot.bookId);if(snapshot.versionId)url.searchParams.set('referenceVersion',snapshot.versionId);else url.searchParams.delete('referenceVersion');return url;}
    function renderReferenceChapter(){
        const chapters=revisionChapterList(reference?.sections),id=referencePane.querySelector('select').value;
        const chapter=chapters.find(item=>String(item.id)===id);
        const article=referencePane.querySelector('article');article.replaceChildren();
        // Copy only text-formatting nodes. No scripts, links, forms, media or event attributes.
        const parsed=new DOMParser().parseFromString(String(chapter?.content||''),'text/html');
        const allowed=new Set(['P','DIV','SPAN','STRONG','B','EM','I','U','S','H1','H2','H3','H4','BR','HR','UL','OL','LI','BLOCKQUOTE','SUP','SUB']);
        const blocked=new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','FORM','INPUT','BUTTON','TEXTAREA','SELECT','SVG','MATH','TEMPLATE','META','LINK','BASE','IMG','VIDEO','AUDIO']);
        function appendSafe(node,parent){
            if(node.nodeType===3){parent.append(document.createTextNode(node.textContent));return;}
            if(node.nodeType!==1||blocked.has(node.tagName))return;
            const target=allowed.has(node.tagName)?document.createElement(node.tagName.toLowerCase()):document.createDocumentFragment();
            if(target.nodeType===1){
                for(const name of ['font-weight','font-style','font-size','font-family','text-align','text-indent','line-height','text-decoration']){
                    const value=node.style.getPropertyValue(name);if(value&&!/[<>\\;{}@]|url\s*\(|expression/i.test(value))target.style.setProperty(name,value);
                }
                if(node.classList.contains('alysum-indent'))target.style.textIndent='1.5em';
            }
            for(const child of node.childNodes)appendSafe(child,target);parent.append(target);
        }
        for(const node of parsed.body.childNodes)appendSafe(node,article);
        if(!article.textContent.trim())article.textContent='This reference chapter is empty.';
        article.scrollTop=scrollPositions.get(id)||0;
    }
    referencePane.querySelector('select').addEventListener('change',renderReferenceChapter);
    referencePane.querySelector('article').addEventListener('scroll',()=>{scrollPositions.set(referencePane.querySelector('select').value,referencePane.querySelector('article').scrollTop);},{passive:true});
    function showReference(snapshot){
        reference=structuredClone(snapshot);scrollPositions.clear();
        referencePane.querySelector('[data-reference-title]').textContent=reference.title;
        referencePane.querySelector('[data-reference-label]').textContent=reference.label;
        fill(referencePane.querySelector('select'),revisionChapterList(reference.sections).map(chapter=>({id:chapter.id,label:chapter.title||'Untitled chapter'})));
        renderReferenceChapter();
        if(!open){
            main.insertBefore(bar,writePane);main.insertBefore(wrapper,writePane);
            wrapper.append(writePane,divider,referencePane);railWasCollapsed=shell.classList.contains('is-rail-collapsed');shell.classList.add('is-rail-collapsed');main.classList.add('has-draft-reference');shell.classList.add('is-draft-comparison');open=true;
        }
        bar.querySelector('[data-writing-label]').textContent=`Writing · ${revisionLabel(getBook())}`;
        bar.hidden=false;button.setAttribute('aria-expanded','true');setPane('write');
        history.replaceState(history.state,'',referenceParams(new URL(window.location.href),reference));
    }
    function closeReference(){
        if(!open)return;
        main.insertBefore(writePane,wrapper);wrapper.remove();bar.remove();bar.hidden=true;main.classList.remove('has-draft-reference');shell.classList.remove('is-draft-comparison');if(!railWasCollapsed)shell.classList.remove('is-rail-collapsed');open=false;button.setAttribute('aria-expanded','false');
        const url=new URL(window.location.href);url.searchParams.delete('referenceBook');url.searchParams.delete('referenceVersion');history.replaceState(history.state,'',url);
    }
    function setPane(pane){
        wrapper.dataset.pane=pane;
        for(const tab of bar.querySelectorAll('[data-pane]')){const active=tab.dataset.pane===pane;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}
    }
    for(const tab of bar.querySelectorAll('[data-pane]')){
        tab.addEventListener('click',()=>setPane(tab.dataset.pane));
        tab.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const next=tab.dataset.pane==='write'?'reference':'write';setPane(next);bar.querySelector(`[data-pane="${next}"]`).focus();});
    }
    bar.querySelector('[data-end]').addEventListener('click',closeReference);bar.querySelector('[data-choose]').addEventListener('click',()=>void openDialog());
    function resize(value){split=Math.max(35,Math.min(75,Math.round(value)));wrapper.style.setProperty('--draft-writing-width',`${split}fr`);wrapper.style.setProperty('--draft-reference-width',`${100-split}fr`);divider.setAttribute('aria-valuenow',String(split));}
    divider.addEventListener('pointerdown',event=>divider.setPointerCapture(event.pointerId));divider.addEventListener('pointermove',event=>{if(divider.hasPointerCapture(event.pointerId)){const bounds=wrapper.getBoundingClientRect();resize((event.clientX-bounds.left)/bounds.width*100);}});divider.addEventListener('pointerup',event=>{if(divider.hasPointerCapture(event.pointerId))divider.releasePointerCapture(event.pointerId);});
    divider.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();resize(event.key==='Home'?35:event.key==='End'?75:split+(event.key==='ArrowLeft'?-2:2));});
    async function loadVersions(preferred=''){
        const request=++loading;find('button[type=submit]').disabled=true;
        fill(find('[data-version]'),[{id:'',label:'Current draft · read-only snapshot'}]);find('[data-version-note]').hidden=true;
        try{
            const rows=await listBookVersions({supabase,isLocalStudio:session.mode!=='cloud',bookId:find('[data-source]').value});
            if(request!==loading)return;
            fill(find('[data-version]'),[{id:'',label:'Current draft · read-only snapshot'},...rows.map(row=>({id:row.id,label:`${row.label||'Saved version'} · ${formatVersionWhen(row.created_at)}`}))],preferred);
        }catch{if(request===loading){find('[data-version-note]').textContent='Saved versions are unavailable. You can still reference the current draft.';find('[data-version-note]').hidden=false;}}
        finally{if(request===loading&&!busy)find('button[type=submit]').disabled=false;}
    }
    async function loadSnapshot(bookId,versionId){
        const book=String(bookId)===String(getBook().id)?structuredClone(getBook()):await api.getBook(bookId);
        if(!book)throw new Error('That reference book is no longer available.');
        const version=versionId?await getBookVersion({supabase,isLocalStudio:session.mode!=='cloud',bookId:book.id,versionId}):null;
        return {book,snapshot:referenceSnapshot(book,version)};
    }
    async function openDialog(){
        if(busy||dialog.open)return;const request=++generation;find('[data-error]').hidden=true;find('button[type=submit]').disabled=true;dialog.showModal();
        try{
            books=await api.listBooks();if(request!==generation||!dialog.open)return;
            const current=getBook();books=[current,...books.filter(book=>String(book.id)!==String(current.id))];
            fill(find('[data-source]'),books.map(book=>({id:book.id,label:bookLabel(book)})),reference?.bookId||current.draft_parent_id||current.id);
            fill(find('[data-target]'),books.map(book=>({id:book.id,label:bookLabel(book)})),current.id);
            find('[data-action]').value='current';updateAction();await loadVersions(reference?.versionId||'');
        }catch(err){if(dialog.open)error(err.message||'Could not load your books.');}
    }
    function updateAction(){const action=find('[data-action]').value;find('[data-new]').hidden=action!=='blank';find('[data-existing]').hidden=action!=='existing';}
    find('[data-action]').addEventListener('change',updateAction);
    find('[data-destination]').addEventListener('change',()=>{find('[data-book-title-label]').hidden=find('[data-destination]').value!=='separate';});
    find('[data-source]').addEventListener('change',()=>void loadVersions());
    for(const close of dialog.querySelectorAll('[data-close]'))close.addEventListener('click',()=>dialog.close());
    dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
    dialog.addEventListener('close',()=>{generation++;loading++;});
    button.addEventListener('click',()=>void openDialog());
    find('form').addEventListener('submit',async event=>{
        event.preventDefault();if(busy)return;busy=true;find('[data-error]').hidden=true;
        for(const control of dialog.querySelectorAll('button,select,input'))control.disabled=true;
        try{
            const result=await loadSnapshot(find('[data-source]').value,find('[data-version]').value);source=result.book;
            const snapshot=result.snapshot,action=find('[data-action]').value;
            let targetId=getBook().id;
            if(action==='blank'){
                const status=await saveCurrent();if(status==='error')throw new Error('Save your current edits before creating another draft.');
                const payload=blankRevisionPayload({sourceBook:source,reference:snapshot,destination:find('[data-destination]').value,label:find('[data-name]').value,title:find('[data-book-title]').value,copyChapters:find('[data-structure]').value==='chapters'});
                const created=await api.insertBook(payload,{strict:true});if(!created?.id||String(created.id)===String(source.id))throw new Error('Could not create a separate revision.');targetId=created.id;
            }else if(action==='existing')targetId=find('[data-target]').value;
            if(String(targetId)!==String(getBook().id)){
                if(action!=='blank'&&!books.some(book=>String(book.id)===String(targetId)))throw new Error('Choose an available writing draft.');
                const url=referenceParams(new URL(window.location.href),snapshot);url.searchParams.set('book',targetId);
                await saveBeforeRevisionNavigation(saveCurrent,navigate,url.href);
            }else showReference(snapshot);
            dialog.close();
        }catch(err){
            const message=String(err?.message||'Could not open the revision.');
            error(/draft_parent_id|draft_label|schema cache/i.test(message)?'Same-book drafts need the draft-revisions migration in the test database. Your existing draft is unchanged.':message==='offline'?'Connect to the internet before creating a cloud revision.':message);
        }finally{busy=false;for(const control of dialog.querySelectorAll('button,select,input'))control.disabled=false;}
    });
    // Preview/settings use a single pane; Typewriter mode keeps the reference workspace.
    const observer=new MutationObserver(()=>{if(open&&shell.classList.contains('is-preview'))closeReference();});
    observer.observe(shell,{attributes:true,attributeFilter:['class']});
    const params=new URLSearchParams(window.location.search);
    if(params.get('referenceBook'))void loadSnapshot(params.get('referenceBook'),params.get('referenceVersion')||'').then(result=>showReference(result.snapshot)).catch(err=>{button.title=err.message||'Reference unavailable';});
    return {close:closeReference};
}
