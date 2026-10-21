import test from "node:test";
import assert from "node:assert/strict";
import {createNotificationService} from "../../notifications/service.js";

function fixture() {
    // Read entries newer than the unread one must not push it out of the bell.
    const rows=Array.from({length:13},(_,i)=>({
        id:i+1,recipient_id:"reader",kind:"follower",title:"Notification "+(i+1),
        message:"Message",created_at:"2026-10-20T12:00:00Z",
        read_at:i===0 ? null : "2026-10-20T13:00:00Z",
    }));
    const client={
        auth:{onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}};},async getSession(){return {data:{session:{user:{id:"reader"}}}};}},
        channel(){return {on(){return this;},subscribe(){return this;}};},async removeChannel(){},
        async rpc(name,args) {
            if(name==="get_inbox_summary")return {data:{unreadCount:rows.filter(x=>!x.read_at).length,latestId:"13"}};
            if(name==="set_inbox_notification_read") {
                const row=rows.find(x=>String(x.id)===args.p_notification_id);
                row.read_at=args.p_is_read ? "2026-10-20T14:00:00Z" : null;return {data:true};
            }
            if(name==="mark_inbox_notifications_read") {
                let count=0;for(const row of rows)if(row.id<=Number(args.p_through_id) && !row.read_at){row.read_at="2026-10-20T14:00:00Z";count++;}
                return {data:count};
            }
            throw Error("Unexpected RPC "+name);
        },
        from(table) {
            let recipient,unreadOnly=false,limit=200;
            const q={
                select(){return q;},eq(key,value){if(key==="recipient_id")recipient=value;return q;},
                is(key,value){assert.equal(key,"read_at");assert.equal(value,null);unreadOnly=true;return q;},
                order(){return q;},limit(value){limit=value;return q;},maybeSingle(){return q;},
                then(yes,no){return Promise.resolve(table==="notification_preferences" ? {data:null} : {
                    data:rows.filter(x=>x.recipient_id===recipient && (!unreadOnly || !x.read_at))
                        .toSorted((a,b)=>b.id-a.id).slice(0,limit),
                }).then(yes,no);},
            };return q;
        },
    };
    return {client,rows};
}
test("bell shows unread entries, read actions clear it, and full inbox retains every entry",async()=>{
    const f=fixture(),service=createNotificationService(f.client,{isEnabled:()=>true});
    const stop=service.subscribe(()=>{});
    try {
        await new Promise(r=>setTimeout(r,10));
        assert.deepEqual(service.getState().recent.map(x=>x.id),["1"]);
        assert.equal(service.getState().unreadCount,1);
        assert.equal((await service.list({})).length,13);
        await service.setRead("1",true);
        assert.deepEqual(service.getState().recent,[]);
        assert.equal(service.getState().unreadCount,0);
        const inbox=await service.list({});
        assert.equal(inbox.length,13);
        assert.ok(inbox.find(x=>x.id==="1").readAt);
        await service.setRead("1",false);
        assert.deepEqual(service.getState().recent.map(x=>x.id),["1"]);
        await service.markAllRead("13");
        assert.deepEqual(service.getState().recent,[]);
        assert.equal((await service.list({})).length,13);
        assert.equal(f.rows.length,13);
    } finally {stop();}
});
