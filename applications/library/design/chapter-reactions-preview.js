import { mountChapterReactions } from '../page-ui/chapter-reactions.js?v=2';
const counts = { love: 24, laugh: 6, cry: 12, shock: 18, anger: 3, excited: 31 };
let mine = null;
const demoClient = { async rpc(_name, args) {
    if (args.p_write) {
        if (mine) counts[mine] = Math.max(0, (counts[mine] || 0) - 1);
        mine = args.p_reaction;
        if (mine) counts[mine] = (counts[mine] || 0) + 1;
    }
    return { data: { counts: { ...counts }, mine } };
} };
mountChapterReactions(document.getElementById('demoReactions'), {
    work: { id: 'demo-book' }, chapterId: 'demo-chapter', supabase: demoClient,
    session: new URLSearchParams(location.search).has('guest') ? null : { user: { id: 'demo-reader' } },
});
