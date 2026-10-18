import { STORAGE_KEY, createDemo, restoreState, resolveDraft, resolveChapter, sameDraft, setWritingText, createRevision, wordCount } from './model.mjs';
const $ = id => document.getElementById(id);
let state;
try { state = restoreState(localStorage.getItem(STORAGE_KEY)); } catch { state = createDemo(); }
let saveTimer, targetMode = 'existing', focusAfterSetup = false;
const editor = $('writing-text');
const dialog = $('setup-dialog');
const scrollPositions = new Map();
function persist() {
    clearTimeout(saveTimer);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); $('save-status').textContent = 'Saved on this device'; }
    catch { $('save-status').textContent = 'Not saved — device storage unavailable'; }
}
function options(select, values, selected) {
    select.replaceChildren(...values.map(({id, title}) => { const option = document.createElement('option'); option.value = id; option.textContent = title; return option; }));
    if (values.some(value => value.id === selected)) select.value = selected;
}
const key = selection => `${selection.bookId}/${selection.draftId}/${selection.chapterId}`;
function rememberScroll(role) { scrollPositions.set(`${role}/${key(state[role])}`, $(role === 'writing' ? 'writing-text' : 'reference-text').scrollTop); }
function renderPane(role) {
    const {book,draft,chapter} = resolveChapter(state,state[role]);
    $(role+'-book').textContent = book.title;
    $(role+'-draft').textContent = draft.name;
    options($(role+'-chapter'),draft.chapters,state[role].chapterId);
    const element = $(role+'-text');
    if(role === 'writing') element.value = chapter.text;
    else element.textContent = chapter.text || 'This reference chapter is empty.';
    $(role+'-count').textContent = `${wordCount(chapter.text).toLocaleString()} words`;
    element.scrollTop = scrollPositions.get(`${role}/${key(state[role])}`) || 0;
}
function renderLayout() {
    const mobile = matchMedia('(max-width: 800px)').matches;
    $('workspace').style.setProperty('--split',`${state.split}fr`);
    $('workspace').style.setProperty('--remaining',`${100-state.split}fr`);
    $('workspace').dataset.active = state.mobilePane;
    $('workspace').classList.toggle('reference-hidden',Boolean(state.referenceHidden) && !mobile);
    $('splitter').setAttribute('aria-valuenow',String(state.split));
    $('toggle-reference').textContent = state.referenceHidden ? 'Show reference' : 'Hide reference';
    for(const button of document.querySelectorAll('[data-pane]')) {
        const active = button.dataset.pane === state.mobilePane;
        button.setAttribute('aria-selected',String(active));button.tabIndex = active ? 0 : -1;
    }
    document.documentElement.style.setProperty('--font-size',state.fontSize+'px');
    $('smaller').disabled = state.fontSize <= 16; $('larger').disabled = state.fontSize >= 26;
}
function render() {
    renderPane('reference');renderPane('writing');renderLayout();
    $('context-label').textContent = `${resolveDraft(state,state.reference).draft.name} → ${resolveDraft(state,state.writing).draft.name}`;
}
editor.addEventListener('input',()=>{
    setWritingText(state,editor.value);
    $('writing-count').textContent = `${wordCount(editor.value).toLocaleString()} words`;
    $('save-status').textContent = 'Saving on this device…';
    clearTimeout(saveTimer);saveTimer=setTimeout(persist,350);
});
editor.addEventListener('blur',persist);
window.addEventListener('pagehide',persist);
document.addEventListener('visibilitychange',()=>{if(document.hidden)persist();});
for(const role of ['reference','writing']) $(role+'-chapter').addEventListener('change',()=>{
    rememberScroll(role);
    state[role].chapterId=$(role+'-chapter').value;
    renderPane(role);persist();
});
function changePane(pane) {
    state.mobilePane=pane;renderLayout();persist();
}
for(const button of document.querySelectorAll('[data-pane]')) {
    button.addEventListener('click',()=>changePane(button.dataset.pane));
    button.addEventListener('keydown',event=>{
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
        event.preventDefault();const pane=event.key==='Home'?'writing':event.key==='End'?'reference':state.mobilePane==='writing'?'reference':'writing';
        changePane(pane);$(pane==='writing'?'write-tab':'reference-tab').focus();
    });
}
$('toggle-reference').addEventListener('click',()=>{state.referenceHidden=!state.referenceHidden;renderLayout();persist();});
$('smaller').addEventListener('click',()=>{state.fontSize=Math.max(16,state.fontSize-1);renderLayout();persist();});
$('larger').addEventListener('click',()=>{state.fontSize=Math.min(26,state.fontSize+1);renderLayout();persist();});
matchMedia('(max-width: 800px)').addEventListener('change',renderLayout);
const splitter=$('splitter');
function resizeTo(value){state.split=Math.round(Math.max(30,Math.min(70,value)));renderLayout();}
splitter.addEventListener('pointerdown',event=>{splitter.setPointerCapture(event.pointerId);});
splitter.addEventListener('pointermove',event=>{if(!splitter.hasPointerCapture(event.pointerId))return;const bounds=$('workspace').getBoundingClientRect();resizeTo((event.clientX-bounds.left)/bounds.width*100);});
splitter.addEventListener('pointerup',event=>{if(splitter.hasPointerCapture(event.pointerId))splitter.releasePointerCapture(event.pointerId);persist();});
splitter.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();resizeTo(event.key==='Home'?30:event.key==='End'?70:state.split+(event.key==='ArrowLeft'?-2:2));persist();});
function chosenReference(){
    const bookId=$('setup-reference-book').value,draftId=$('setup-reference-draft').value;
    const {draft}=resolveDraft(state,{bookId,draftId});
    return {bookId,draftId,chapterId:sameDraft({bookId,draftId},state.reference)?state.reference.chapterId:draft.chapters[0].id};
}
function populateReferenceDrafts(selected) {
    const book=state.books.find(item=>item.id===$('setup-reference-book').value);
    options($('setup-reference-draft'),book.drafts.map(item=>({id:item.id,title:item.name})),selected);
}
function populateWritingDrafts(selected) {
    const book=state.books.find(item=>item.id===$('setup-writing-book').value),reference=chosenReference();
    const drafts=book.drafts.filter(draft=>!sameDraft({bookId:book.id,draftId:draft.id},reference));
    options($('setup-writing-draft'),drafts.map(item=>({id:item.id,title:item.name})),selected);
    $('setup-writing-draft').disabled=!drafts.length;$('no-drafts').hidden=Boolean(drafts.length);
}
function updateBlankName() {
    const {book}=resolveDraft(state,chosenReference());
    let number=book.drafts.length+1;
    while(book.drafts.some(draft=>draft.name===`Draft ${number}`))number++;
    $('draft-name').value=`Draft ${number}`;
}
function setTargetMode(mode) {
    targetMode=mode;
    for(const button of document.querySelectorAll('[data-target]'))button.setAttribute('aria-pressed',String(button.dataset.target===mode));
    $('existing-fields').hidden=mode!=='existing';$('blank-fields').hidden=mode!=='blank';
    $('setup-error').hidden=true;
}
function openSetup(role) {
    persist();rememberScroll('reference');rememberScroll('writing');
    options($('setup-reference-book'),state.books,state.reference.bookId);
    populateReferenceDrafts(state.reference.draftId);
    options($('setup-writing-book'),state.books,state.writing.bookId);
    populateWritingDrafts(state.writing.draftId);
    updateBlankName();$('destination').value='same';$('new-book-title').value='';$('new-book-field').hidden=true;$('chapter-structure').value='chapters';
    setTargetMode('existing');dialog.showModal();
    if(role==='reference')$('setup-reference-book').focus();
    if(role==='writing')$('setup-writing-book').focus();
}
$('setup-button').addEventListener('click',()=>openSetup());
$('change-reference').addEventListener('click',()=>openSetup('reference'));
$('change-writing').addEventListener('click',()=>openSetup('writing'));
$('close-setup').addEventListener('click',()=>dialog.close());$('cancel-setup').addEventListener('click',()=>dialog.close());
dialog.addEventListener('close',()=>{if(focusAfterSetup){focusAfterSetup=false;editor.focus({preventScroll:true});}});
for(const button of document.querySelectorAll('[data-target]'))button.addEventListener('click',()=>setTargetMode(button.dataset.target));
$('setup-reference-book').addEventListener('change',()=>{populateReferenceDrafts();populateWritingDrafts();updateBlankName();});
$('setup-reference-draft').addEventListener('change',()=>{populateWritingDrafts($('setup-writing-draft').value);updateBlankName();});
$('setup-writing-book').addEventListener('change',()=>populateWritingDrafts());
$('destination').addEventListener('change',()=>{$('new-book-field').hidden=$('destination').value!=='separate';});
$('setup-form').addEventListener('submit',event=>{
    event.preventDefault();
    try {
        const reference=chosenReference();
        if(targetMode==='blank') {
            createRevision(state,{reference,destination:$('destination').value,name:$('draft-name').value,bookTitle:$('new-book-title').value,copyChapters:$('chapter-structure').value==='chapters'});
            focusAfterSetup=true;
        } else {
            const writing={bookId:$('setup-writing-book').value,draftId:$('setup-writing-draft').value};
            const {draft}=resolveDraft(state,writing);
            if(sameDraft(reference,writing))throw new Error('Choose two different drafts.');
            writing.chapterId=sameDraft(writing,state.writing)?state.writing.chapterId:draft.chapters[0].id;
            state.reference=reference;state.writing=writing;state.referenceHidden=false;state.mobilePane='writing';
        }
        render();persist();dialog.close();
    } catch(error) {$('setup-error').textContent=error.message;$('setup-error').hidden=false;}
});
$('reset-demo').addEventListener('click',()=>{
    if(!confirm('Reset the sample books? This removes edits and revisions saved in this preview on this device.'))return;
    state=createDemo();scrollPositions.clear();render();persist();
});
render();
