import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTER_REACTIONS, normalizeChapterReactions, chapterReactions } from '../../library/chapter-reactions.js';

test('reaction responses expose only supported counts and the current reader selections', () => {
    assert.equal(CHAPTER_REACTIONS.length, 24);
    assert.equal(new Set(CHAPTER_REACTIONS.map(item => item.id)).size, 24);
    assert.deepEqual(normalizeChapterReactions({ counts: { love: 5, laugh: -1, cry: '2', shock: Infinity, anger: 1.5, unknown: 900 }, mine: 'unknown', userId: 'private' }), {
        counts: Object.fromEntries(CHAPTER_REACTIONS.map(({id}) => [id, id === 'love' ? 5 : id === 'cry' ? 2 : 0])), mine: [],
    });
    assert.deepEqual(normalizeChapterReactions({ counts: { love: 1 }, mine: ['love', 'unknown', 'laugh', 'love'] }).mine, ['love', 'laugh']);
    assert.deepEqual(normalizeChapterReactions({ counts: { cry: 1 }, mine: 'cry' }).mine, ['cry']);
});
test('read, set and remove calls never accept caller-supplied reader identity', async () => {
    const calls=[];const client={rpc:async(name,args)=>{calls.push({name,args});return {data:{counts:{love:3},mine:args.p_selected?[args.p_reaction]:[]},error:null};}};
    await chapterReactions(client,' book ','one');
    await chapterReactions(client,'book','one',{reaction:'love',selected:true,userId:'someone-else'});
    await chapterReactions(client,'book','one',{reaction:'love',selected:false});
    assert.equal(calls[0].args.p_write,false);
    assert.deepEqual(calls[1],{name:'chapter_reactions',args:{p_book:'book',p_chapter:'one',p_write:true,p_reaction:'love',p_selected:true}});
    assert.equal(calls[2].args.p_write,true);assert.equal(calls[2].args.p_reaction,'love');assert.equal(calls[2].args.p_selected,false);
    await assert.rejects(chapterReactions(client,'book','one',{reaction:'invalid',selected:true}),/Choose/);
    await assert.rejects(chapterReactions(client,'book','one',{reaction:'love'}),/Choose/);
    assert.equal(calls.length,3);
});
test('database and setup errors cannot turn into fake successful counts', async () => {
    await assert.rejects(chapterReactions({rpc:async()=>({error:{code:'PGRST202',message:'internal'}})},'book','one'),/temporarily unavailable/);
    await assert.rejects(chapterReactions({rpc:async()=>({error:{message:'Sign in'}})},'book','one',{reaction:'love',selected:true}),/Sign in/);
});

test('every new choice is accepted and a saved expanded reaction survives normalization', async () => {
    for (const item of CHAPTER_REACTIONS.filter(item => item.category)) {
        const result = await chapterReactions({rpc: async (_name,args) => ({data:{counts:{[args.p_reaction]:3},mine:[args.p_reaction]}})}, 'book', 'one', {reaction:item.id,selected:true});
        assert.deepEqual(result.mine,[item.id]);assert.equal(result.counts[item.id],3);
    }
});
