import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const db=process.env.TEST_DATABASE_URL;if(!db?.endsWith('/book_reports_test'))throw Error('Disposable database required');
function query(sql){return new Promise((resolve,reject)=>{const p=spawn('psql',[db,'-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-c',sql]);let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('exit',code=>code?reject(Error(err)):resolve(out.trim()));});}
const user='00000000-0000-0000-0000-000000000005',prefix="SET request.jwt.claim.sub='"+user+"';SET ROLE authenticated;";
await Promise.all(Array.from({length:4},()=>query(prefix+"SELECT public.book_reports_v2_submit(gen_random_uuid(),'book-20','other','Concurrent report submission for a book.');")));
assert.equal(await query("SELECT count(*) FROM public.book_reports_v2 WHERE reporter_id='"+user+"';"),'1');
const id=await query("SELECT id FROM public.book_reports_v2 WHERE reporter_id='"+user+"';");
await Promise.all(Array.from({length:4},()=>query(prefix+"SELECT public.book_reports_v2_followup('"+id+"','Concurrent identical follow-up submission.','30000000-0000-0000-0000-000000000001');")));
assert.equal(await query("SELECT count(*) FROM public.book_report_events_v2 WHERE report_id='"+id+"' AND kind='followup';"),'1');
console.log('Concurrent report and follow-up requests are deduplicated.');
