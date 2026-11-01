import {authorAccessRequest} from '/core/publishing/author-access-client.js';
/** Read-only compatibility. Never save/reconfigure the old product or grant records. */
export async function bindLegacyProtection({supabase,book,chapters}){
 let config=null,failure='';
 try{config=(await authorAccessRequest(supabase,'book',{query:{book:book.id}})).config;}
 catch(error){failure=error.message||'Could not check earlier purchase protection.';}
 const ids=[...new Set([...(config?.chapter_ids||[])].map(String))];
 const products=config?.chapterProducts||book.publish_meta?.chapterAccess?.chapterProducts||[];
 const access={lockedChapterIds:ids,chapterProducts:products,pricingMode:config?.pricingMode||'bundle',connectionId:config?.connection_id||'',productUrl:config?.purchase_url||'',minimum:String((config?.minimum_amount||0)/100),currency:config?.currency||'USD'};
 if(ids.length){const note=document.createElement('p');note.className='pub-hint';note.textContent='Earlier purchased chapters remain protected. New sales use Purchase Passes.';document.getElementById('purchasePassManage')?.after(note);}
 return{
  read:()=>structuredClone(access),
  async save(form){
   // Do not rely on an empty lock set when the server could not confirm it.
   if(failure)throw Error(failure+' Your listing has not changed.');
   if(ids.length&&form.workType==='fanfiction')throw Error('This book has earlier purchased chapters. Their protection cannot be removed by changing the work type.');
   const selected=new Set(form.chapterIds||[]);
   if(ids.some(id=>!selected.has(id)))throw Error('Keep earlier purchased chapters selected so their readers retain access.');
   // The SQL listing trigger and existing private snapshots continue protecting paid text.
  }
 };
}
