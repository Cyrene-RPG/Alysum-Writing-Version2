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
    const [{ supabase }, { peekWorkspaceProfile, loadWorkspaceProfile }, { signOutAndGoToHome }, { initAppearanceLoadoutMenu }, { openRoadmap }] = await Promise.all([
        import('/core/authentication/client.js'), import('/core/account/workspace-profile.js'),
        import('/core/authentication/logout.js'), import('/site-appearance/js-runtime/appearance-loadout-menu.js'),
        import('/core/authentication/open-roadmap.js'),
    ]);
    initAppearanceLoadoutMenu({ openRoadmap });
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) return;
    const session = { mode: 'cloud', user: data.session.user };
    function setAvatar(profile) {
        document.getElementById('welcomePfpInitial').textContent = (profile.name || 'A').slice(0, 1).toUpperCase();
        if (!profile.imageUrl) return;
        const image = document.getElementById('welcomePfpImg');
        image.addEventListener('error', () => { image.hidden = true; document.getElementById('welcomePfpInitial').hidden = false; }, { once: true });
        image.src = profile.imageUrl; image.hidden = false; document.getElementById('welcomePfpInitial').hidden = true;
    }
    const [{ createNotificationService }, { mountNotificationBell }] = await Promise.all([
        import('/core/notifications/service.js'), import('/site-appearance/js-runtime/notification-bell.js'),
    ]);
    mountNotificationBell({ service: createNotificationService(supabase) });
    setAvatar(peekWorkspaceProfile(session));
    void loadWorkspaceProfile(supabase, session).then(setAvatar).catch(() => {});
    const logout = document.getElementById('bible-logout'); logout.hidden = false;
    logout.addEventListener('click', async () => {
        if (!(await beforeLogout())) return;
        logout.disabled = true;
        const result = await signOutAndGoToHome();
        if (!result.ok) { logout.disabled = false; document.getElementById('bible-status').textContent = 'Could not log out. Please try again.'; }
    });
}
