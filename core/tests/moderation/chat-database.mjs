/** Isolated real migration checks; PGLITE_MODULE points to an installed PGlite. */
import test from 'node:test';
import fs from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
async function read(url){let output='';for(const line of (await fs.readFile(url,'utf8')).split('\n')){
 const include=line.match(/^\\ir\s+(.+)$/);if(include)output+=await read(new URL(include[1],url));else if(!line.startsWith('\\'))output+=line+'\n';
}return output;}
test('private staff chat: real migrations, verification, identity, pagination, idempotency and revocation',async()=>{
 const db=new PGlite();try{
  await db.exec(await read(new URL('setup.sql',import.meta.url)));
  await db.exec(await read(new URL('../../../supabase/live-site/supabase-moderation-center.sql',import.meta.url)));
  await db.exec("SELECT set_config('test.chat_disposable','1',false)");
  const existing=(await read(new URL('security.sql',import.meta.url))).replace("current_database()='moderation_test'","current_setting('test.chat_disposable',true)='1'");
  await db.exec(existing);
  const migration=await read(new URL('../../../supabase/live-site/supabase-moderator-chat.sql',import.meta.url));
  await db.exec(migration);await db.exec(migration);
  await db.exec("SELECT set_config('test.chat_disposable','1',false)");
  await db.exec(await read(new URL('chat-security.sql',import.meta.url)));
 }finally{await db.close();}
});
