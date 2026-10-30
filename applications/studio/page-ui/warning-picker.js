import {CORE_WARNINGS,WARNING_CATALOG,WARNING_CATEGORIES,searchWarnings,warningDefinition} from '/core/publishing/warning-catalog.js';
import {normalizeWarningState,addWarning,addCustomWarning,removeWarning,warningLabels,WARNING_OPTIONS} from '/core/publishing/content-warnings.js';
import {renderContentWarnings} from '/site-appearance/components/content-warnings.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function bindWarningPicker(root,{getSelected=()=>[],setSelected=()=>{},initialState=null,chapters=[],compact=false}={}) {
    const picker=root.querySelector('#warningPicker');if(!picker)return {read:()=>normalizeWarningState(initialState,getSelected())};
    let state=normalizeWarningState(initialState,getSelected()),offset=0,openEntry='';
    picker.className='warning-picker';
    picker.innerHTML='<fieldset class="warning-core"><legend>Core warnings *</legend><p class="pub-hint">Select every applicable core warning, or confirm that none apply. There is no option to withhold core warnings.</p><div data-warning-core></div></fieldset>'+
      '<div class="warning-search-controls"><label for="warningSearch">Additional warnings and mature-content details</label><input type="search" id="warningSearch" placeholder="Search '+WARNING_CATALOG.length.toLocaleString()+' labels and their aliases…" autocomplete="off" aria-controls="warningResults" aria-describedby="warningSearchHelp"><p id="warningSearchHelp" class="pub-hint">Search by label or familiar wording. Adult sexual-content descriptors refer to adults. Selecting a label does not override Alysum’s content rules.</p><label for="warningCategory">Browse a category</label><select id="warningCategory"><option value="">All categories</option>'+WARNING_CATEGORIES.map(category=>'<option>'+escape(category)+'</option>').join('')+'</select></div>'+
      '<p data-warning-status role="status" aria-live="polite"></p><div id="warningResults" class="warning-results"></div><button type="button" data-warning-more hidden>More matches</button><button type="button" data-warning-custom hidden>Add a custom warning</button>'+
      '<section class="warning-selected" aria-label="Selected additional warnings"><h3>Selected additional warnings</h3><div data-warning-selected></div></section>'+
      '<label for="warningNote">Additional warning note</label><textarea id="warningNote" maxlength="4000" rows="3" placeholder="Optional context for readers…"></textarea>'+
      '<details class="warning-reader-preview"><summary>Preview what readers will see</summary><div data-warning-preview></div></details>';
    const $=selector=>picker.querySelector(selector),search=$('#warningSearch'),category=$('#warningCategory'),results=$('#warningResults'),status=$('[data-warning-status]');
    $('#warningNote').value=state.note;
    function sync(){setSelected(warningLabels(state));paintCore();renderContentWarnings($('[data-warning-preview]'),state,{chapters});}
    function paintCore(){const focused=picker.ownerDocument.activeElement,focusCore=focused?.dataset.coreWarning,focusNone=focused?.hasAttribute('data-core-none');$('[data-warning-core]').innerHTML=CORE_WARNINGS.map(item=>'<label><input type="checkbox" data-core-warning="'+item.id+'" '+(state.coreIds.includes(item.id)?'checked':'')+'> '+escape(item.label)+'</label>').join('')+'<label><input type="checkbox" data-core-none '+(state.noneApply?'checked':'')+'> None of these core warnings apply</label>';if(focusCore)picker.querySelector('[data-core-warning="'+focusCore+'"]').focus({preventScroll:true});else if(focusNone)$('[data-core-none]').focus({preventScroll:true});}
    function paintResults(reset=true){
        if(reset){offset=0;results.replaceChildren();}
        if(!search.value.trim()&&!category.value){status.textContent='Search for a warning, or choose a category to browse.';$('[data-warning-more]').hidden=true;$('[data-warning-custom]').hidden=true;return;}
        const found=searchWarnings(search.value,{category:category.value,offset,limit:compact?8:30});
        status.textContent=found.total?found.total.toLocaleString()+' matching labels.':'No matching labels.';
        for(const item of found.items){const selected=item.kind==='core'?state.coreIds.includes(item.id):state.entries.some(value=>value.id===item.id);const button=document.createElement('button');button.type='button';button.dataset.addWarning=item.id;button.disabled=selected;button.setAttribute('aria-label',(selected?'Selected: ':'Add ')+item.label);const title=document.createElement('strong'),detail=document.createElement('span');title.textContent=item.label;detail.textContent=(item.kind==='core'?'Core warning':item.kind==='adult'?'Adult content':item.kind==='content'?'Content detail':item.kind==='media'?'Media content':'Content warning')+' · '+item.category+(selected?' · Selected':'');button.append(title,detail);if(item.description){const definition=document.createElement('span');definition.textContent=item.description;button.append(definition);}results.append(button);}
        offset+=found.items.length;$('[data-warning-more]').hidden=offset>=found.total;
        $('[data-warning-custom]').hidden=!search.value.trim()||!!warningDefinition(search.value);
        $('[data-warning-custom]').textContent='Add custom warning: '+search.value.trim();
    }
    function paintSelected(){
        const focused=picker.ownerDocument.activeElement,focusId=focused?.closest('[data-warning-entry]')?.dataset.warningEntry;
        $('[data-warning-selected]').innerHTML=state.entries.length?state.entries.map(item=>'<article data-warning-entry="'+escape(item.id)+'"><div class="warning-entry-head"><div><strong>'+escape(item.label)+'</strong><span>'+escape(item.kind==='legacy'?'Existing broad warning':item.category)+'</span></div><button type="button" data-remove-warning="'+escape(item.id)+'" aria-label="Remove '+escape(item.label)+'">×</button></div><button type="button" data-warning-details="'+escape(item.id)+'" aria-expanded="'+(openEntry===item.id)+'">Details / chapters</button><div data-warning-detail-panel '+(openEntry===item.id?'':'hidden')+'></div></article>').join(''):'<p class="pub-hint">No additional warnings selected.</p>';
        if(openEntry)paintDetails(openEntry);
        if(focusId&&!state.entries.some(item=>item.id===focusId))search.focus();
    }
    function paintDetails(id){
        const article=[...picker.querySelectorAll('[data-warning-entry]')].find(el=>el.dataset.warningEntry===id),item=state.entries.find(entry=>entry.id===id);if(!article||!item)return;
        article.querySelector('[data-warning-detail-panel]').innerHTML='<div class="warning-detail-grid">'+Object.entries(WARNING_OPTIONS).map(([field,values])=>'<label>'+({depiction:'How it appears',timing:'When',detail:'Detail level',frequency:'Frequency'}[field])+'<select data-warning-field="'+field+'">'+values.map(value=>'<option value="'+value+'" '+(item[field]===value?'selected':'')+'>'+({depicted:'Directly depicted','':'Not specified'}[value]||value[0].toUpperCase()+value.slice(1))+'</option>').join('')+'</select></label>').join('')+'</div><label>Applies to<select data-warning-field="scope"><option value="work" '+(item.scope==='work'?'selected':'')+'>Whole work</option><option value="chapters" '+(item.scope==='chapters'?'selected':'')+'>Specific chapters</option></select></label><fieldset class="warning-chapter-list" '+(item.scope==='chapters'?'':'hidden')+'><legend>Chapters</legend>'+chapters.map(ch=>'<label><input type="checkbox" data-warning-chapter="'+escape(ch.id)+'" '+(item.chapterIds.includes(String(ch.id))?'checked':'')+'> '+escape(ch.title||'Untitled chapter')+'</label>').join('')+(chapters.length?'':'<p>Add a chapter before assigning chapter-specific warnings.</p>')+'</fieldset>';
    }
    picker.addEventListener('change',event=>{
        if(event.target.matches('[data-core-warning]')){const id=event.target.dataset.coreWarning;if(event.target.checked)state=addWarning(state,id);else state=removeWarning(state,id);state.reviewed=true;sync();paintResults();return;}
        if(event.target.matches('[data-core-none]')){state.noneApply=event.target.checked;state.reviewed=true;if(state.noneApply)state.coreIds=[];sync();paintResults();return;}
        const article=event.target.closest('[data-warning-entry]'),item=state.entries.find(entry=>entry.id===article?.dataset.warningEntry);if(!item)return;
        if(event.target.dataset.warningField){const field=event.target.dataset.warningField;item[field]=event.target.value;if(field==='scope'){if(item.scope==='work')item.chapterIds=[];paintDetails(item.id);}sync();}
        if(event.target.hasAttribute('data-warning-chapter')){item.chapterIds=[...article.querySelectorAll('[data-warning-chapter]:checked')].map(input=>input.dataset.warningChapter);sync();}
    });
    picker.addEventListener('click',event=>{
        const button=event.target.closest('button');if(!button)return;
        try{
            if(button.dataset.addWarning){state=addWarning(state,button.dataset.addWarning);sync();paintSelected();paintResults();search.focus();}
            if(button.dataset.removeWarning){state=removeWarning(state,button.dataset.removeWarning);if(openEntry===button.dataset.removeWarning)openEntry='';sync();paintSelected();paintResults();}
            if(button.dataset.warningDetails){openEntry=openEntry===button.dataset.warningDetails?'':button.dataset.warningDetails;paintSelected();const next=[...picker.querySelectorAll('[data-warning-details]')].find(el=>el.dataset.warningDetails===button.dataset.warningDetails);next?.focus();}
            if(button.hasAttribute('data-warning-more'))paintResults(false);
            if(button.hasAttribute('data-warning-custom')){state=addCustomWarning(state,search.value);sync();paintSelected();paintResults();}
        }catch(error){status.textContent=error.message;}
    });
    search.addEventListener('input',()=>paintResults());category.addEventListener('change',()=>paintResults());
    $('#warningNote').addEventListener('input',event=>{state.note=event.target.value;sync();});
    if (compact) {
        picker.classList.add('warning-picker-compact');
        const wrap = (nodes, text, open = false) => {
            const details = document.createElement('details'), summary = document.createElement('summary');
            details.open = open; summary.textContent = text; details.append(summary);
            nodes[0].before(details); nodes.forEach(node => details.append(node)); return details;
        };
        wrap([$('.warning-core')], 'Core warnings · review required');
        const controls = $('.warning-search-controls');
        wrap([controls.querySelector('label[for="warningCategory"]'),category], 'Browse warning categories');
        const note = $('#warningNote');
        wrap([picker.querySelector('label[for="warningNote"]'),note,$('.warning-reader-preview')], 'Warning note & reader preview');
    }
    sync();paintSelected();paintResults();
    return {read:()=>normalizeWarningState(state),focusCore(){picker.querySelector('[data-core-warning]')?.focus();}};
}
