export const UPDATE_REACTIONS = Object.freeze([
    {id:'heart',emoji:'❤️',label:'Love'},
    {id:'purple',emoji:'💜',label:'Purple heart'},
    {id:'laugh',emoji:'😂',label:'Laugh'},
    {id:'celebrate',emoji:'🎉',label:'Celebrate'},
    {id:'like',emoji:'👍',label:'Like'},
    {id:'surprise',emoji:'😮',label:'Surprised'},
]);
const ids = new Set(UPDATE_REACTIONS.map(r => r.id));
export function normalizeUpdateReactions(value) {
    if (!value || !value.counts || typeof value.counts !== 'object' || Array.isArray(value.counts) || !Array.isArray(value.mine)) throw Error('Could not confirm reactions. Refresh and try again.');
    const counts = {};
    for (const id of ids) {
        const n = value.counts[id] ?? 0;
        if (!Number.isSafeInteger(n) || n < 0) throw Error('Could not confirm reaction counts.');
        counts[id] = n;
    }
    return {counts,mine:[...new Set(value.mine.filter(id => ids.has(id)))]};
}
async function call(client,name,args) {
    const {data,error} = await client.rpc(name,args);
    if (error) throw Error(['PGRST202','42883','42P01'].includes(error.code)
        ? 'Reactions are temporarily unavailable.' : error.message || 'Could not load reactions.');
    return data;
}
export async function getUpdateReactions(client,postIds,userId=null) {
    const posts = [...new Set(postIds)];
    if (!posts.length || posts.length > 20) throw Error('Choose up to twenty updates.');
    const data = await call(client,'get_announcement_reactions',{p_posts:posts,p_expected_user:userId});
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('Could not confirm reactions.');
    return new Map(posts.filter(id => Object.hasOwn(data,id)).map(id => [id,normalizeUpdateReactions(data[id])]));
}
export async function setUpdateReaction(client,postId,reaction,selected,userId) {
    if (!userId) throw Error('Sign in to react to updates.');
    if (!ids.has(reaction) || typeof selected !== 'boolean') throw Error('Choose an update reaction.');
    return normalizeUpdateReactions(await call(client,'set_announcement_reaction',{
        p_post:postId,p_reaction:reaction,p_selected:selected,p_expected_user:userId,
    }));
}
