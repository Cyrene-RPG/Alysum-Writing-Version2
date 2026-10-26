import {mountCommentThread} from '../page-ui/comment-editor.js?v=2';
let rows=[{id:'sample-one',book_id:'demo-book',chapter_id:'one',user_id:'reader',display_name:'Sample Reader',text:'<p>Why did she leave the letter behind?</p>',parent_id:null,created_at:new Date().toISOString()},{id:'sample-two',book_id:'demo-book',chapter_id:'one',user_id:'reader-two',display_name:'Another Reader',text:'<p>I loved this chapter!</p>',parent_id:null,created_at:new Date().toISOString()}];
const client={from(table){let inserted=null,deleting=false;const filters={};const query={
 select(){return this;},eq(key,value){filters[key]=value;if(deleting)rows=rows.filter(row=>row.id!==value&&row.parent_id!==value);return this;},
 order:async()=>({data:rows.filter(row=>Object.entries(filters).every(([k,v])=>row[k]===v))}),
 insert(input){inserted={id:crypto.randomUUID(),...input,created_at:new Date().toISOString()};rows.push(inserted);return this;},
 maybeSingle:async()=>({data:table==='users'?{username:'sampleauthor',display_name:'Sample Author'}:inserted}),
 delete(){deleting=true;return this;},then(resolve){return Promise.resolve({error:null}).then(resolve);}
 };return query;}};
mountCommentThread(document.getElementById('demoComments'),{work:{id:'demo-book',ownerUserId:'sample-author',author:'Sample Author'},chapterId:'one',supabase:client,session:{mode:'cloud',user:{id:'sample-author'}}});
