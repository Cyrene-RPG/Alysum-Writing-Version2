import { createProject, THEMES, moveChapter, validateProject } from '/core/book-studio/model.js';
import { cleanProject, projectFromBook, readFile, textToHtml } from './content.js';
import { paginate } from './pagination.js';
import { download, exportEpub } from './exports.js';
const $ = id => document.getElementById(id);
const STORAGE_KEY = 'alysum:book-studio:workspace-v1';
const sample = 'The rain had stopped by the time she reached the old library. Along the windows, the last drops caught the afternoon light, and every book seemed to be waiting for someone to turn its pages.';
let project = createProject('A story taking shape',[
  {id:'opening',title:'A story taking shape',kind:'front',html:'<p>A book by you</p>'},
  {id:'chapter-one',title:'The quiet beginning',kind:'body',html:Array.from({length:12},()=>`<p>${sample}</p>`).join('')},
  {id:'chapter-two',title:'Beyond the window',kind:'body',html:`<p>${sample}</p><hr/><p>Every story begins with a possibility. Import your manuscript to make this one yours.</p>`}
]);
let selected = 1, timer, rendering = Promise.resolve(), validPreview = false, recoveryBlocked = false;
function message(text) { $('message').textContent = text; }
try { const raw = sessionStorage.getItem(STORAGE_KEY); if (raw) project = cleanProject(JSON.parse(raw)); }
catch { recoveryBlocked = true; message('The saved workspace could not be opened. It has not been overwritten. Download your current work before importing a replacement.'); }
selected = Math.min(selected,project.chapters.length-1);
function save() {
  if (recoveryBlocked) { $('save-status').textContent = 'Recovery needed · download project'; return; }
  try { sessionStorage.setItem(STORAGE_KEY,JSON.stringify(project)); $('save-status').textContent = 'Saved in this tab'; }
  catch { $('save-status').textContent = 'Not saved · download project'; }
}
async function render() {
  validPreview = false; $('print-book').disabled = true; $('page-summary').textContent = 'Setting your pages…';
  try {
    const count = await paginate(structuredClone(project),$('pages'));
    if (count === false) return;
    validPreview = true; $('page-summary').textContent = `${count} pages · ${project.settings.trim.replace('x',' × ')} in`;
    $('print-book').disabled = false;
  } catch(error) { message(error.message); $('page-summary').textContent = 'Layout needs attention'; }
}
function schedule() {
  save(); validPreview = false; $('print-book').disabled = true;
  clearTimeout(timer); timer = setTimeout(()=> { rendering = render(); },180);
}
function select(index) {
  selected = index; updateOutline();
  const chapter = project.chapters[selected];
  $('section-title').value = chapter.title; $('section-kind').value = chapter.kind;
  $('move-up').disabled = index === 0; $('move-down').disabled = index === project.chapters.length-1;
  $('remove-section').disabled = project.chapters.length === 1;
}
function updateOutline() {
  $('chapter-list').replaceChildren();
  project.chapters.forEach((chapter,index)=> {
    const li = document.createElement('li'), button = document.createElement('button'), detail = document.createElement('small');
    button.textContent = chapter.title; detail.textContent = chapter.kind === 'body' ? 'CHAPTER' : chapter.kind.toUpperCase() + ' MATTER'; button.append(detail);
    button.setAttribute('aria-current',String(selected === index));
    button.onclick = ()=> { select(index); [...$('pages').children].find(page=>page.dataset.chapter===chapter.id)?.scrollIntoView({block:'center',behavior:'smooth'}); };
    li.append(button); $('chapter-list').append(li);
  });
}
function syncControls() {
  $('book-title').value = project.title; $('book-author').value = project.author;
  document.querySelectorAll('[data-setting]').forEach(input=> { const value = project.settings[input.dataset.setting]; if (input.type === 'checkbox') input.checked = value; else input.value = value; });
  document.querySelectorAll('[data-theme]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.theme === project.settings.theme)));
  select(Math.min(selected,project.chapters.length-1));
}
function replaceProject(next) {
  if (!confirm('Replace this formatting workspace? Download the current project first if you want to keep it. Your original Alysum manuscripts are unaffected.')) return;
  project = cleanProject(next); selected = 0; recoveryBlocked = false; syncControls(); schedule(); message(next.importWarning || 'Formatting copy opened. Your source manuscript is unchanged.');
}
for (const [name,theme] of Object.entries(THEMES)) {
  const button = document.createElement('button'); button.textContent = `${theme.ornament} ${name}`; button.dataset.theme = name;
  button.onclick = ()=> { project.settings.theme = name; project.settings.font = theme.font; syncControls(); schedule(); };
  $('themes').append(button);
}
document.querySelectorAll('[data-setting]').forEach(input=>input.onchange = ()=> {
  const previous = structuredClone(project);
  project.settings[input.dataset.setting] = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value;
  try { project = validateProject(project); schedule(); }
  catch(error) { project = previous; syncControls(); message(error.message); }
});
for (const [id,key] of [['book-title','title'],['book-author','author']]) $(id).oninput = ()=> {project[key] = $(id).value; schedule();};
$('section-title').oninput = ()=> {project.chapters[selected].title = $('section-title').value || 'Untitled'; updateOutline(); schedule();};
$('section-kind').onchange = ()=> {project.chapters[selected].kind = $('section-kind').value; updateOutline(); schedule();};
for (const [id,offset] of [['move-up',-1],['move-down',1]]) $(id).onclick = ()=> {project = moveChapter(project,selected,offset); select(selected+offset); schedule();};
$('add-section').onclick = ()=> {project.chapters.push({id:crypto.randomUUID(),title:'New section',kind:'back',html:'<p>Your text here.</p>'}); select(project.chapters.length-1); schedule();};
$('remove-section').onclick = ()=> {if(project.chapters.length>1 && confirm(`Remove “${project.chapters[selected].title}” from this formatting copy?`)){project.chapters.splice(selected,1);select(Math.max(0,selected-1));schedule();}};
$('edit-section').onclick = ()=> {const div=document.createElement('div');div.innerHTML=project.chapters[selected].html;div.querySelectorAll('br').forEach(br=>br.replaceWith('\n'));div.querySelectorAll('hr').forEach(hr=>hr.replaceWith('\n\n***\n\n'));div.querySelectorAll('p,blockquote,li').forEach(p=>p.append('\n\n'));$('section-text').value=div.textContent.trim();$('editor-dialog').showModal();};
$('apply-text').onclick = ()=> {project.chapters[selected].html=textToHtml($('section-text').value);$('editor-dialog').close();schedule();};
$('zoom').onchange = ()=> {$('pages').style.zoom=$('zoom').value;}; $('pages').style.zoom=$('zoom').value;
$('save-project').onclick = ()=> download(new Blob([JSON.stringify(project,null,2)],{type:'application/json'}),`${project.title}.book-studio.json`);
$('export-epub').onclick = ()=> {try {exportEpub(project);message('EPUB exported. This edition uses English metadata and reflowable text; print page numbers and decorative print styles are omitted.');} catch(error){message(error.message);}};
$('print-book').onclick = async()=> {clearTimeout(timer);rendering=render();await rendering;if(validPreview)window.print();};
$('import-file').onclick = ()=> $('file-input').click();
$('file-input').onchange = async()=> {const file=$('file-input').files[0];if(!file)return;$('import-file').disabled=true;message('Reading manuscript…');try{replaceProject(await readFile(file));}catch(error){message(`Import failed: ${error.message}`);}finally{$('file-input').value='';$('import-file').disabled=false;}};
$('open-books').onclick = async()=> {
  $('books-dialog').showModal();$('books-list').replaceChildren();$('books-status').textContent='Loading your books…';
  try {
    const [{supabase},{resolveStudioSession},{createBooksApi}] = await Promise.all([import('/core/authentication/client.js'),import('/core/desktop/studio-session.js'),import('/core/synchronization-engine/books.js')]);
    const session = await resolveStudioSession(supabase);
    if (!session.user) throw Error('Sign in through Writing Studio, then return here to open a book.');
    const api=createBooksApi(session,supabase); const books=await api.listBooks();
    $('books-status').textContent=books.length ? 'Choose a manuscript to create a separate formatting copy.' : 'No books found.';
    for(const book of books){const button=document.createElement('button');button.textContent=book.title||'Untitled';button.onclick=async()=>{button.disabled=true;try{const full=await api.getBook(book.id);replaceProject(projectFromBook(full));$('books-dialog').close();}catch(error){$('books-status').textContent=error.message;}finally{button.disabled=false;}};$('books-list').append(button);}
  } catch(error) {$('books-status').textContent=error.message;}
};
window.addEventListener('beforeunload',save);
syncControls(); rendering=render();
