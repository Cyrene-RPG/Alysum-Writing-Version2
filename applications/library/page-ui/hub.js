import {HUB_SHELVES,diverseBooks} from '/core/library/hub.js';
import {selectWeeklyFeature} from '/core/library/weekly-feature.js';
import {genreLabel,matchingGenreKeys} from '/core/publishing/genres.js';
import {safeCoverUrl,cropFrameStyle} from '/core/publishing/cover-upload.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const csv=v=>String(v||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean).slice(0,20);
const keys=['q','genres','tags','excludeTags','excludeWarnings','status','length','availability','format','rating','sort','shelf'];
export function mountLibraryHub(root,{api,opened,preview=false}){
 const {state,session}=opened,user=session.mode==='cloud'?session.user:null;
 let active=true;
 let epoch=0,books=new Map(),facets=[],tagChoices=[],warningChoices=[],personal=opened.snapshot||{records:[],subscriptions:[]},pending=false;
 const dialog=document.getElementById('hubDialog'),dialogBody=document.getElementById('hubDialogBody');
 const current=()=>new URL(location.href);
 function filters(url=current()){const f={};for(const k of keys){const value=url.searchParams.get(k);if(value)f[k]=['genres','tags','excludeTags','excludeWarnings'].includes(k)?csv(value):value;}return f;}
 function route(params={},replace=false){if(!active)return;const url=new URL('/library',location.origin);if(preview)url.searchParams.set('preview','1');for(const[k,v]of Object.entries(params))if(v!==undefined&&v!==null&&v!==''&&v!=='all')url.searchParams.set(k,Array.isArray(v)?v.join(','):v);history[replace?'replaceState':'pushState']({libraryScroll:0},'',url);void render();}
 function notice(text,error=false){const el=root.querySelector('#hubStatus');if(el){el.textContent=text;el.classList.toggle('is-error',error);}}
 function needUser(){if(user)return true;location.href='/login?next='+encodeURIComponent(location.pathname+location.search);return false;}
 function remember(items){for(const book of items)books.set(book.id,book);return items;}
 const progress=b=>state.read('read-position')[b.id];
 const shelf=b=>state.read('shelves')[b.id]||'';
 function card(b,{reason='',collection=null,mine=false}={}){
  const p=progress(b),cover=preview&&b.coverUrl.startsWith('/applications/library/design/hub-covers/')?b.coverUrl:safeCoverUrl(b.coverUrl),saved=shelf(b),read='/read?id='+encodeURIComponent(b.id)+(p?.chapterId?'&chapter='+encodeURIComponent(p.chapterId):'');
  return `<article class="hub-book"><a class="hub-cover" href="/book?id=${encodeURIComponent(b.id)}" aria-label="View ${esc(b.title)}">${cover?`<img src="${esc(cover)}" style="${esc(cropFrameStyle(b.coverCrop))}" alt="" loading="lazy">`:`<span>${esc(b.title)}</span>`}</a><div class="hub-book-info">
  <div class="hub-book-badges"><span>${b.status==='complete'?'Completed':'Ongoing'}</span>${b.paid?'<span>Paid chapters</span>':''}</div>
  <h3><a href="/book?id=${encodeURIComponent(b.id)}">${esc(b.title)}</a></h3><p class="hub-author">by ${b.ownerId?`<a href="/author?id=${encodeURIComponent(b.ownerId)}">${esc(b.author)}</a>`:esc(b.author)}</p>
  <p class="hub-description">${esc(b.summary||'A new story waiting to be discovered.')}</p><div class="hub-tags">${b.genres.slice(0,2).map(g=>`<a href="/library?view=browse&genres=${encodeURIComponent(g)}" data-genre-link="${esc(g)}">${esc(genreLabel(g))}</a>`).join('')}${b.tags.slice(0,1).map(t=>`<span>${esc(t)}</span>`).join('')}</div>
  <p class="hub-book-meta">${b.chapters} chapter${b.chapters===1?'':'s'}${b.words?' · '+b.words.toLocaleString()+' words':''}${b.rating?' · '+esc(b.rating):''}</p>${reason?`<p class="hub-reason">${esc(reason)}</p>`:''}
  ${p?`<p class="hub-progress">${Math.min(100,Math.max(0,Number(p.progress)||0))}% read</p>`:''}
  <div class="hub-card-actions"><a class="hub-read" href="${read}">${p?'Continue':'Start reading'}</a><button type="button" data-save="${esc(b.id)}" aria-label="${saved?'Manage saved book':'Save'} ${esc(b.title)}">${saved?'Saved ✓':'Save'}</button><button type="button" data-add="${esc(b.id)}" aria-label="Add ${esc(b.title)} to a list">＋ List</button>${mine&&collection?`<button type="button" data-remove="${esc(b.id)}" data-list="${esc(collection)}">Remove</button>`:''}</div>
  ${user?.id===b.ownerId?`<a class="hub-owner-link" href="/publish?book=${encodeURIComponent(b.id)}">${!b.summary||!b.genres.length?'Improve discovery details':'Edit discovery details'}</a>`:''}
  </div></article>`;
 }
 function listCard(l){return `<a class="hub-list-card" href="/library?view=collection&list=${encodeURIComponent(l.id)}" data-list-link="${esc(l.id)}"><span class="hub-eyebrow">${l.public?'Public reading list':'Private shelf'}</span><h3>${esc(l.title)}</h3><p>${esc(l.description||'A collection of stories worth keeping.')}</p><small>${Number(l.count)||0} books · ${esc(l.ownerName||'You')}</small></a>`;}
 function row(title,copy,items,params,reason=''){if(!items.length)return '';return `<section class="hub-shelf ${reason==='Saved reading progress'?'hub-continue':''}"><div class="hub-section-heading"><div><h2>${esc(title)}</h2><p>${esc(copy)}</p></div><a href="/library?${new URLSearchParams({view:'browse',...params})}" data-see="${esc(JSON.stringify(params))}">See all →</a></div><div class="hub-row">${items.map(b=>card(b,{reason})).join('')}</div></section>`;}
 function shell(view){
  const f=filters();root.innerHTML=`${preview?'<p class="hub-preview-note">Design preview · Invented books and account data. Nothing affects the live site.</p>':''}<div class="hub-heading"><div><p class="hub-eyebrow">A world of stories</p><h1 class="lib-display-title">${view==='mine'?'Your stories. Your space.':view==='browse'?'Every story, your way.':'Find your next obsession.'}</h1><p>${view==='mine'?'Your saved books, favorite lists, and next chapters.':'Explore new voices. Keep your favorites close.'}</p></div><form id="hubSearch" role="search"><label for="hubSearchInput">Search books, authors, genres, and tags</label><div><input id="hubSearchInput" name="q" type="search" value="${esc(f.q||'')}" placeholder="A title, a trope, a new favorite…"><button type="submit">Search</button></div></form></div>
  <nav class="hub-tabs" aria-label="Library"><a href="/library?view=discover" data-view="discover" ${view==='discover'?'aria-current="page"':''}>Discover</a><a href="/library?view=browse" data-view="browse" ${view==='browse'?'aria-current="page"':''}>Browse</a><a href="/library?view=mine" data-view="mine" ${view==='mine'?'aria-current="page"':''}>My Library</a></nav>
  <p id="hubStatus" class="hub-status" role="status" aria-live="polite">Loading your Library…</p><div id="hubContent" aria-busy="true"></div>`;
  root.querySelector('#hubSearch').addEventListener('submit',e=>{e.preventDefault();const f=filters();delete f.shelf;route({...f,view:'browse',q:new FormData(e.target).get('q'),offset:0});});
 }
 async function discover(turn){
  const requests=[api.query({sort:'new'},0,12),api.query({sort:'updated'},0,12),api.query({sort:'gems'},0,12),api.query({status:'complete',sort:'new'},0,12),api.facets(),api.collection('public',null,{limit:6}).catch(()=>[])];
  if(user)requests.push(api.query({shelf:'reading',sort:'new'},0,6));
  const settled=await Promise.allSettled(requests);
  if(settled[0].status==='rejected')throw settled[0].reason;
  const defaults=[null,{items:[]},{items:[]},{items:[]},{genres:[]},[],{items:[]}];
  const [fresh,updates,gems,complete,meta,lists,reading]=settled.map((r,i)=>r.status==='fulfilled'?r.value:defaults[i]);if(!active||turn!==epoch)return;
  facets=meta.genres||[];tagChoices=meta.tags||[];warningChoices=meta.warnings||[];
  const continueBooks=remember(reading?.items||[]).filter(b=>progress(b));
  const preferred=personal.records?.find(r=>r.kind==='preferences'&&r.bookId==='discovery')?.value?.genres||[];
  const genres=preferred.length?preferred:[...new Set(continueBooks.flatMap(b=>b.genres))].slice(0,3);
  let recommended=[];if(genres.length){const result=await api.query({genres,sort:'gems'},0,12).catch(()=>({items:[]}));if(!active||turn!==epoch)return;recommended=remember(result.items);}
  const used=new Set(continueBooks.map(b=>b.id));const select=items=>diverseBooks(remember(items),{exclude:used,limit:4});
  const featured=selectWeeklyFeature(remember([...fresh.items,...updates.items,...gems.items,...complete.items]));
  let html=featured?`<section class="hub-weekly"><div class="hub-weekly-copy"><p class="hub-eyebrow">✦ Weekly Featured Book</p><h2>${esc(featured.title)}</h2><p class="hub-weekly-author">by ${esc(featured.author)}</p><p class="hub-weekly-summary">${esc(featured.summary||'Discover a story worth reading this week.')}</p><a class="hub-weekly-action" href="/book?id=${encodeURIComponent(featured.id)}">Explore this book →</a></div><a class="hub-weekly-art" href="/book?id=${encodeURIComponent(featured.id)}" aria-label="View ${esc(featured.title)}">${featured.coverUrl?`<img src="${esc(preview&&featured.coverUrl.startsWith('/applications/library/design/hub-covers/')?featured.coverUrl:safeCoverUrl(featured.coverUrl))}" alt="" style="${esc(cropFrameStyle(featured.coverCrop))}">`:`<span>${esc(featured.title)}</span>`}</a></section>`:'';
  html+=row('Currently Reading','Pick up right where you left off.',continueBooks,{shelf:'reading'},'Saved reading progress');
  const picks=select(recommended.length?recommended:fresh.items);
  html+=row('Top Picks for You',genres.length?'Inspired by your reading and favorite genres.':'Explore stories from across Alysum.',picks,{sort:'gems'},genres.length?'Matches your genres':'Discover a new favorite');
  html+=`<section class="hub-explore"><div><p class="hub-eyebrow">Find your next story</p><h2>Browse Alysum</h2></div><div class="hub-genre-shortcuts">${facets.slice(0,8).map(g=>`<button type="button" data-genre-link="${esc(g.id)}">${esc(genreLabel(g.id))} <span>${g.count}</span></button>`).join('')}</div><button type="button" class="hub-subtle" data-preferences>Choose favorite genres</button></section>`;
  html+=row('Browse All Books','Explore the newest published stories.',select(fresh.items),{sort:'new'},'Recently published');
  html+=row('Fresh chapters','New releases, not description edits.',select(updates.items),{sort:'updated'},'New chapter released');
  html+=row('Worth discovering','Give an overlooked story its next reader.',select(gems.items),{sort:'gems'},'Less-read books, rotated daily');
  html+=row('Completed stories','Finished books for your next reading stretch.',select(complete.items),{status:'complete',sort:'new'},'Completed story');
  if(lists.length)html+=`<section class="hub-shelf"><div class="hub-section-heading"><div><h2>From reader to reader</h2><p>Public reading lists from the community.</p></div><button type="button" data-public-lists>See all →</button></div><div class="hub-list-grid">${lists.map(listCard).join('')}</div></section>`;
  if(!fresh.total)html+='<div class="hub-empty"><h2>The next great story could be yours.</h2><p>No published books are available yet.</p><a href="/studio">Open Studio</a></div>';
  return html;
 }
 function chips(f){return keys.filter(k=>!['sort','shelf'].includes(k)&&f[k]&&f[k]!=='all').flatMap(k=>(Array.isArray(f[k])?f[k]:[f[k]]).map(v=>`<button type="button" data-clear="${k}" data-value="${esc(v)}">${esc(k==='genres'?genreLabel(v):({in_progress:'Ongoing',complete:'Completed',short:'Under 10,000 words',medium:'10,000–49,999 words',long:'50,000+ words',paid:'Contains paid chapters',free:'Free to read',novel:'Novel',manga:'Manga',comic:'Comic',manhwa:'Manhwa',screenplay:'Screenplay',general:'General audiences',mature:'Mature',explicit:'Explicit'}[v]||v))} ×</button>`)).join('');}
 async function browse(turn,{mine=false}={}){
  const url=current(),f=filters(),offset=Math.max(0,Number(url.searchParams.get('offset'))||0);if(mine)f.shelf=f.shelf||'reading';
  const result=await api.query(f,offset,24);if(!active||turn!==epoch)return;
  let items=remember(result.items);
  if(mine&&!api.available){const shelves=state.read('shelves'),positions=state.read('read-position');items=items.filter(b=>f.shelf==='reading'?shelves[b.id]==='reading'||positions[b.id]&&shelves[b.id]!=='finished':shelves[b.id]===f.shelf);}
  const layout=url.searchParams.get('layout')==='list'?'list':'grid';
  return `${mine?`<div class="hub-section-heading"><div><p class="hub-eyebrow">Your reading space</p><h2>Keep every story close.</h2></div><button type="button" data-create-list>Create a shelf</button></div><div class="hub-personal-tabs">${Object.entries(HUB_SHELVES).map(([k,v])=>`<button type="button" data-shelf-view="${k}" aria-pressed="${f.shelf===k}">${v}</button>`).join('')}<button type="button" data-custom-lists>Custom shelves</button></div><p class="hub-help">${opened.cloudAvailable?'Shelves and reading progress sync to your account.':'Your saved books are available on this device. Cloud sync is temporarily unavailable.'}</p>`:''}
  <div class="hub-browse-bar"><div><h2>${mine?esc(HUB_SHELVES[f.shelf]):'All stories'}</h2><p>${result.total} book${result.total===1?'':'s'}${Object.keys(f).length?' found':''}</p></div><div class="hub-browse-controls"><button type="button" data-filters>Filters${chips(f)?' •':''}</button><label class="hub-sort-label">Sort<select id="hubSort">${[['new','Newest arrivals'],['updated','Recently updated'],['trending','Readers this week'],['popular','Most read'],['gems','Worth discovering'],['az','Title A–Z']].map(([v,l])=>`<option value="${v}" ${f.sort===v?'selected':''}>${l}</option>`).join('')}</select></label><button type="button" data-layout="${layout==='grid'?'list':'grid'}">${layout==='grid'?'List view':'Grid view'}</button></div></div>
  <div class="hub-active-filters">${chips(f)}${chips(f)?'<button type="button" data-reset>Clear all</button>':''}</div>
  ${['popular','trending'].includes(f.sort)?'<p class="hub-help">Based on distinct signed-in readers, excluding the author. Repeat visits do not add extra readers.</p>':''}
  <div class="hub-grid ${layout==='list'?'hub-list-view':''}">${items.map(b=>card(b)).join('')}</div>
  ${!items.length?`<div class="hub-empty"><h3>${mine?'Your next chapter starts here.':'No matches this time.'}</h3><p>${mine?'Save a book or start reading to build your Library.':'Try fewer filters or a broader search.'}</p><button type="button" ${mine?'data-view="browse"':'data-reset'}>${mine?'Browse stories':'Reset filters'}</button></div>`:''}
  <div class="hub-pagination">${offset?'<button type="button" data-page="'+Math.max(0,offset-24)+'">← Previous</button>':''}<span>Page ${Math.floor(offset/24)+1}</span>${result.hasMore?'<button type="button" data-page="'+(offset+24)+'">Next →</button>':''}</div>`;
 }
 async function collections(turn,publicLists=false){
  const offset=Math.max(0,Number(current().searchParams.get('offset'))||0),lists=await api.collection(publicLists?'public':'mine',null,{offset,limit:12});if(!active||turn!==epoch)return;
  return `<div class="hub-section-heading"><div><p class="hub-eyebrow">${publicLists?'Community collections':'Your own organization'}</p><h2>${publicLists?'Stories worth sharing.':'Your custom shelves'}</h2><p>${publicLists?'Explore reading lists shared by other readers.':'Private by default. Share a list only when you choose.'}</p></div>${user?'<button type="button" data-create-list>Create a shelf</button>':''}</div><div class="hub-list-grid">${lists.map(listCard).join('')}</div>${!lists.length?'<p class="hub-empty">No reading lists here yet.</p>':''}<div class="hub-pagination">${offset?`<button type="button" data-page="${Math.max(0,offset-12)}">Previous</button>`:''}${lists.length===12?`<button type="button" data-page="${offset+12}">More lists →</button>`:''}</div>`;
 }
 async function collection(turn){const id=current().searchParams.get('list');const list=await api.collection('get',id);if(!active||turn!==epoch)return;remember(list.books||[]);
  return `<div class="hub-section-heading"><div><p class="hub-eyebrow">${list.is_public?'Public reading list':'Private shelf'} · by ${esc(list.ownerName)}</p><h2>${esc(list.title)}</h2><p>${esc(list.description)}</p></div><div>${list.mine?`<button type="button" data-edit-list="${esc(id)}">Edit list</button>`:''}${list.is_public?'<button type="button" data-share-list>Copy link</button>':''}</div></div>${list.mine?'<p class="hub-help">Use “＋ List” on any book to add it to this collection.</p>':''}<div class="hub-grid">${(list.books||[]).map(b=>card(b,{collection:id,mine:list.mine})).join('')}</div>${!list.books?.length?'<p class="hub-empty">No available books in this list yet.</p>':''}`;
 }
 async function render(){
  if(!active)return;
  const turn=++epoch,url=current(),view=url.searchParams.get('view')||'discover';shell(view==='mine'||view==='collections'?'mine':view==='browse'?'browse':'discover');
  const content=root.querySelector('#hubContent');
  try{let html;if(['mine','collections'].includes(view)&&!user){html='<div class="hub-empty"><h2>A place for your favorite stories.</h2><p>Sign in to save books and organize your shelves across devices.</p><a href="/login?next=%2Flibrary%3Fview%3Dmine">Sign in to My Library</a></div>';}
   else if(view==='browse'||view==='mine')html=await browse(turn,{mine:view==='mine'});
   else if(view==='collections'||view==='lists')html=await collections(turn,view==='lists');
   else if(view==='collection')html=await collection(turn);
   else html=await discover(turn);
   if(!active||turn!==epoch)return;content.innerHTML=html||'';content.setAttribute('aria-busy','false');notice(api.available?'':'Some Library features are temporarily unavailable. You can still browse and read.');
   const sort=root.querySelector('#hubSort');if(sort)sort.value=filters().sort||'new';
   sort?.addEventListener('change',()=>route({...Object.fromEntries(current().searchParams),sort:sort.value,offset:0}));
   requestAnimationFrame(()=>window.scrollTo(0,Number(history.state?.libraryScroll)||0));
  }catch(error){if(!active||turn!==epoch)return;content.innerHTML='<div class="hub-empty"><h2>We couldn’t load this part of the Library.</h2><button type="button" data-retry>Try again</button></div>';content.setAttribute('aria-busy','false');notice(error.message,true);}
 }
 function showDialog(title,html,onSubmit){document.getElementById('hubDialogTitle').textContent=title;dialogBody.innerHTML=html+'<p class="hub-dialog-error" role="alert"></p>';if(!dialog.open)dialog.showModal();const form=dialogBody.querySelector('form');form?.addEventListener('submit',async event=>{event.preventDefault();const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);try{await onSubmit(new FormData(form));dialog.close();}catch(error){dialogBody.querySelector('.hub-dialog-error').textContent=error.message;}finally{buttons.forEach(b=>b.disabled=false);}});}
 async function filterDialog(){
  if(!facets.length){const meta=await api.facets();facets=meta.genres||[];tagChoices=meta.tags||[];warningChoices=meta.warnings||[];}const f=filters();const options=(name,values,label)=>`<label>${label}<select name="${name}"><option value="all">Any</option>${values.map(([v,l])=>`<option value="${v}" ${f[name]===v?'selected':''}>${l}</option>`).join('')}</select></label>`;
  showDialog('Find your next story',`<form id="hubFilterForm"><label>Find a genre<input type="search" id="hubGenreSearch" placeholder="Search genres…"></label><fieldset class="hub-genre-choices"><legend>Genres · match any selected genre</legend>${[...new Set([...facets.map(g=>g.id),...(f.genres||[])])].map(g=>`<label data-genre-label="${esc(genreLabel(g).toLowerCase())}"><input type="checkbox" name="genres" value="${esc(g)}" ${f.genres?.includes(g)?'checked':''}>${esc(genreLabel(g))}</label>`).join('')}</fieldset><div class="hub-form-grid">${options('status',[['in_progress','Ongoing'],['complete','Completed']],'Story status')}${options('length',[['short','Under 10,000 words'],['medium','10,000–49,999 words'],['long','50,000+ words']],'Released length')}${options('availability',[['free','Free chapters'],['paid','Contains paid chapters']],'Availability')}${options('format',[['novel','Novel'],['comic','Comic'],['manga','Manga'],['manhwa','Manhwa'],['screenplay','Screenplay']],'Format')}${options('rating',[['general','General audiences'],['mature','Mature'],['explicit','Explicit']],'Content rating')}</div><label>Include tags · match all<input name="tags" list="hubTagOptions" value="${esc((f.tags||[]).join(', '))}" placeholder="found family, slow burn"></label><label>Exclude tags<input name="excludeTags" list="hubTagOptions" value="${esc((f.excludeTags||[]).join(', '))}" placeholder="Comma-separated tags"></label><label>Exclude content warnings<input name="excludeWarnings" list="hubWarningOptions" value="${esc((f.excludeWarnings||[]).join(', '))}" placeholder="Exact warning labels, separated by commas"></label>${tagChoices.length?`<datalist id="hubTagOptions">${tagChoices.map(t=>`<option value="${esc(t)}"></option>`).join('')}</datalist>`:''}${warningChoices.length?`<datalist id="hubWarningOptions">${warningChoices.map(w=>`<option value="${esc(w)}"></option>`).join('')}</datalist>`:''}<p class="hub-help">Unspecified metadata is not treated as a rating or a guarantee about content.</p><div class="hub-dialog-actions"><button type="button" data-filter-reset>Reset</button><button type="submit" class="hub-primary">Apply filters</button></div></form>`,data=>{route({...Object.fromEntries(current().searchParams),view:current().searchParams.get('view')==='mine'?'mine':'browse',offset:0,genres:data.getAll('genres'),status:data.get('status'),length:data.get('length'),availability:data.get('availability'),format:data.get('format'),rating:data.get('rating'),tags:csv(data.get('tags')),excludeTags:csv(data.get('excludeTags')),excludeWarnings:csv(data.get('excludeWarnings'))});});
  dialogBody.querySelector('#hubGenreSearch').addEventListener('input',e=>{for(const label of dialogBody.querySelectorAll('[data-genre-label]'))label.hidden=!label.dataset.genreLabel.includes(e.target.value.toLowerCase());});dialogBody.querySelector('[data-filter-reset]').onclick=()=>{dialog.close();route({view:'browse'});};
 }
 function createList(bookId=null){if(!needUser())return;showDialog('Create a private shelf','<form><label>Shelf name<input name="title" maxlength="100" required></label><label>Description<textarea name="description" maxlength="1000"></textarea></label><p class="hub-help">New shelves are private. You can make a reading list public later.</p><button type="submit" class="hub-primary">Create shelf</button></form>',async data=>{const list=await api.collection('create',null,{title:data.get('title'),description:data.get('description')});if(bookId)await api.collection('add',list.id,{bookId});route({view:'collection',list:list.id});});}
 async function editList(id){const list=await api.collection('get',id);showDialog('Reading list settings',`<form><label>Name<input name="title" required maxlength="100" value="${esc(list.title)}"></label><label>Description<textarea name="description" maxlength="1000">${esc(list.description)}</textarea></label><label class="hub-check"><input type="checkbox" name="public" ${list.is_public?'checked':''}> Make this reading list public</label><p class="hub-help">Public lists appear in Discover and anyone with the link can see their available books. Your reading progress and other shelves stay private.</p><div class="hub-dialog-actions"><button type="button" data-delete-list="${esc(id)}">Delete list</button><button type="submit" class="hub-primary">Save changes</button></div></form>`,async data=>{await api.collection('update',id,{title:data.get('title'),description:data.get('description'),public:data.has('public')});await render();});}
 async function addToList(id){if(!needUser())return;const lists=await api.collection('mine',null,{limit:40});if(!lists.length){createList(id);return;}
  showDialog('Add to a reading list',`<form><label>Choose a list<select name="list">${lists.map(l=>`<option value="${esc(l.id)}">${esc(l.title)}${l.public?' · Public':''}</option>`).join('')}</select></label><p class="hub-help">Books added to a public list are visible to other readers.</p><button type="submit" class="hub-primary">Add book</button></form>`,async data=>{await api.collection('add',data.get('list'),{bookId:id});notice('Added to your reading list.');});
 }
 async function saveBook(id){if(!needUser())return;const b=books.get(id);if(!b)return;
  async function save(value){const previous=shelf(b);state.update('shelves',id,value||undefined);try{const saved=await opened.flush();notice(saved?'Saved to your account.':'Saved on this device. Cloud sync is temporarily unavailable.');await render();}catch(error){state.update('shelves',id,previous||undefined);throw error;}}
  if(!shelf(b)){await save('want');return;}
  showDialog('Manage saved book',`<form><label>Shelf<select name="shelf"><option value="">Remove from shelves</option>${Object.entries(HUB_SHELVES).filter(([k])=>k!=='subscriptions').map(([k,v])=>`<option value="${k}" ${shelf(b)===k?'selected':''}>${v}</option>`).join('')}</select></label><button type="submit" class="hub-primary">Save</button></form>`,async data=>save(data.get('shelf')));
 }
 async function preferences(){if(!needUser())return;if(!facets.length)facets=(await api.facets()).genres||[];const selected=personal.records?.find(r=>r.kind==='preferences')?.value?.genres||[];
  showDialog('Your discovery genres',`<form><p class="hub-help">Choose up to twelve genres. Recommendations use genre matches, never external AI analysis of manuscripts.</p><fieldset class="hub-genre-choices"><legend>Favorite genres</legend>${[...new Set([...(facets.length?facets.map(g=>g.id):matchingGenreKeys('')),...selected])].map(g=>`<label><input type="checkbox" name="genres" value="${esc(g)}" ${selected.includes(g)?'checked':''}>${esc(genreLabel(g))}</label>`).join('')}</fieldset><button type="submit" class="hub-primary">Save genres</button></form>`,async data=>{const genres=data.getAll('genres');if(genres.length>12)throw Error('Choose up to twelve genres.');await api.state(user.id,'preferences','discovery',{genres},true);personal=await api.state(user.id);await render();});
 }
 root.addEventListener('click',event=>{if(!active)return;const button=event.target.closest('button,a');if(!button)return;const d=button.dataset;
  const run=async()=>{
   if(d.view){event.preventDefault();route({view:d.view});}
   else if(d.genreLink){event.preventDefault();route({view:'browse',genres:[d.genreLink]});}
   else if(d.see){event.preventDefault();route({view:'browse',...JSON.parse(d.see)});}
   else if(d.listLink){event.preventDefault();route({view:'collection',list:d.listLink});}
   else if(d.save){event.preventDefault();await saveBook(d.save);}
   else if(d.add){event.preventDefault();await addToList(d.add);}
   else if(d.remove){await api.collection('remove',d.list,{bookId:d.remove});await render();}
   else if(d.shelfView){route({view:'mine',shelf:d.shelfView});}
   else if('customLists'in d){route({view:'collections'});}
   else if('publicLists'in d){route({view:'lists'});}
   else if('createList'in d){createList();}
   else if(d.editList){await editList(d.editList);}
   else if('preferences'in d){await preferences();}
   else if('filters'in d){await filterDialog();}
   else if('reset'in d){route({view:current().searchParams.get('view')==='mine'?'mine':'browse',shelf:filters().shelf});}
   else if(d.clear){const f=filters();f[d.clear]=Array.isArray(f[d.clear])?f[d.clear].filter(v=>v!==d.value):'';route({...Object.fromEntries(current().searchParams),...f,offset:0});}
   else if('page'in d){route({...Object.fromEntries(current().searchParams),offset:d.page});}
   else if(d.layout){route({...Object.fromEntries(current().searchParams),layout:d.layout});}
   else if('retry'in d){await render();}
   else if('shareList'in d){try{await navigator.clipboard.writeText(location.href);notice('Reading list link copied.');}catch{showDialog('Share this reading list',`<label>Public link<input readonly value="${esc(location.href)}"></label>`,()=>{});}}
  };
  if(pending&&['save','remove'].some(k=>k in d))return;
  if('save'in d||'remove'in d)pending=true;
  void run().catch(error=>notice(error.message,true)).finally(()=>{pending=false;});
 });
 dialog.addEventListener('click',event=>{const id=event.target.closest('[data-delete-list]')?.dataset.deleteList;if(id){showDialog('Delete this list?','<form><p>This removes the list and its saved membership. Books and reading progress will stay intact.</p><button type="submit" class="hub-primary">Delete list</button></form>',async()=>{await api.collection('delete',id);route({view:'collections'});});}});
 document.getElementById('hubDialogClose').addEventListener('click',()=>dialog.close());
 window.addEventListener('popstate',()=>void render());
 let scrollTimer;window.addEventListener('scroll',()=>{if(scrollTimer)return;scrollTimer=setTimeout(()=>{scrollTimer=null;history.replaceState({...history.state,libraryScroll:scrollY},'',location.href);},200);},{passive:true});
 void render();return{render,route,stop(){active=false;epoch++;books.clear();root.replaceChildren();dialog.close();dialogBody.replaceChildren();}};
}
