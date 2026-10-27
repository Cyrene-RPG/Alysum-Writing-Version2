import { getTabSessionContext } from '/core/authentication/tab-session.js';

try {
    getTabSessionContext();
    await import('./login.js');
} catch (error) {
    const message = document.getElementById('error-msg');
    if (message) {
        message.textContent = error.message || 'Could not start sign-in. Refresh and try again.';
        message.classList.add('visible');
    }
    for (const id of ['login-btn', 'google-btn', 'discord-btn']) {
        const button = document.getElementById(id);
        if (button) button.disabled = true;
    }
}
