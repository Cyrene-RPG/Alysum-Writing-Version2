import {compareDrafts,changedText} from '/core/screenplays/compare.js';
import {ELEMENTS,escape,textOf,sceneDetails,sliceRuns} from '/core/screenplays/model.js?v=2';
import {readScreenplay} from './screenplay-io.js?v=2';
import {styledText} from './screenplay-paper.js';

/** Read-only. Opening a comparison never restores or overwrites a draft. */
export function openDraftComparison({dialog,getDocument,api,id}) {
    const session=Symbol('comparison');dialog.comparisonSession=session;
    let baseline=null,label='',showUnchanged=false,filter='',page=0;
    dialog.classList.add('script-comparison-dialog');
    dialog.innerHTML=`<form method="dialog"><header><h2>Compare drafts</h2><button value="close" aria-label="Close comparison">×</button></header></form>
      <p>Choose an earlier draft. Changes are shown against a snapshot of your current screenplay. Your writing stays untouched.</p>
      <div class="script-compare-sources"><label>Earlier draft<select data-compare-source><option value="">Choose a saved version…</option></select></label><label class="script-compare-file">Or choose a file<input data-compare-file type="file" accept=".json,.fdx,.fountain,.txt"></label></div>
      <p data-compare-message role="status" aria-live="polite"></p><div data-compare-content></div>`;
    const source=dialog.querySelector('[data-compare-source]'),content=dialog.querySelector('[data-compare-content]'),message=dialog.querySelector('[data-compare-message]');
    dialog.showModal();
    const copies=api.deviceCopies(id),sources=new Map(copies.map((copy,index)=>['device:'+index,{label:'Device copy · '+new Date(copy.entry.updated_at).toLocaleString(),document:copy.entry.document}]));
    const current=structuredClone(getDocument());
    function alive(){return dialog.open&&dialog.comparisonSession===session;}
    function addOption(value,label){const option=document.createElement('option');option.value=value;option.textContent=label;source.append(option);}
    for(const [key,value] of sources)addOption(key,value.label);
    message.textContent=api.local?'Device drafts can be compared using a recovery copy or an exported file.':'Loading cloud revision choices…';
    let selectionRequest=0;
    function render() {
        if(!baseline||!alive())return;
        const result=compareDrafts(baseline,current),counts=result.counts;
        const changes=result.changes.filter(c=>(showUnchanged||c.kind!=='unchanged'||c.moved)&&(!filter||[c.before?textOf(c.before):'',c.after?textOf(c.after):'',JSON.stringify(c.before?.outline||{}),JSON.stringify(c.after?.outline||{}),c.kind].join(' ').toLowerCase().includes(filter)));
        const pages=Math.max(1,Math.ceil(changes.length/50));page=Math.max(0,Math.min(page,pages-1));
        content.innerHTML=`<div class="script-comparison-summary"><h3>${escape(label)} → Current snapshot</h3><p>${counts.added} added · ${counts.removed} removed · ${counts.changed} edited · ${counts.moved} moved · ${counts.outline} outline changes</p></div>
          <div class="script-comparison-controls"><label><input type="checkbox" data-show-unchanged ${showUnchanged?'checked':''}> Include unchanged elements</label><label>Find a change<input type="search" data-compare-find value="${escape(filter)}" placeholder="Search text…"></label></div>
          <div data-compare-metadata></div><div class="script-comparison-columns" aria-hidden="true"><span>Earlier draft</span><span>Current snapshot</span></div><div data-compare-rows></div>
          <footer class="script-comparison-pager"><button type="button" data-compare-page="-1" ${page===0?'disabled':''}>Previous</button><span>${changes.length} elements · Page ${page+1} of ${pages}</span><button type="button" data-compare-page="1" ${page===pages-1?'disabled':''}>Next</button></footer>`;
        const metadata=content.querySelector('[data-compare-metadata]');
        for(const item of result.metadata){const row=document.createElement('div');row.className='script-comparison-meta';const title=document.createElement('strong');title.textContent=({titlePage:'Title page',paper:'Paper size',credit:'Credit',contact:'Contact',draft:'Draft/date',author:'Author',title:'Title'}[item.field]||item.field);const before=document.createElement('span'),after=document.createElement('span');before.textContent=String(item.before);after.textContent=String(item.after);row.append(title,before,after);metadata.append(row);}
        const rows=content.querySelector('[data-compare-rows]');
        for(const change of changes.slice(page*50,page*50+50)) {
            const article=document.createElement('article');article.className='script-comparison-change';article.dataset.change=change.kind;article.dataset.moved=String(change.moved);
            const heading=document.createElement('h4');heading.textContent=[change.kind==='unchanged'?'Unchanged':change.kind==='outline'?'Outline edited':change.kind[0].toUpperCase()+change.kind.slice(1),change.moved?'Moved':'',ELEMENTS[(change.after||change.before).type]].filter(Boolean).join(' · ');article.append(heading);
            const grid=document.createElement('div');grid.className='script-comparison-columns';
            const difference=changedText(change);
            for(const side of ['before','after']) {
                const cell=document.createElement('div');cell.className='script-comparison-text';cell.setAttribute('aria-label',side==='before'?'Earlier draft':'Current snapshot');
                const block=change[side];
                if(!block){cell.classList.add('script-comparison-empty');cell.textContent=side==='before'?'Not in earlier draft':'Removed from current draft';}
                else if(change.kind==='changed'&&textOf(change.before)!==textOf(change.after)) {
                    let offset=0;
                    for(const token of difference){if(side==='before'&&token.kind==='added'||side==='after'&&token.kind==='removed')continue;const node=document.createElement(token.kind==='same'?'span':side==='before'?'del':'ins');styledText(node,sliceRuns(block.runs,offset,offset+token.text.length));offset+=token.text.length;cell.append(node);}
                }else styledText(cell,block.runs);
                if(block){const detail=document.createElement('p');detail.className='script-comparison-format';detail.textContent=ELEMENTS[block.type]+(block.dual?' · Dual dialogue':'')+(change.moved?` · Element ${(side==='before'?change.beforeIndex:change.afterIndex)+1}`:'');cell.append(detail);}
                grid.append(cell);
            }
            article.append(grid);
            if(change.before&&change.after&&JSON.stringify(sceneDetails(change.before.outline))!==JSON.stringify(sceneDetails(change.after.outline))) {
                const note=document.createElement('div');note.className='script-comparison-outline';
                for(const side of ['before','after']){const details=sceneDetails(change[side].outline),p=document.createElement('p');p.textContent=(side==='before'?'Earlier outline: ':'Current outline: ')+[details.act,details.status,details.color,details.synopsis].filter(Boolean).join(' · ');note.append(p);}article.append(note);
            }
            rows.append(article);
        }
        if(!changes.length){const p=document.createElement('p');p.textContent=result.metadata.length?'No screenplay element changes match this view.':'No differences match this view.';rows.append(p);}
        message.textContent='Comparison only. No draft has been changed.';
        content.querySelector('[data-show-unchanged]').onchange=event=>{showUnchanged=event.target.checked;page=0;render();};
        const find=content.querySelector('[data-compare-find]');find.oninput=event=>{const caret=event.target.selectionStart;filter=event.target.value.toLowerCase();page=0;render();const input=content.querySelector('[data-compare-find]');input.focus();input.setSelectionRange(caret,caret);};
        for(const button of content.querySelectorAll('[data-compare-page]'))button.onclick=()=>{page+=Number(button.dataset.comparePage);render();content.scrollIntoView({block:'start'});};
    }
    source.onchange=async()=>{
        const request=++selectionRequest,value=source.value;if(!value)return;
        try{message.textContent='Loading earlier draft…';if(sources.has(value)){baseline=structuredClone(sources.get(value).document);label=sources.get(value).label;}else{const result=await api.revision(id,Number(value.slice(6)));if(!alive()||request!==selectionRequest)return;baseline=result.document;label=source.selectedOptions[0].textContent;}page=0;render();}catch(error){if(alive()&&request===selectionRequest)message.textContent=error.message;}
    };
    dialog.querySelector('[data-compare-file]').onchange=async event=>{
        const file=event.target.files[0];if(!file)return;const request=++selectionRequest;
        try{const result=await readScreenplay(file);if(!alive()||request!==selectionRequest)return;baseline=result.document;label=file.name;source.value='';page=0;render();if(result.warnings.length)message.textContent=result.warnings.join(' ')+' Comparison only; the current draft is unchanged.';}catch(error){if(alive()&&request===selectionRequest)message.textContent=error.message;}
    };
    Promise.resolve(api.revisions(id)).then(list=>{if(!alive())return;for(const row of list)addOption('cloud:'+row.version,`v${row.version} · ${row.label||'Autosave'} · ${new Date(row.created_at).toLocaleString()}`);if(!baseline)message.textContent=list.length?'Choose a revision or file to compare.':'No cloud revisions yet. Choose a device copy or exported file.';}).catch(error=>{if(alive())message.textContent=error.message+' Device copies and file comparison are still available.';});
    dialog.addEventListener('close',()=>{if(dialog.comparisonSession===session){dialog.classList.remove('script-comparison-dialog');dialog.comparisonSession=null;}},{once:true});
}
