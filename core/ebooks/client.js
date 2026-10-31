import {EPUB_BUCKET,validateEpubFile} from './model.js';
export function createEbooksApi(client,userId){
 const check=({data,error})=>{if(error)throw Error(/epub_editions|book-epubs|schema cache/i.test(error.message||'')?'EPUB uploads need the EPUB database setup. Ask the site owner to run the EPUB SQL.':error.message);return data;};
 return {
  async get(bookId,{allowMissing=false}={}){const row=check(await client.from('epub_editions').select('*').eq('book_id',bookId).eq('owner_id',userId).maybeSingle());if(!row){if(allowMissing)return null;throw Error('This EPUB upload is not available.');}return {bookId:row.book_id,storagePath:row.storage_path,fileName:row.file_name,chapterIds:row.chapter_ids};},
  async upload(book,file){
   validateEpubFile(file);
   const path=`${userId}/${book.id}/${crypto.randomUUID()}.epub`,storage=client.storage.from(EPUB_BUCKET);
   check(await storage.upload(path,file,{contentType:'application/epub+zip',upsert:false}));
   const chapterIds=book.sections.body.map(ch=>String(ch.id));
   const result=await client.from('epub_editions').insert({book_id:book.id,owner_id:userId,storage_path:path,file_name:file.name.slice(0,250),chapter_ids:chapterIds});
   if(result.error){
    // An interrupted response can follow a committed insert. Preserve an upload if uncertain.
    const saved=await client.from('epub_editions').select('storage_path').eq('book_id',book.id).maybeSingle();
    if(saved.error)throw Error('Upload status is uncertain. Reload this EPUB before uploading again.');
    if(saved.data?.storage_path!==path){await storage.remove([path]);check(result);}
   }
   return this.get(book.id);
  }
 };
}
