import {GENRES} from '/core/publishing/genres.js';
import {warningLabels} from '/core/publishing/content-warnings.js';
import {bindTagPicker} from './tag-picker.js';
import {bindWarningPicker} from './warning-picker.js';
import {publishEpub} from '/core/ebooks/publication.js';

export async function mountEpubPublisher({root=document,book=null,edition=null,readFile,upload,saveDetails,configure,saveListing,connections=[],uploadCover,loadConnections=null,setBookUrl=()=>{}}){
 const $=id=>root.querySelector('#'+id),status=$('epubStatus');let selectedFile,parsed,coverFile,busy=false;
 const say=text=>status.textContent=text;
 const setBusy=value=>{busy=value;for(const control of root.querySelectorAll('button,input,select,textarea'))control.disabled=value;};
 let genres,tags,warnings;
 function details(){
  $('epubDetails').hidden=false;$('epubUpload').hidden=true;
  const meta=book.publish_meta||{},draft=meta.epubDetails||{};
  $('epubBookTitle').value=book.title||'';$('epubAuthor').value=meta.author||'';$('epubSummary').value=meta.synopsis||'';
  $('epubRating').value=meta.rating||'';$('epubProduct').value=draft.productUrl||'';$('epubPrice').value=draft.price||'';$('epubCurrency').value=draft.currency||'USD';$('epubRights').checked=draft.rightsConfirmed===true;
  $('epubConnection').replaceChildren(new Option('Choose your shop',''),...connections.map(c=>new Option(c.provider==='kofi'?'Ko-fi':'Payhip',c.id)));
  $('epubConnection').value=draft.connectionId||'';if(!$('epubConnection').value&&connections.length===1)$('epubConnection').selectedIndex=1;
  const labels=Object.entries(GENRES).filter(([key])=>key!=='fanfic');
  genres=bindTagPicker($('epubGenrePicker'),{id:'epubGenres',label:'Genres',initial:(meta.genres||[]).map(key=>GENRES[key]?.label).filter(Boolean),suggestions:labels.map(([,g])=>g.label),allowCustom:false,limit:3});
  tags=bindTagPicker($('epubTagPicker'),{id:'epubTags',label:'Tags',initial:meta.tags||[],suggestions:[]});
  warnings=bindWarningPicker(root,{initialState:meta.warningMeta,compact:true,chapters:book.sections.body});
  $('epubReview').textContent=`${edition.fileName} · ${book.sections.body.length} sections · Complete book · Read and download`;
  if(meta.cover_url){$('epubCoverPreview').src=meta.cover_url;$('epubCoverPreview').hidden=false;}
  $('publishEpub').textContent=book.is_published?'Update EPUB':'Publish EPUB';
  $('epubListing').hidden=!book.is_published;$('epubListing').href=`/book?id=${encodeURIComponent(book.id)}`;
 }
 function form(){return {workType:'original',title:$('epubBookTitle').value.trim(),author:$('epubAuthor').value.trim(),summary:$('epubSummary').value.trim(),genres:genres.read(true).map(label=>Object.keys(GENRES).find(key=>GENRES[key].label===label)).filter(Boolean),tags:tags.read(true),rating:$('epubRating').value,warningMeta:warnings.read(),warnings:warningLabels(warnings.read()),coverUrl:book.publish_meta?.cover_url||'',connectionId:$('epubConnection').value,productUrl:$('epubProduct').value.trim(),price:$('epubPrice').value.trim(),currency:$('epubCurrency').value,rightsConfirmed:$('epubRights').checked};}
 async function save(){
  const value=form();if(coverFile){value.coverUrl=await uploadCover(book,coverFile);coverFile=null;}
  book=await saveDetails(book,{...value});return form();
 }
 $('epubFile').addEventListener('change',async event=>{
  if(busy)return;selectedFile=null;parsed=null;$('saveEpubFile').disabled=true;
  const file=event.target.files[0];if(!file)return;setBusy(true);say('Reading EPUB…');
  try{parsed=await readFile(file);selectedFile=file;$('epubFileInfo').textContent=`${parsed.title} · ${parsed.sections.body.length} sections${parsed.images?' · Pictures stay in the download; Alysum reading uses text.':''}`;say('Review the book and confirm your upload rights.');}
  catch(error){say(error.message);}finally{setBusy(false);$('saveEpubFile').disabled=!parsed;}
 });
 $('saveEpubFile').addEventListener('click',async()=>{
  if(busy||!parsed)return;if(!$('uploadRights').checked){say('Confirm that you own the rights to upload and sell this original book.');return;}
  setBusy(true);say('Uploading your private EPUB…');
  try{const result=await upload({book,parsed,file:selectedFile});book=result.book;edition=result.edition;setBookUrl(book.id);details();say('EPUB uploaded privately. Add your listing details and whole-book price.');}
  catch(error){say(error.message);}finally{setBusy(false);$('saveEpubFile').disabled=!parsed;}
 });
 $('epubCover').addEventListener('change',event=>{coverFile=event.target.files[0]||null;});
 $('saveEpubDraft').addEventListener('click',async()=>{if(busy)return;setBusy(true);say('Saving EPUB draft…');try{await save();say('Draft saved. Your live listing has not changed.');}catch(error){say(error.message);}finally{setBusy(false);}});
 $('epubForm').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;setBusy(true);say('Saving and publishing your complete EPUB…');
  try{const value=await save();await publishEpub({book,edition,form:value,configure,saveListing:data=>saveListing(book,data)});book.is_published=true;$('epubListing').hidden=false;$('epubListing').href=`/book?id=${encodeURIComponent(book.id)}`;$('publishEpub').textContent='Update EPUB';say('Published. The whole book and EPUB download unlock together after purchase.');}
  catch(error){say(error.message);}finally{setBusy(false);}
 });
 if(loadConnections)root.defaultView?.addEventListener('focus',async()=>{
  if(busy||!book)return;
  try{const selected=$('epubConnection').value;connections=await loadConnections();$('epubConnection').replaceChildren(new Option('Choose your shop',''),...connections.map(c=>new Option(c.provider==='kofi'?'Ko-fi':'Payhip',c.id)));$('epubConnection').value=selected;if(!$('epubConnection').value&&connections.length===1)$('epubConnection').selectedIndex=1;}catch(error){say(error.message);}
 });
 $('epubForm').hidden=false;
 if(book&&edition){details();say('Edit your EPUB listing. One purchase unlocks the complete book and download.');}
 else say('Upload an original EPUB to get started.');
}
