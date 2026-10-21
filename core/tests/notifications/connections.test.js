import test from "node:test";
import assert from "node:assert/strict";
import {getConnectionsSummary,listConnections,removeConnection} from "../../account/connections.js";
function fixture(result){const calls=[];return {calls,async rpc(name,payload){calls.push({name,payload});return result;}};}
test("connection lists use authenticated RPCs without accepting another account ID",async()=>{
    const c=fixture({data:[{connection_id:"author",display_name:"Writer",username:"writer",author_id:"author",available:true}]});
    const rows=await listConnections(c,{kind:"following",afterId:"cursor",userId:"other"});
    assert.equal(rows[0].displayName,"Writer");assert.equal(rows[0].authorId,"author");
    assert.deepEqual(c.calls,[{name:"list_my_connections",payload:{p_kind:"following",p_after_id:"cursor",p_limit:50}}]);
    await assert.rejects(listConnections(c,{kind:"all-accounts"}),/Choose/);
    assert.deepEqual(await getConnectionsSummary(fixture({data:{following:2,followers:3,subscriptions:4}})),{following:2,followers:3,subscriptions:4});
});
test("removals require the current account and cannot remove followers",async()=>{
    const c=fixture({data:true});
    await removeConnection(c,{kind:"following",id:"author",userId:"me"});
    assert.deepEqual(c.calls,[{name:"remove_my_connection",payload:{p_kind:"following",p_target_id:"author",p_expected_user_id:"me"}}]);
    await assert.rejects(removeConnection(c,{kind:"followers",id:"reader",userId:"me"}),/own account/);
    await assert.rejects(removeConnection(fixture({data:false}),{kind:"subscriptions",id:"book",userId:"me"}),/confirm/);
});
test("missing migrations and permission failures are explicit errors, never empty success",async()=>{
    await assert.rejects(listConnections(fixture({error:{code:"PGRST202"}})),/not available/);
    await assert.rejects(getConnectionsSummary(fixture({error:{message:"permission denied"}})),/permission denied/);
});
