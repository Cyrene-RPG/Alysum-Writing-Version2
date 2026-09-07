export function placeMorePanel(btn, panel) {
    if (!btn || !panel) return;
    const toolbar = btn.closest(".writer-toolbar") || btn;
    const bar = toolbar.getBoundingClientRect();
    const width = panel.offsetWidth || 340;
    const left = Math.max(8, Math.min(
        bar.left + (bar.width - width) / 2,
        window.innerWidth - width - 8
    ));
    panel.style.top = `${Math.round(btn.getBoundingClientRect().bottom + 4)}px`;
    panel.style.left = `${Math.round(left)}px`;
    panel.style.right = "auto";
}

export function bindToolbarOverflow(mount) {
    const cluster = mount.querySelector(".writer-toolbar-cluster");
    const more = mount.querySelector(".writer-toolbar-more");
    const panel = more?.querySelector(":scope > .writer-tool-dropdown");
    const wordcount = mount.querySelector(".writer-wordcount");
    if (!cluster || !more || !panel) return;

    function gapOf(el) {
        const gap = parseFloat(getComputedStyle(el).gap);
        return Number.isFinite(gap) ? gap : 0;
    }

    function itemsWidth(els, gap) {
        if (!els.length) return 0;
        return els.reduce((sum, el) => sum + el.offsetWidth, 0) + gap * (els.length - 1);
    }

    function layout() {
        while (panel.firstChild) cluster.appendChild(panel.firstChild);
        more.hidden = true;
        const all = [...cluster.children];
        const gap = gapOf(cluster);
        if (itemsWidth(all, gap) <= cluster.clientWidth + 0.5) return;

        more.hidden = false;
        let used = 0;
        let split = 0;
        const room = cluster.clientWidth;
        for (let i = 0; i < all.length; i++) {
            const next = used + all[i].offsetWidth + (i ? gap : 0);
            if (next > room + 0.5) break;
            used = next;
            split = i + 1;
        }
        for (let i = split; i < all.length; i++) panel.appendChild(all[i]);
        if (!panel.childElementCount) more.hidden = true;
        if (!panel.hidden) placeMorePanel(more.querySelector("[data-menu-toggle]"), panel);
    }

    let ticking = false;
    function requestLayout() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            ticking = false;
            layout();
        });
    }

    const observer = new ResizeObserver(requestLayout);
    observer.observe(mount);
    observer.observe(cluster);
    if (wordcount) observer.observe(wordcount);
    requestLayout();
}
