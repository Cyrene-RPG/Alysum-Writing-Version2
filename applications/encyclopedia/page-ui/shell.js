/** Studio account chrome for the new Bible; preview never loads account services. */
let isMounted = false;
export async function mountBibleShell({ isPreview = false, beforeLogout = async () => true } = {}) {
    if (isMounted) return;
    isMounted = true;
    const trigger = document.getElementById('welcomePfpBtn');
    const dropdown = document.getElementById('welcomePfpDropdown');
    const menu = document.getElementById('welcomePfpMenu');
    function closeMenu() {
        dropdown.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        menu.classList.remove('is-open');
    }
    trigger.addEventListener('click', () => {
        const isOpen = dropdown.hidden;
        dropdown.hidden = !isOpen;
        trigger.setAttribute('aria-expanded', String(isOpen));
        menu.classList.toggle('is-open', isOpen);
    });
    document.addEventListener('click', event => { if (!menu.contains(event.target)) closeMenu(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !dropdown.hidden) { closeMenu(); trigger.focus(); } });
    if (isPreview) {
        document.getElementById('welcomeSubtitle').textContent = 'Preview · Sample world only. Your changes reset on reload.';
        return;
    }
    // Shared appearance behavior comes from site-appearance, never another application.
    const [{ supabase }, { peekWorkspaceProfile, loadWorkspaceProfile }, { signOutAndGoToHome }] = await Promise.all([
        import('/core/authentication/client.js'), import('/core/account/workspace-profile.js'),
        import('/core/authentication/logout.js'),
    ]);
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) return;
    const session = { mode: 'cloud', user: data.session.user };
    function setAvatar(profile) {
        const initial = document.getElementById('welcomePfpInitial');
        const image = document.getElementById('welcomePfpImg');
        initial.textContent = (profile.name || 'A').trim().slice(0, 1).toUpperCase() || 'A';
        initial.hidden = false;
        const url = String(profile.imageUrl || '').trim();
        initial.classList.toggle('is-hidden', Boolean(url));
        image.hidden = !url; image.style.display = url ? '' : 'none';
        image.onerror = () => { image.removeAttribute('src'); image.hidden = true; image.style.display = 'none'; initial.classList.remove('is-hidden'); };
        if (url) image.src = url;
        else image.removeAttribute('src');
    }
    setAvatar(peekWorkspaceProfile(session));
    void loadWorkspaceProfile(supabase, session).then(setAvatar).catch(() => {});
    const logout = document.getElementById('bible-logout'); logout.hidden = false;
    logout.addEventListener('click', async () => {
        if (!(await beforeLogout())) return;
        logout.disabled = true;
        const result = await signOutAndGoToHome();
        if (!result.ok) { logout.disabled = false; document.getElementById('bible-status').textContent = 'Could not log out. Please try again.'; }
    });
    // Optional header tools must not prevent account identity or logout from loading.
    void Promise.all([
        import('/site-appearance/js-runtime/appearance-loadout-menu.js'), import('/core/authentication/open-roadmap.js'),
    ]).then(([{ initAppearanceLoadoutMenu }, { openRoadmap }]) => initAppearanceLoadoutMenu({ openRoadmap }))
        .catch(error => console.warn('Appearance menu could not load.', error));
    void Promise.all([
        import('/core/notifications/service.js'), import('/site-appearance/js-runtime/notification-bell.js'),
    ]).then(([{ createNotificationService }, { mountNotificationBell }]) => mountNotificationBell({ service: createNotificationService(supabase) }))
        .catch(error => console.warn('Notification bell could not load.', error));
}
