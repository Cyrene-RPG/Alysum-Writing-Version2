export function bindPublishingLayout(doc, readForm) {
    function paint() {
        const form = readForm();
        const summaries = {
            storySection: `${form.title || 'Untitled'} · ${form.complete ? 'Complete' : 'Work in progress'}`,
            tagsSection: `${form.workType === 'fanfiction' ? 'Fan fiction' : 'Original work'} · ${form.genres.length} genres · ${form.rating || 'Choose a rating'}`,
            accessSection: `${form.chapterIds.length} chapters selected · ${form.lockedChapterIds.length ? 'Free and locked chapters' : 'Free access'}`,
        };
        for (const [id, text] of Object.entries(summaries)) {
            const label = doc.querySelector(`[data-section-summary="${id}"]`); if (label) label.textContent = text;
        }
    }
    function revealError() {
        const error = doc.getElementById('postError'); if (!error || error.hidden || !error.textContent.trim()) return;
        // Validation must never leave the field that needs attention collapsed.
        doc.querySelectorAll('.pub-section, #warningPicker details').forEach(section => { section.open = true; });
        error.focus({ preventScroll: true }); error.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    }
    doc.querySelector('.pub-page').addEventListener('input', paint);
    doc.querySelector('.pub-page').addEventListener('change', paint);
    const observer = new MutationObserver(revealError);
    observer.observe(doc.getElementById('postError'), { childList: true, attributes: true, characterData: true, subtree: true });
    paint();
    return { paint };
}
