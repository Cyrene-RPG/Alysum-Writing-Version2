import { getBookHiatus, setBookHiatus, hiatusNotice } from '../../../core/library/hiatus.js';

export async function mountBookHiatus({ client, work, isActive = () => true }) {
    const panel = document.getElementById('bookHiatus');
    const message = document.getElementById('bookHiatusMessage');
    const manage = document.getElementById('bookHiatusToggle');
    const feedback = document.getElementById('bookHiatusFeedback');
    const cta = document.getElementById('readCta');
    const dialog = document.getElementById('bookHiatusDialog');
    const cancel = document.getElementById('bookHiatusCancel');
    const proceed = document.getElementById('bookHiatusContinue');
    let status;
    function paint() {
        panel.hidden = !status.isOnHiatus && !status.canManage;
        message.textContent = status.isOnHiatus ? hiatusNotice(status)
            : status.isComplete ? 'This book is complete.' : 'This book is in progress. Taking a break? You can put it on hiatus.';
        manage.hidden = !status.canManage || status.isComplete;
        manage.textContent = status.isOnHiatus ? 'Resume book' : 'Put book on hiatus';
    }
    manage.addEventListener('click', async () => {
        manage.disabled = true;
        feedback.textContent = 'Saving…';
        try {
            status = await setBookHiatus(client, work.id, !status.isOnHiatus);
            if (!isActive()) return;
            paint();
            feedback.textContent = status.isOnHiatus ? 'Your book is now on hiatus.' : 'Your book is in progress again.';
        } catch (error) { if (isActive()) feedback.textContent = error.message; }
        finally { manage.disabled = false; }
    });
    cancel.addEventListener('click', () => dialog.close());
    // Check again when reading starts so a reader sees changes made after opening the page.
    cta.addEventListener('click', async event => {
        event.preventDefault();
        if (cta.getAttribute('aria-busy') === 'true') return;
        cta.setAttribute('aria-busy', 'true');
        feedback.textContent = '';
        try {
            status = await getBookHiatus(client, work.id);
            if (!isActive()) return;
            paint();
            if (!status.isOnHiatus) { window.location.assign(cta.href); return; }
            document.getElementById('bookHiatusDialogMessage').textContent = hiatusNotice(status);
            proceed.href = cta.href;
            dialog.showModal();
            cancel.focus();
        } catch (error) { if (isActive()) feedback.textContent = error.message; }
        finally { cta.removeAttribute('aria-busy'); }
    });
    try {
        status = await getBookHiatus(client, work.id);
        if (isActive()) paint();
    } catch (error) { if (isActive()) feedback.textContent = error.message; }
}
