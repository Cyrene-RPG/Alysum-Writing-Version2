import {supabase} from '@alysum/authentication/client.js';
import {requireStudioSession} from '@alysum/desktop/studio-session.js';
import {createBooksApi} from '@alysum/synchronization-engine/books.js';
import {loadPublicationBook,savePublicationSettings} from '/core/publishing/publication-save.js';
import {uploadBookCover} from '/core/publishing/cover-upload.js';
import {authorAccessRequest} from '/core/publishing/author-access-client.js';
import {createEbooksApi} from '/core/ebooks/client.js';
import {readEpub} from './epub-reader.js';
import {mountEpubPublisher} from './epub-publisher.js';
import {initWorkspaceShell} from './shell.js';
async function boot(){
 const session=await requireStudioSession(supabase,location.pathname+location.search);if(!session)return;
 if(session.mode!=='cloud')throw Error('Sign in online to upload and publish an EPUB.');
 initWorkspaceShell({lead:'Writing ',accent:'Studio',subtitle:'Publish a complete EPUB.'});
 const api=createBooksApi(session,supabase),ebooks=createEbooksApi(supabase,session.user.id),id=new URLSearchParams(location.search).get('book');
 let baseline,book=null,edition=null;
 if(id){const loaded=await loadPublicationBook(api,id,session.user.id);book=loaded.book;baseline=loaded.baseline;if(!book.publish_meta?.epubEdition)throw Error('Open this written book in the regular publishing flow.');edition=await ebooks.get(id,{allowMissing:true});}
 // Confirm the migration before creating a manuscript or uploading a file.
 const {error}=await supabase.from('epub_editions').select('book_id').limit(0);if(error)throw Error('EPUB publishing needs its database setup. Run supabase-epub-editions.sql after the chapter-access setup.');
 const status=await authorAccessRequest(supabase,'status');if(!status.ready)throw Error('Connect chapter-access payments before publishing EPUBs.');
 const connected=await authorAccessRequest(supabase,'connections');
 const confirmed=saved=>{if(!saved||saved._pending||saved._synced===false)throw Error(saved?._syncError||'The EPUB details could not be confirmed online. Keep this page open and retry.');return saved;};
 await mountEpubPublisher({book,edition,connections:connected.connections.filter(c=>c.enabled),readFile:readEpub,
  setBookUrl:bookId=>history.replaceState(null,'',`?book=${encodeURIComponent(bookId)}`),
  async upload({parsed,file}){
   // A retry keeps the already-created private manuscript and chapter IDs.
   if(!book){book=await api.insertBook({title:parsed.title,media_format:'novel',sections:parsed.sections,publish_meta:{epubEdition:true,workType:'original',author:parsed.author,complete:true}});confirmed(book);history.replaceState(null,'',`?book=${encodeURIComponent(book.id)}`);}
   const text=sections=>JSON.stringify(sections.body.map(ch=>({title:ch.title,content:ch.content})));
   if(text(book.sections)!==text(parsed.sections))throw Error('Select the same EPUB to finish this upload, or start a new EPUB from Studio.');
   baseline=(await loadPublicationBook(api,book.id,session.user.id)).baseline;
   const edition=await ebooks.upload(book,file);return {book,edition};
  },
  async saveDetails(current,form){
   const publish_meta={...current.publish_meta,epubEdition:true,workType:'original',author:form.author,synopsis:form.summary,genres:form.genres,genre:form.genres[0]||'',tags:form.tags,rating:form.rating,warningMeta:form.warningMeta,warnings:form.warnings,cover_url:form.coverUrl,complete:true,epubDetails:{connectionId:form.connectionId,productUrl:form.productUrl,price:form.price,currency:form.currency,rightsConfirmed:form.rightsConfirmed}};
   const saved=confirmed(await savePublicationSettings(api,baseline,{title:form.title,publish_meta},session.user.id));baseline=(await loadPublicationBook(api,saved.id,session.user.id)).baseline;book=saved;return saved;
  },
  configure:body=>authorAccessRequest(supabase,'configure',{method:'POST',body}),
  async saveListing(current,data){
   const {error}=await supabase.from('library').upsert({id:current.id,user_id:session.user.id,data,updated_at:new Date().toISOString()});if(error)throw error;
   try{book=confirmed(await savePublicationSettings(api,baseline,{is_published:true,published_chapter_ids:data.publishedChapterIds},session.user.id));baseline=(await loadPublicationBook(api,current.id,session.user.id)).baseline;}
   catch{throw Error('Your EPUB listing was published, but its Studio status could not be confirmed. Reload to check before updating again.');}
  },
  uploadCover:(current,file)=>uploadBookCover(supabase,current.id,file,session.user.id)
 });
}
boot().catch(error=>{document.querySelector('#epubStatus').textContent=error.message;});
