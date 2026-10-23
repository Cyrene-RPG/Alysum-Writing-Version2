import test from 'node:test';
import assert from 'node:assert/strict';
import {REPORT_REASONS,validateReport,safeSupportingUrl,reportError} from '../../book-reports/model.js';
import {createBookReportService} from '../../book-reports/service.js';
const book={id:'book',chapters:[{id:'one'}]};
const value=()=>({reason:'suspected_ai',explanation:'A detailed concern for staff.',chapterId:'one',tagDetails:'',supportingUrl:''});
test('Every reason accepts a substantive explanation and rejects unknown reasons',()=>{
 assert.equal(REPORT_REASONS.length,8);for(const {id}of REPORT_REASONS)assert.equal(validateReport({...value(),reason:id,tagDetails:'Missing violence warning.'},book.chapters),'');
 assert.match(validateReport({...value(),reason:'invented'},book.chapters),/reason/);
 assert.match(validateReport({...value(),explanation:'   '},book.chapters),/10/);
 assert.match(validateReport({...value(),explanation:'x'.repeat(4001)},book.chapters),/4,000/);
});
test('Tag reports require specifics; unpublished chapter IDs cannot be submitted',()=>{
 assert.match(validateReport({...value(),reason:'improper_tags'},book.chapters),/tags/);
 assert.match(validateReport({...value(),chapterId:'draft'},book.chapters),/chapter/);
 assert.equal(validateReport({...value(),chapterId:''},book.chapters),'');
});
test('Supporting links cannot execute scripts or carry embedded credentials',()=>{
 for(const url of ['javascript:alert(1)','data:text/html,hi','https://user:pass@example.org','not a URL'])assert.equal(safeSupportingUrl(url),null);
 assert.equal(safeSupportingUrl('https://example.org/original'),'https://example.org/original');
 assert.equal(safeSupportingUrl(''),'');
 assert.match(validateReport({...value(),supportingUrl:'javascript:bad'},book.chapters),/https/);
});
test('The service sends no caller-controlled user or staff identity',async()=>{
 const calls=[],client={auth:{getSession:async()=>({data:{session:{user:{id:'reader'}}}})},rpc:async(name,args)=>{calls.push({name,args});return {data:{id:'receipt'}};}};
 const service=createBookReportService(client);assert.equal((await service.session()).user.id,'reader');
 await service.submit(book,{...value(),reporter_id:'another',status:'resolved'},'request-id');
 assert.equal(calls[0].name,'book_reports_v2_submit');assert.ok(!('reporter_id'in calls[0].args));assert.ok(!('status'in calls[0].args));
 assert.equal(calls[0].args.p_request_id,'request-id');assert.equal(calls[0].args.p_book_id,'book');
 await assert.rejects(service.submit(book,{...value(),explanation:''},'id'),/10/);assert.equal(calls.length,1);
});
test('Service failures propagate and setup failures have a useful message',async()=>{
 const service=createBookReportService({rpc:async()=>({error:{message:'Staff access required.'}})});
 await assert.rejects(service.queue(),error=>error.message==='Staff access required.');
 assert.match(reportError({code:'PGRST202'}),/not available yet/);
});
test('Follow-up validation runs before a backend call; version is sent for staff review',async()=>{
 const calls=[],service=createBookReportService({rpc:async(name,args)=>{calls.push({name,args});return {data:{}};}});
 await assert.rejects(service.followup('id','tiny','key'),/10/);assert.equal(calls.length,0);
 await service.review('id','under_review','Review started',3);assert.equal(calls[0].args.p_expected_version,3);
});
