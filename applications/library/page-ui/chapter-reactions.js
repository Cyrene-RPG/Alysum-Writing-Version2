import { CHAPTER_REACTIONS, chapterReactions } from '/core/library/chapter-reactions.js';

export function mountChapterReactions(root, { work, chapterId, supabase, session, onLayout }) {
    let state = null, busy = false;
    let revealSavedReaction = true;
    const heading = document.createElement('h2');
    heading.className = 'reader-end-kicker'; heading.textContent = 'How did this chapter make you feel?';
    const help = document.createElement('p'); help.className = 'reader-reaction-help';
    help.textContent = session?.user ? 'Choose a reaction. Tap it again to remove it.' : 'Sign in to react to this chapter.';
    const group = document.createElement('div'); group.className = 'reader-reaction-options';
    group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'Popular chapter reactions');
    const more = document.createElement('details'); more.className = 'reader-reaction-more';
    const summary = document.createElement('summary'); summary.textContent = 'More reactions · 18 choices';
    more.append(summary);
    more.addEventListener('toggle', () => onLayout?.());
    const categories = new Map();
    for (const item of CHAPTER_REACTIONS.filter(item => item.category)) {
        if (categories.has(item.category)) continue;
        const section = document.createElement('section');
        const label = document.createElement('h3'); label.className = 'reader-reaction-category'; label.textContent = item.category;
        const options = document.createElement('div'); options.className = 'reader-reaction-options';
        options.setAttribute('role', 'group'); options.setAttribute('aria-label', item.category);
        section.append(label, options); more.append(section); categories.set(item.category, options);
    }
    const status = document.createElement('p'); status.className = 'reader-reaction-status';
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'reader-reaction-retry';
    retry.textContent = 'Try again'; retry.hidden = true;
    const buttons = CHAPTER_REACTIONS.map(item => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'reader-reaction';
        const emoji = document.createElement('span'); emoji.className = 'reader-reaction-emoji'; emoji.textContent = item.emoji; emoji.setAttribute('aria-hidden', 'true');
        const count = document.createElement('span'); count.className = 'reader-reaction-count'; count.textContent = '—'; count.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span'); label.className = 'reader-reaction-label'; label.textContent = item.label;
        button.title = item.label; button.append(emoji, label, count); (categories.get(item.category) || group).append(button);
        button.addEventListener('click', () => void update(item.id));
        return { button, count, item };
    });
    const signIn = document.createElement('a');
    signIn.className = 'reader-reaction-signin'; signIn.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`; signIn.textContent = 'Sign in to react';
    root.replaceChildren(heading, help, group, more, status, retry);
    if (!session?.user) root.append(signIn);
    function paint() {
        for (const { button, count, item } of buttons) {
            const total = state?.counts[item.id];
            button.disabled = busy || !state || !session?.user;
            button.setAttribute('aria-pressed', String(state?.mine === item.id));
            button.setAttribute('aria-label', `${item.label}${total === undefined ? '' : ` · ${total.toLocaleString()} reaction${total === 1 ? '' : 's'}`}${state?.mine === item.id ? ' · Your reaction' : ''}`);
            count.textContent = total === undefined ? '—' : total.toLocaleString();
        }
        group.setAttribute('aria-busy', String(busy));
        for (const options of categories.values()) options.setAttribute('aria-busy', String(busy));
        const selected = CHAPTER_REACTIONS.find(item => item.id === state?.mine);
        if (session?.user) help.textContent = selected ? `Your reaction: ${selected.emoji} ${selected.label}. Tap it again to remove it.` : 'Choose a reaction. Tap it again to remove it.';
    }
    async function update(id) {
        if (busy || (id && (!state || !session?.user))) return;
        busy = true; retry.hidden = true; status.textContent = id ? 'Saving reaction…' : 'Loading reactions…'; paint();
        try {
            const next = await chapterReactions(supabase, work.id, chapterId, id ? { reaction: state.mine === id ? null : id } : {});
            if (!root.isConnected) return;
            state = next;
            if (revealSavedReaction) {
                if (CHAPTER_REACTIONS.find(item => item.id === state.mine)?.category) more.open = true;
                revealSavedReaction = false;
            }
            status.textContent = id ? (state.mine ? 'Your reaction is saved.' : 'Your reaction was removed.') : '';
        } catch (error) {
            if (!root.isConnected) return;
            // A failed save may have reached the server. Reload before another write.
            if (id) state = null;
            status.textContent = id ? 'Could not confirm your reaction. Refresh the counts before trying again.' : error.message;
            retry.hidden = false;
        } finally {
            busy = false;
            if (root.isConnected) { paint(); onLayout?.(); }
        }
    }
    retry.addEventListener('click', () => void update());
    paint(); void update();
}
