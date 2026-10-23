/** Disposable PostgreSQL-compatible runner. Set PGLITE_MODULE to an installed PGlite package. */
import test from 'node:test';
import fs from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const root=new URL('../../../',import.meta.url);
const sql=async path=>(await fs.readFile(new URL(path,root),'utf8')).replace(/^\\.*$/gm,'');
test('AI reader notice: real SQL migration reruns, threshold, owner exclusion, private rows and moderation dismissal',async()=>{
 const db=new PGlite();
 try{
  await db.exec(await sql('core/tests/book-reports/setup.sql'));
  await db.exec(await sql('supabase/live-site/supabase-book-reports-v2.sql'));
  const migration=await sql('supabase/live-site/supabase-book-ai-reader-notice.sql');
  await db.exec(migration);await db.exec(migration);
  await db.exec("SELECT set_config('test.ai_notice_disposable','1',false)");
  await db.exec(await sql('core/tests/book-reports/ai-notice.sql'));
 }finally{await db.close();}
});
