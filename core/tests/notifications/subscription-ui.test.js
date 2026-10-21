import test from "node:test";
import assert from "node:assert/strict";
import {mountBookSubscription} from "../../../applications/library/page-ui/subscription.js";
function page() {
    const elements = Object.fromEntries(["book-subscription","subscribe-book","subscription-status"].map(id=>[id,{
        hidden:id==="book-subscription",disabled:false,textContent:"",attributes:{},listeners:{},
        setAttribute(n,v){this.attributes[n]=v;},addEventListener(n,fn){this.listeners[n]=fn;},
    }]));
    globalThis.document={getElementById:id=>elements[id]};
    return elements;
}
function client() {
    let subscribed=false, fail=false;const calls=[],q={};
    for(const k of ["select","eq","maybeSingle"])q[k]=()=>q;
    q.then=(yes,no)=>Promise.resolve(fail?{error:{message:"Offline"}}:{data:subscribed?{book_id:"book"}:null}).then(yes,no);
    return {calls,from(){return q;},setFail(v){fail=v;},async rpc(name,payload){calls.push([name,payload]);if(fail)return {error:{message:"Offline"}};subscribed=payload.p_subscribed;return {data:subscribed};}};
}
const work={id:"book",ownerUserId:"author"},session={mode:"cloud",user:{id:"reader"}};
test("Subscribe confirms server success, supports unsubscribe and never flips on failed writes",async()=>{
    const el=page(),c=client();
    await mountBookSubscription({client:c,work,session});
    const button=el["subscribe-book"];
    assert.equal(el["book-subscription"].hidden,false);
    assert.equal(button.textContent,"Subscribe");
    await button.listeners.click();
    assert.equal(button.textContent,"Unsubscribe");
    assert.match(el["subscription-status"].textContent,/Subscribed/);
    c.setFail(true);await button.listeners.click();
    assert.equal(button.textContent,"Unsubscribe");
    assert.match(el["subscription-status"].textContent,/Offline/);
    c.setFail(false);await button.listeners.click();
    assert.equal(button.textContent,"Subscribe");
});
test("failed state reads offer a retry and do not issue a guessed subscription write",async()=>{
    const el=page(),c=client();c.setFail(true);
    await mountBookSubscription({client:c,work,session});
    assert.equal(el["subscribe-book"].textContent,"Retry subscription");
    c.setFail(false);await el["subscribe-book"].listeners.click();
    assert.equal(c.calls.length,0);
    assert.equal(el["subscribe-book"].textContent,"Subscribe");
});
test("owners and local sessions have no subscription control; inactive accounts cannot mutate",async()=>{
    for(const s of [{mode:"cloud",user:{id:"author"}},{mode:"local",user:{id:"reader"}}]) {
        const el=page();await mountBookSubscription({client:client(),work,session:s});
        assert.equal(el["book-subscription"].hidden,true);
    }
    const el=page(),c=client();let active=true;
    await mountBookSubscription({client:c,work,session,isActive:()=>active});
    active=false;await el["subscribe-book"].listeners.click();
    assert.equal(c.calls.length,0);
});
test("signed-out Subscribe sends the reader to login with a safe internal return path",async()=>{
    const el=page(),c=client();let destination;
    globalThis.window={location:{pathname:"/book",search:"?id=b%26c",assign(value){destination=value;}}};
    await mountBookSubscription({client:c,work,session:{mode:"none"}});
    await el["subscribe-book"].listeners.click();
    assert.equal(destination,"/login?next=%2Fbook%3Fid%3Db%2526c");
    assert.equal(c.calls.length,0);
});
