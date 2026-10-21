import {ELEMENTS,TYPES,normalize,block,runs,textOf,escape,nextType,cycleType,scenes,reorderScene,sliceRuns,suggestions,toFountain,toFdx,uid} from '/core/screenplays/model.js';
import {renderPaper,styledText,printScript} from './screenplay-paper.js';
import {downloadScript,readScreenplay} from './screenplay-io.js';

function readRuns(root) {
    const out=[];
    function visit(node,marks={}) {
        if(node.nodeType===3){out.push({text:node.textContent,...marks});return;}
        if(node.nodeType!==1)return;
        if(node.tagName==='BR'){out.push({text:'\n',...marks});return;}
        const next={...marks};
        if(['B','STRONG'].includes(node.tagName)||['bold','700'].includes(node.style.fontWeight))next.bold=true;
        if(['I','EM'].includes(node.tagName)||node.style.fontStyle==='italic')next.italic=true;
        if(node.tagName==='U'||node.style.textDecoration.includes('underline'))next.underline=true;
        for(const child of node.childNodes)visit(child,next);
    }
    for(const child of root.childNodes)visit(child);
    if(out.at(-1)?.text==='\n')out.pop();
    return runs(out);
}
function position(root) {
    const sel=getSelection();if(!sel?.rangeCount||!root.contains(sel.anchorNode)||!root.contains(sel.focusNode))return null;
    const point=node=>node.nodeType===1?node:node.parentElement;
    function endpoint(node,offset){const p=point(node)?.closest('p[data-id]');if(!p)return null;const range=document.createRange();range.selectNodeContents(p);range.setEnd(node,offset);return {id:p.dataset.id,offset:range.toString().length};}
    const anchor=endpoint(sel.anchorNode,sel.anchorOffset),focus=endpoint(sel.focusNode,sel.focusOffset);return anchor&&focus?{anchor,focus}:null;
}
function restore(root,bookmark) {
    if(!bookmark)return;
    function point(value){const p=[...root.children].find(p=>p.dataset.id===value.id);if(!p)return null;const walker=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);let left=value.offset,node;while((node=walker.nextNode())){if(left<=node.textContent.length)return [node,left];left-=node.textContent.length;}return [p,p.childNodes.length];}
    const a=point(bookmark.anchor),f=point(bookmark.focus);if(a&&f){root.focus({preventScroll:true});getSelection().setBaseAndExtent(...a,...f);}
}

