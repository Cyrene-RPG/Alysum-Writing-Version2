import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTER_REACTIONS, normalizeChapterReactions, chapterReactions } from '../../library/chapter-reactions.js';

test('reaction responses expose only supported counts and the current reader selection', () => {
    assert.equal(CHAPTER_REACTIONS.length, 6);
    assert.deepEqual(normalizeChapterReactions({ counts: { love: 5, laugh: -1, cry: '2', shock: Infinity, anger: 1.5, unknown: 900 }, mine: 'unknown', userId: 'private' }), {
        counts: { love: 5, laugh: 0, cry: 2, shock: 0, anger: 0, excited: 0 }, mine: null,
    });
});
test('read, set and remove calls never accept caller-supplied reader identity', async () => {
    const calls=[];const client={rpc:async(name,args)=>{calls.push({name,args});return {data:{counts:{love:3},mine:args.p_reaction},error:null};}};
    await chapterReactions(client,' book ','one');
    await chapterReactions(client,'book','one',{reaction:'love',userId:'someone-else'});
    await chapterReactions(client,'book','one',{reaction:null});
    assert.equal(calls[0].args.p_write,false);
    assert.deepEqual(calls[1],{name:'chapter_reactions',args:{p_book:'book',p_chapter:'one',p_write:true,p_reaction:'love'}});
    assert.equal(calls[2].args.p_write,true);assert.equal(calls[2].args.p_reaction,null);
    await assert.rejects(chapterReactions(client,'book','one',{reaction:'invalid'}),/Choose/);
    assert.equal(calls.length,3);
});
test('database and setup errors cannot turn into fake successful counts', async () => {
    await assert.rejects(chapterReactions({rpc:async()=>({error:{code:'PGRST202',message:'internal'}})},'book','one'),/temporarily unavailable/);
    await assert.rejects(chapterReactions({rpc:async()=>({error:{message:'Sign in'}})},'book','one',{reaction:'love'}),/Sign in/);
});
