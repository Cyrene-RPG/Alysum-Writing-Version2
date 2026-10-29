import test from 'node:test';import assert from 'node:assert/strict';
import {UPDATE_REACTIONS,normalizeUpdateReactions,getUpdateReactions,setUpdateReaction} from '../../publishing/update-reactions.js';
test('six requested emoji and multiple independent selections normalize safely',()=>{
 assert.deepEqual(UPDATE_REACTIONS.map(r=>r.emoji),['❤️','💜','😂','🎉','👍','😮']);
 const state=normalizeUpdateReactions({counts:{heart:2,private:100},mine:['heart','purple','heart','unknown']});
 assert.equal(state.counts.heart,2);assert.equal(state.counts.purple,0);assert.deepEqual(state.mine,['heart','purple']);assert.equal('private' in state.counts,false);
 for(const value of [null,{}, {counts:{heart:-1},mine:[]},{counts:{heart:'1'},mine:[]}])assert.throws(()=>normalizeUpdateReactions(value),/confirm/);
});
test('reads batch public counts and writes send explicit desired state with an account guard',async()=>{
 const calls=[],client={rpc:async(name,args)=>{calls.push({name,args});return {data:name.startsWith('get_')?{post:{counts:{heart:1},mine:['heart']}}:{counts:{heart:1,purple:1},mine:['heart','purple']}};}};
 const states=await getUpdateReactions(client,['post','post'],'member');assert.equal(states.get('post').counts.heart,1);assert.deepEqual(calls[0].args.p_posts,['post']);
 await setUpdateReaction(client,'post','purple',true,'member');assert.deepEqual(calls[1],{name:'set_announcement_reaction',args:{p_post:'post',p_reaction:'purple',p_selected:true,p_expected_user:'member'}});
 await setUpdateReaction(client,'post','heart',false,'member');assert.equal(calls[2].args.p_selected,false);
 await assert.rejects(setUpdateReaction(client,'post','heart',true,null),/Sign in/);await assert.rejects(setUpdateReaction(client,'post','invalid',true,'member'),/Choose/);assert.equal(calls.length,3);
});
test('missing schema, failed writes and malformed success never invent saved reactions',async()=>{
 await assert.rejects(getUpdateReactions({rpc:async()=>({error:{code:'PGRST202'}})},['post']),/temporarily unavailable/);
 await assert.rejects(setUpdateReaction({rpc:async()=>({error:{message:'Permission denied'}})},'post','heart',true,'me'),/Permission denied/);
 await assert.rejects(setUpdateReaction({rpc:async()=>({data:{saved:true}})},'post','heart',true,'me'),/confirm/);
});
