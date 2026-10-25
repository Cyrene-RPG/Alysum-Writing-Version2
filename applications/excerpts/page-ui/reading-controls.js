/* Reading-only UI controls, shared by current and legacy excerpt links.
 * Text remains accessible to assistive technology. These controls discourage
 * casual copying; they cannot make text delivered to a browser unextractable.
 */
(() => {
    const content = () => document.getElementById('section-content');
    const inExcerpt = target => Boolean(target?.closest?.('#section-content'));
    function selectsExcerpt() {
        const article = content();
        const selection = window.getSelection();
        if (!article || article.hidden || !selection || selection.isCollapsed) return false;
        for (let index = 0; index < selection.rangeCount; index++) {
            if (selection.getRangeAt(index).intersectsNode(article)) return true;
        }
        return false;
    }
    for (const type of ['copy', 'cut', 'paste', 'dragstart', 'contextmenu', 'selectstart']) {
        document.addEventListener(type, event => {
            if (inExcerpt(event.target) || (['copy', 'cut'].includes(type) && selectsExcerpt())) {
                event.preventDefault();
            }
        }, true);
    }
    document.addEventListener('keydown', event => {
        if (!(event.ctrlKey || event.metaKey) || event.altKey || !['a', 'c', 'x'].includes(event.key.toLowerCase())) return;
        const article = content();
        if (!article || article.hidden) return;
        // Preserve browser navigation, links, and any input outside the excerpt.
        const outsideControl = event.target?.closest?.('a,button,input,textarea,select,[contenteditable]');
        if (inExcerpt(event.target) || selectsExcerpt() || !outsideControl) event.preventDefault();
    }, true);
})();
