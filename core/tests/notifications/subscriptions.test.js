import test from "node:test";
import assert from "node:assert/strict";
import {getBookSubscription,setBookSubscription} from "../../library/subscriptions.js";
import {resolveNotificationDestination,listNotifications,normalizeNotification} from "../../notifications/client.js";

function fixture(result) {
    const calls=[],q={};
    for(const method of ["select","eq","maybeSingle","order","limit"]) q[method]=(...args)=>{calls.push([method,...args]);return q;};
    q.then=(yes,no)=>Promise.resolve(result).then(yes,no);
    return {calls,from(t){calls.push(["from",t]);return q;},async rpc(name,args){calls.push(["rpc",name,args]);return result;}};
}
test("subscriptions read only the viewer's book state and signed-out readers make no request",async()=>{
    const c=fixture({data:{book_id:"book"}});
    assert.equal(await getBookSubscription(c,{bookId:"book",viewerId:"reader"}),true);
    assert.ok(c.calls.some(x=>JSON.stringify(x)===JSON.stringify(["eq","subscriber_id","reader"])));
    assert.ok(c.calls.some(x=>JSON.stringify(x)===JSON.stringify(["eq","book_id","book"])));
    const guest=fixture({});
    assert.equal(await getBookSubscription(guest,{bookId:"book"}),false);
    assert.equal(guest.calls.length,0);
});
test("subscription writes use authenticated RPCs and never accept an arbitrary recipient",async()=>{
    const c=fixture({data:true});
    assert.equal(await setBookSubscription(c,{bookId:"b&c",viewerId:"reader",subscribed:true}),true);
    assert.deepEqual(c.calls,[["rpc","set_book_subscription",{p_book_id:"b&c",p_subscribed:true}]]);
    await assert.rejects(setBookSubscription(c,{bookId:"b",subscribed:true}),/Sign in/);
    await assert.rejects(setBookSubscription(fixture({data:false}),{bookId:"b",viewerId:"reader",subscribed:true}),/confirm/);
    await assert.rejects(setBookSubscription(fixture({error:{code:"PGRST202"}}),{bookId:"b",viewerId:"reader",subscribed:true}),/not available/);
});
test("book and chapter alerts resolve only through the authenticated inbox entry and encode IDs",async()=>{
    const book=fixture({data:[{book_id:"b&c",chapter_id:null}]});
    assert.equal(await resolveNotificationDestination(book,{id:"17",kind:"new_book",bookId:"forged"}),"/book?id=b%26c");
    assert.deepEqual(book.calls,[["rpc","get_reading_notification_target",{p_notification_id:"17"}]]);
    assert.equal(await resolveNotificationDestination(fixture({data:[{book_id:"b",chapter_id:"ch&2"}]}),{id:"18",kind:"new_chapter"}),"/read?id=b&chapter=ch%262");
    await assert.rejects(resolveNotificationDestination(fixture({data:[]}),{id:"19",kind:"new_chapter"}),/no longer available/);
    const row=normalizeNotification({id:18,kind:"new_chapter",book_id:"b",chapter_id:"c"});
    assert.equal(row.bookId,"b");assert.equal(row.chapterId,"c");
});
test("new book and chapter category filters are available in the inbox",async()=>{
    for(const kind of ["new_book","new_chapter"]) {
        const c=fixture({data:[]});
        await listNotifications(c,{userId:"reader",kind});
        assert.ok(c.calls.some(x=>JSON.stringify(x)===JSON.stringify(["eq","kind",kind])));
    }
});
