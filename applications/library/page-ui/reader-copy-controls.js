/* Discourage casual copying of chapter text, without interfering with reader tools. */
(() => {
    const body = () => document.getElementById('chapterBody');
    const control = target => target?.closest?.('input,textarea,select,button,a,[contenteditable]');
    const chapterTarget = target => Boolean(target?.closest?.('#chapterBody'));
    function selectedChapter() {
        const chapter = body(), selection = window.getSelection();
        if (!chapter || !selection || selection.isCollapsed) return false;
        for (let index = 0; index < selection.rangeCount; index++) {
            if (selection.getRangeAt(index).intersectsNode(chapter)) return true;
        }
        return false;
    }
    for (const type of ['copy', 'cut', 'paste', 'dragstart', 'contextmenu', 'selectstart']) {
        document.addEventListener(type, event => {
            if (control(event.target)) return;
            if (chapterTarget(event.target) || (['copy', 'cut'].includes(type) && selectedChapter())) event.preventDefault();
        }, true);
    }
    document.addEventListener('keydown', event => {
        if (!(event.ctrlKey || event.metaKey) || event.altKey || !['a', 'c', 'x'].includes(event.key.toLowerCase())) return;
        if (!body() || control(event.target)) return;
        if (chapterTarget(event.target) || selectedChapter() || event.target === document.body || event.target === document.documentElement) event.preventDefault();
    }, true);
})();
