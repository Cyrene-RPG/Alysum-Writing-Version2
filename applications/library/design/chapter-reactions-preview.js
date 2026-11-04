import { mountChapterReactions } from '../page-ui/chapter-reactions.js?v=2';
const counts = { love: 24, laugh: 6, cry: 12, shock: 18, anger: 3, excited: 31 };
let mine = [];
const demoClient = { async rpc(_name, args) {
    if (args.p_write) {
        const id = args.p_reaction;
        const has = mine.includes(id);
        if (args.p_selected && !has) {
            mine = [...mine, id];
            counts[id] = (counts[id] || 0) + 1;
        } else if (!args.p_selected && has) {
            mine = mine.filter(item => item !== id);
            counts[id] = Math.max(0, (counts[id] || 0) - 1);
        }
    }
    return { data: { counts: { ...counts }, mine: [...mine] } };
} };
mountChapterReactions(document.getElementById('demoReactions'), {
    work: { id: 'demo-book' }, chapterId: 'demo-chapter', supabase: demoClient,
    session: new URLSearchParams(location.search).has('guest') ? null : { user: { id: 'demo-reader' } },
});
