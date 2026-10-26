import { mountChapterReactions } from '../page-ui/chapter-reactions.js';
const counts = { love: 24, laugh: 6, cry: 12, shock: 18, anger: 3, excited: 31 };
let mine = null;
const demoClient = { async rpc(_name, args) {
    if (args.p_write) {
        if (mine) counts[mine]--;
        mine = args.p_reaction;
        if (mine) counts[mine]++;
    }
    return { data: { counts: { ...counts }, mine } };
} };
mountChapterReactions(document.getElementById('demoReactions'), {
    work: { id: 'demo-book' }, chapterId: 'demo-chapter', supabase: demoClient,
    session: new URLSearchParams(location.search).has('guest') ? null : { user: { id: 'demo-reader' } },
});
