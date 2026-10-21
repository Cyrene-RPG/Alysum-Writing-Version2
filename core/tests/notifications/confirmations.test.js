import test from "node:test";
import assert from "node:assert/strict";
import {listNotifications,resolveNotificationDestination} from "../../notifications/client.js";
function fixture(result={data:[]}) {
    const calls=[],q={};
    for(const method of ["select","eq","order","limit"])q[method]=(...args)=>{calls.push([method,...args]);return q;};
    q.then=(yes,no)=>Promise.resolve(result).then(yes,no);
    return {calls,from(t){calls.push(["from",t]);return q;},async rpc(name,payload){calls.push(["rpc",name,payload]);return result;}};
}
test("follow confirmations are readable receipts without invented destinations",async()=>{
    const c=fixture();
    assert.equal(await resolveNotificationDestination(c,{kind:"follow_confirmation"}),null);
    assert.equal(c.calls.length,0);
    await listNotifications(c,{userId:"reader",kind:"follow_confirmation"});
    assert.ok(c.calls.some(x=>JSON.stringify(x)===JSON.stringify(["eq","kind","follow_confirmation"])));
});
test("subscription confirmations use the recipient-scoped resolver and open the book",async()=>{
    const c=fixture({data:[{book_id:"book&1",chapter_id:null}]});
    assert.equal(await resolveNotificationDestination(c,{id:"21",kind:"subscription_confirmation"}),"/book?id=book%261");
    assert.deepEqual(c.calls,[["rpc","get_reading_notification_target",{p_notification_id:"21"}]]);
    await assert.rejects(resolveNotificationDestination(fixture(),{id:"22",kind:"subscription_confirmation"}),/no longer available/);
    const list=fixture();await listNotifications(list,{userId:"reader",kind:"subscription_confirmation"});
    assert.ok(list.calls.some(x=>JSON.stringify(x)===JSON.stringify(["eq","kind","subscription_confirmation"])));
});