export async function mountScreenplayEditor({mount,record,api,preview=false,importOnOpen=false}) {
    let doc=normalize(record.document),version=record.version||0,dirty=!!record.pending,blocked=false,busy=null,saveTimer,compose=false,previewMode=false,serial=0;
    let undo=[],redo=[],lastTyped=0,bookmark=null,currentSnapshot=null,lastBackup=api.read(record.id),lastBackupError=false;
    mount.innerHTML=`<div class="script-heading"><div><a href="${preview?'/screenplay-preview?studio=1':'/studio'}">← Studio</a><h1>Screenplay</h1></div><p data-status role="status" aria-live="polite"></p></div>
    ${preview?'<p class="script-preview-note">Preview · Sample draft saved only in this browser. Live books and accounts are not used.</p>':''}
    <div class="script-tools" role="toolbar" aria-label="Screenplay tools">
      <label class="script-type-label">Element <select data-type>${Object.entries(ELEMENTS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label>
      <button type="button" data-command="bold" title="Bold (Ctrl+B / ⌘B)" aria-keyshortcuts="Control+b Meta+b"><b>B</b></button>
      <button type="button" data-command="italic" title="Italic (Ctrl+I / ⌘I)" aria-keyshortcuts="Control+i Meta+i"><i>I</i></button>
      <button type="button" data-command="underline" title="Underline (Ctrl+U / ⌘U)" aria-keyshortcuts="Control+u Meta+u"><u>U</u></button>
      <button type="button" data-undo title="Undo (Ctrl+Z / ⌘Z)">↶</button><button type="button" data-redo title="Redo (Ctrl+Shift+Z / ⌘⇧Z)">↷</button>
      <button type="button" data-dual aria-pressed="false" title="Put this character’s dialogue beside the previous character">Dual dialogue</button>
      <button type="button" data-view aria-pressed="false">Page preview</button><button type="button" data-print>Print / PDF</button>
      <button type="button" data-details>Title & page setup</button><button type="button" data-files>Files & history</button>
    </div>
    <div class="script-workspace"><aside class="script-outline"><h2>Scenes</h2><label class="script-search-label">Find in script<input type="search" data-find placeholder="Find text…"></label><div data-find-results></div><div data-scenes></div><p class="script-help">Enter advances the element. Tab changes its type. Shift+Tab goes back. Ctrl/⌘+1–7 selects an element.</p></aside>
    <section class="script-writing"><div data-manuscript class="script-manuscript" contenteditable="true" role="textbox" aria-label="Screenplay text" aria-multiline="true" spellcheck="true"></div><div data-paper class="script-paper" hidden></div><div data-suggestions class="script-suggestions" role="group" aria-label="Suggested completions" hidden></div></section></div>
    <footer class="script-footer"><span data-count></span><span data-element></span><button type="button" data-retry hidden>Retry cloud save</button><button type="button" data-reload hidden>Review cloud version</button></footer>
    <input data-import type="file" accept=".fdx,.fountain,.txt,.json" hidden><dialog class="script-dialog" data-dialog></dialog>`;
    const $=q=>mount.querySelector(q),editor=$('[data-manuscript]'),type=$('[data-type]'),status=$('[data-status]'),paper=$('[data-paper]'),dialog=$('[data-dialog]');
    function message(text){status.textContent=text;}
    function active(){const pos=position(editor)||bookmark;return doc.blocks.find(b=>b.id===pos?.focus.id)||doc.blocks[0];}
    function render(book=bookmark){editor.replaceChildren();for(const item of doc.blocks){const p=document.createElement('p');p.dataset.id=item.id;p.dataset.type=item.type;if(item.dual)p.dataset.dual='true';styledText(p,item.runs);if(!p.textContent)p.append(document.createElement('br'));editor.append(p);}restore(editor,book);refresh();}
    function read(){const items=[];for(const el of editor.children){const old=doc.blocks.find(b=>b.id===el.dataset.id);items.push({...old,...(!old?block():{}),type:el.dataset.type||old?.type||'action',runs:readRuns(el)});}doc=normalize({...doc,blocks:items.length?items:[block()]});}
    function refresh(){
        const focused=active();type.value=focused.type;$('[data-element]').textContent=ELEMENTS[focused.type];$('[data-dual]').setAttribute('aria-pressed',String(focused.dual));
        const list=scenes(doc);$('[data-scenes]').innerHTML=list.map(s=>`<div class="script-scene"><button type="button" data-scene="${escape(s.id)}"><span>${s.number||'—'}</span>${escape(s.title)}</button><div><button type="button" data-move="-1" data-id="${escape(s.id)}" aria-label="Move scene up">↑</button><button type="button" data-move="1" data-id="${escape(s.id)}" aria-label="Move scene down">↓</button></div></div>`).join('');
        const words=doc.blocks.map(textOf).join(' ').trim().split(/\s+/).filter(Boolean).length;
        $('[data-count]').textContent=`${list.filter(s=>s.number).length} scenes · ${words.toLocaleString()} words`;
        $('[data-undo]').disabled=!undo.length;$('[data-redo]').disabled=!redo.length;
        if(previewMode){const layout=renderPaper(paper,doc);$('[data-count]').textContent+=` · ${layout.pages.length} script pages`;}
        const pos=position(editor),prefix=focused&&pos?textOf(focused).slice(0,pos.focus.offset):'';
        const options=suggestions(doc,focused.type,prefix),target=$('[data-suggestions]');target.replaceChildren();target.hidden=previewMode||!options.length;
        for(const text of options){const b=document.createElement('button');b.type='button';b.dataset.complete=text;b.textContent=text;target.append(b);}
    }
    function snapshot(){return {document:structuredClone(doc),selection:position(editor)||bookmark};}
    currentSnapshot=snapshot();
    function remember(typing=false){const now=Date.now();if(!typing||now-lastTyped>750||!undo.length)undo.push(currentSnapshot);if(undo.length>100)undo.shift();lastTyped=typing?now:0;redo=[];}
    function changed({typing=false,rememberChange=true}={}) {
        if(rememberChange)remember(typing);serial++;dirty=true;bookmark=position(editor)||bookmark;currentSnapshot=snapshot();
        try{lastBackup=api.backup(record.id,doc,version);lastBackupError=false;message(api.local?'Saved on this device':'Saved on device · Waiting to sync');}
        catch(error){lastBackupError=true;message(error.message);}
        clearTimeout(saveTimer);if(!blocked)saveTimer=setTimeout(()=>void flush(),1200);refresh();
    }
    async function flush(label='') {
        clearTimeout(saveTimer);if(busy){await busy;if(label)return flush(label);return;}
        if(!dirty&&!label)return;
        const content=structuredClone(doc),stamp=serial;
        let entry=lastBackup;
        if(label||!entry||entry.version!==version||JSON.stringify(entry.document)!==JSON.stringify(content))try{entry=api.backup(record.id,content,version);lastBackup=entry;lastBackupError=false;}catch(error){message(error.message);return;}
        message(api.local?'Saving on this device…':'Saving online…');
        busy=(async()=>{try{
            const saved=await api.save(record.id,content,version,entry.requestId,label);version=saved.version;blocked=false;
            if(stamp===serial){dirty=false;lastBackup=api.read(record.id);message(api.local?'Saved on this device':'Saved online');}else {try{lastBackup=api.backup(record.id,doc,version);}catch(error){lastBackupError=true;message(error.message);}dirty=true;}
            $('[data-retry]').hidden=true;$('[data-reload]').hidden=true;
        }catch(error){blocked=true;dirty=true;message(error.message);$('[data-retry]').hidden=false;$('[data-reload]').hidden=!error.conflict;}
        finally{busy=null;if(dirty&&!blocked&&!lastBackupError)saveTimer=setTimeout(()=>void flush(),100);}})();
        await busy;
    }
    function transaction(fn){bookmark=position(editor)||bookmark;remember();fn();doc=normalize(doc);render(bookmark);changed({rememberChange:false});}
    function history(back=true){const from=back?undo:redo,to=back?redo:undo;if(!from.length)return;to.push(snapshot());const previous=from.pop();doc=previous.document;bookmark=previous.selection;render(bookmark);lastTyped=0;changed({rememberChange:false});}
    function focusBlock(id,offset=0){bookmark={anchor:{id,offset},focus:{id,offset}};restore(editor,bookmark);[...editor.children].find(el=>el.dataset.id===id)?.scrollIntoView({block:'nearest',behavior:'smooth'});refresh();}
    function setType(value){transaction(()=>{const b=active();b.type=value;if(value!=='character')b.dual=false;});}
    function split(){
        const sel=getSelection();if(!sel?.rangeCount||!editor.contains(sel.anchorNode)||!editor.contains(sel.focusNode))return;
        remember();const range=sel.getRangeAt(0);range.deleteContents();read();const parent=(range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement).closest('p[data-id]');
        const item=doc.blocks.find(b=>b.id===parent?.dataset.id)||doc.blocks[0],index=doc.blocks.indexOf(item);
        const tail=range.cloneRange();if(parent){tail.setEnd(parent,parent.childNodes.length);}const fragment=tail.extractContents();const temp=document.createElement('div');temp.append(fragment);
        item.runs=parent?readRuns(parent):[{text:''}];const next={...block(nextType(item.type,!textOf(item).trim())),runs:readRuns(temp)};
        if(!textOf(item).trim()&&item.type!=='action'){item.type='action';item.dual=false;bookmark={anchor:{id:item.id,offset:0},focus:{id:item.id,offset:0}};}
        else {doc.blocks.splice(index+1,0,next);bookmark={anchor:{id:next.id,offset:0},focus:{id:next.id,offset:0}};}
        render(bookmark);changed({rememberChange:false});
    }
    function pasteText(text){
        const sel=getSelection();if(!sel?.rangeCount||!editor.contains(sel.anchorNode)||!editor.contains(sel.focusNode))return;
        remember();const range=sel.getRangeAt(0);range.deleteContents();read();const pos=position(editor),b=doc.blocks.find(b=>b.id===pos?.focus.id)||doc.blocks[0],offset=pos?.focus.offset||0,index=doc.blocks.indexOf(b),lines=text.replace(/\r/g,'').split('\n');
        const before=sliceRuns(b.runs,0,offset),after=sliceRuns(b.runs,offset);
        const added=lines.map((text,i)=>({...block(i===0?b.type:nextType(b.type)),runs:[{text}]}));added[0].id=b.id;added[0].runs=runs([...before,...added[0].runs]);added.at(-1).runs=runs([...added.at(-1).runs,...after]);
        doc.blocks.splice(index,1,...added);const end=added.at(-1),lastOffset=textOf(end).length-after.map(r=>r.text).join('').length;bookmark={anchor:{id:end.id,offset:lastOffset},focus:{id:end.id,offset:lastOffset}};
        render(bookmark);changed({rememberChange:false});
    }
    editor.addEventListener('beforeinput',event=>{if(event.isComposing||compose)return;if(event.inputType==='insertParagraph'){event.preventDefault();split();}else if(['historyUndo','historyRedo'].includes(event.inputType)){event.preventDefault();history(event.inputType==='historyUndo');}});
    editor.addEventListener('input',event=>{if(compose||event.isComposing)return;read();changed({typing:!event.inputType?.startsWith('format')});});
    editor.addEventListener('compositionstart',()=>{compose=true;});editor.addEventListener('compositionend',()=>{compose=false;read();changed({typing:false});});
    editor.addEventListener('paste',event=>{event.preventDefault();pasteText(event.clipboardData.getData('text/plain'));});
    editor.addEventListener('drop',event=>event.preventDefault());
    function format(command){restore(editor,bookmark);document.execCommand(command);read();if(JSON.stringify(doc)!==JSON.stringify(currentSnapshot.document))changed();}
    editor.addEventListener('keydown',event=>{
        if(event.isComposing||compose||event.keyCode===229||event.altKey)return;
        const modifier=event.ctrlKey||event.metaKey,key=event.key.toLowerCase();
        if(modifier&&!event.shiftKey&&['b','i','u'].includes(key)){event.preventDefault();if(!event.repeat){bookmark=position(editor);format({b:'bold',i:'italic',u:'underline'}[key]);}return;}
        if(modifier&&key==='z'){event.preventDefault();history(!event.shiftKey);return;}
        if(modifier&&!event.shiftKey&&key==='y'){event.preventDefault();history(false);return;}
        if(modifier&&key==='s'){event.preventDefault();blocked=false;void flush();return;}
        if(modifier&&!event.shiftKey&&/^[1-7]$/.test(key)){event.preventDefault();setType(TYPES[Number(key)-1]);return;}
        if(modifier)return;
        if(event.key==='Tab'){event.preventDefault();setType(cycleType(active().type,event.shiftKey));return;}
        if(event.key==='Backspace'&&!event.shiftKey){const pos=position(editor);if(pos&&pos.anchor.id===pos.focus.id&&pos.anchor.offset===0&&pos.focus.offset===0){const i=doc.blocks.findIndex(b=>b.id===pos.focus.id);if(i>0){event.preventDefault();transaction(()=>{const previous=doc.blocks[i-1],offset=textOf(previous).length;previous.runs=runs([...previous.runs,...doc.blocks[i].runs]);doc.blocks.splice(i,1);bookmark={anchor:{id:previous.id,offset},focus:{id:previous.id,offset}};});}}}
    });
    document.addEventListener('selectionchange',()=>{const pos=position(editor);if(pos){bookmark=pos;const b=active();type.value=b.type;$('[data-element]').textContent=ELEMENTS[b.type];$('[data-dual]').setAttribute('aria-pressed',String(b.dual));}});
    mount.addEventListener('mousedown',event=>{if(event.target.closest('[data-command],[data-undo],[data-redo],[data-dual],[data-complete]'))event.preventDefault();});
    type.addEventListener('change',()=>setType(type.value));
    function show(title,body){dialog.innerHTML=`<form method="dialog"><header><h2>${title}</h2><button aria-label="Close" value="close">×</button></header></form>${body}`;dialog.showModal();}
    function backupDownload(){downloadScript(doc,JSON.stringify(doc,null,2),'json','application/json');}
    mount.addEventListener('click',async event=>{
        const target=event.target.closest('button');if(!target)return;
        try {
            if(target.dataset.command){format(target.dataset.command);return;}
            if(target.hasAttribute('data-undo')){history();return;}if(target.hasAttribute('data-redo')){history(false);return;}
            if(target.dataset.scene){focusBlock(target.dataset.scene);return;}
            if(target.dataset.move){transaction(()=>{doc=reorderScene(doc,target.dataset.id,Number(target.dataset.move));});return;}
            if(target.hasAttribute('data-dual')){const b=active(),index=doc.blocks.indexOf(b);let previous=index-1;while(previous>=0&&['dialogue','parenthetical'].includes(doc.blocks[previous].type))previous--;if(b.type!=='character'||doc.blocks[previous]?.type!=='character'){message('Select the second character cue after another character’s dialogue to enable dual dialogue.');return;}transaction(()=>{b.dual=!b.dual;});return;}
            if(target.dataset.complete){transaction(()=>{const b=active();b.runs=[{text:target.dataset.complete}];bookmark={anchor:{id:b.id,offset:target.dataset.complete.length},focus:{id:b.id,offset:target.dataset.complete.length}};});return;}
            if(target.hasAttribute('data-view')){bookmark=position(editor)||bookmark;previewMode=!previewMode;editor.hidden=previewMode;paper.hidden=!previewMode;target.setAttribute('aria-pressed',String(previewMode));target.textContent=previewMode?'Back to writing':'Page preview';refresh();if(!previewMode)restore(editor,bookmark);return;}
            if(target.hasAttribute('data-print')){printScript(doc);return;}
            if(target.hasAttribute('data-retry')){blocked=false;await flush();return;}
            if(target.hasAttribute('data-reload')){const remote=await api.remote(record.id);show('Cloud version',`<p>The cloud is at version ${remote.version}. Download your device draft before replacing it.</p><button type="button" data-export="json">Download device draft</button><button type="button" data-accept-cloud>Use cloud version</button>`);dialog.querySelector('[data-accept-cloud]').onclick=()=>{undo.push(snapshot());doc=normalize(remote.document);version=remote.version;blocked=false;dirty=true;bookmark=null;render();changed({rememberChange:false});dialog.close();};return;}
            if(target.hasAttribute('data-details')){show('Title & page setup',`<form data-title-form><label>Title<input name="title" required maxlength="200" value="${escape(doc.title)}"></label><label>Credit<input name="credit" maxlength="200" value="${escape(doc.credit)}"></label><label>Written by<input name="author" maxlength="200" value="${escape(doc.author)}"></label><label>Draft / date<input name="draft" maxlength="200" value="${escape(doc.draft)}"></label><label>Contact details<textarea name="contact" maxlength="2000">${escape(doc.contact)}</textarea></label><label>Paper<select name="paper"><option value="letter" ${doc.paper==='letter'?'selected':''}>US Letter · 8.5 × 11 in</option><option value="a4" ${doc.paper==='a4'?'selected':''}>A4 · 210 × 297 mm</option></select></label><label><input type="checkbox" name="titlePage" ${doc.titlePage?'checked':''}> Include title page in exports</label><button type="submit">Save details</button></form>`);return;}
            if(target.hasAttribute('data-files')){show('Files & history',`<div class="script-file-actions"><button type="button" data-import-open>Import screenplay</button><button type="button" data-export="json">Download Alysum backup</button><button type="button" data-export="fdx">Export Final Draft (.fdx)</button><button type="button" data-export="fountain">Export Fountain</button></div><p>FDX exchange supports drafting elements, emphasis and dual dialogue. Keep original production files containing revision sets, notes or locked pages.</p><label>Name a revision<input data-revision-name maxlength="200" placeholder="First draft"></label><button type="button" data-checkpoint>Save named revision</button><div data-history>Loading history…</div>`);const list=await api.revisions(record.id);const history=dialog.querySelector('[data-history]');if(history)history.innerHTML=list.length?list.map(r=>`<button type="button" data-revision="${r.version}">v${r.version} · ${escape(r.label||'Autosave')} · ${escape(new Date(r.created_at).toLocaleString())}</button>`).join(''):'No cloud revisions yet. Device drafts can be backed up as JSON.';return;}
            if(target.dataset.export){const kind=target.dataset.export;if(kind==='json')backupDownload();if(kind==='fdx')downloadScript(doc,toFdx(doc),'fdx','application/xml');if(kind==='fountain')downloadScript(doc,toFountain(doc),'fountain');return;}
            if(target.hasAttribute('data-import-open')){$('[data-import]').click();return;}
            if(target.hasAttribute('data-checkpoint')){if(api.local){message('Named cloud revisions require online screenplay storage. Download an Alysum backup for this device draft.');return;}const label=dialog.querySelector('[data-revision-name]').value.trim();if(!label){message('Give this revision a name.');return;}await flush(label);if(!blocked)dialog.close();return;}
            if(target.dataset.revision){const result=await api.revision(record.id,Number(target.dataset.revision));show('Restore revision',`<p>Restore version ${Number(target.dataset.revision)} as a new draft version? Your current work will remain available in history.</p><button type="button" data-confirm-restore>Restore as a new version</button>`);dialog.querySelector('[data-confirm-restore]').onclick=()=>{transaction(()=>{doc=normalize(result.document);bookmark=null;});dialog.close();};}
        }catch(error){message(error.message);}
    });
    dialog.addEventListener('submit',event=>{if(!event.target.matches('[data-title-form]'))return;event.preventDefault();const values=new FormData(event.target);transaction(()=>{doc=normalize({...doc,...Object.fromEntries(values),titlePage:values.has('titlePage')});});dialog.close();});
    $('[data-import]').addEventListener('change',async event=>{const file=event.target.files[0];event.target.value='';if(!file)return;try{const result=await readScreenplay(file);show('Import screenplay',`<p>Import “${escape(result.document.title)}” with ${result.document.blocks.length} elements? This replaces this draft. Download a backup first if needed.</p>${result.warnings.map(w=>`<p>${escape(w)}</p>`).join('')}<button type="button" data-export="json">Download current draft</button><button type="button" data-apply-import>Import draft</button>`);dialog.querySelector('[data-apply-import]').onclick=()=>{transaction(()=>{doc=result.document;bookmark=null;});dialog.close();};}catch(error){message(error.message);}});
    $('[data-find]').addEventListener('input',event=>{const term=event.target.value.trim().toLowerCase(),results=$('[data-find-results]');results.replaceChildren();if(!term)return;for(const b of doc.blocks.filter(b=>textOf(b).toLowerCase().includes(term)).slice(0,50)){const button=document.createElement('button');button.type='button';button.dataset.scene=b.id;button.textContent=textOf(b).slice(0,100);results.append(button);}});
    window.addEventListener('online',()=>{if(dirty&&!blocked)void flush();});
    window.addEventListener('beforeunload',event=>{if(dirty&&!api.local||lastBackupError){event.preventDefault();event.returnValue='';}});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&dirty&&!blocked)void flush();});
    window.addEventListener('storage',event=>{if(event.key?.endsWith(':'+record.id)&&event.newValue){try{const other=JSON.parse(event.newValue);if(other.requestId&&other.requestId!==lastBackup?.requestId){blocked=true;message('This screenplay was edited in another tab. Download a backup of this draft before continuing.');}}catch{}}});
    render();message(record.offlineError|| (dirty?'Device draft recovered · Waiting to sync':api.local?'Saved on this device':'Saved online'));
    if(dirty)void flush();if(importOnOpen)$('[data-import]').click();
    return {getDocument:()=>structuredClone(doc),flush,getLayout:()=>renderPaper(paper,doc),focus:()=>focusBlock(doc.blocks[0].id),setDocument:document=>transaction(()=>{doc=normalize(document);bookmark=null;})};
}
