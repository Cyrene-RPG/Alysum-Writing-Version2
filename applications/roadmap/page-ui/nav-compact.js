import { playUiSound } from "./ui-sounds.js?v=13";

const MOBILE = "(max-width: 720px)";

function navEl() {
    return document.querySelector("header nav");
}

function isMobile() {
    return window.matchMedia(MOBILE).matches;
}

export function syncNavMore() {
    const label = document.querySelector(".nav-more-label");
    if (label) label.textContent = "[ menu ]";
}

function setOpen(nav, open) {
    nav.classList.toggle("is-open", open);
    const more = nav.querySelector(".nav-more");
    if (more) more.setAttribute("aria-expanded", open ? "true" : "false");
}

export function fitNav() {
    const nav = navEl();
    if (!nav) return;
    const mobile = isMobile();
    const keepOpen = mobile && nav.classList.contains("is-open");
    nav.classList.toggle("is-compact", mobile);
    setOpen(nav, keepOpen);
}

export function bindNavCompact() {
    const nav = navEl();
    const more = nav?.querySelector(".nav-more");
    if (!nav || !more) return;
    syncNavMore();
    fitNav();

    more.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!isMobile()) return;
        const open = !nav.classList.contains("is-open");
        setOpen(nav, open);
        if (open) playUiSound("tab");
    });

    nav.querySelector(".nav-pages")?.addEventListener("click", (event) => {
        if (event.target.closest("button[data-page]")) setOpen(nav, false);
    });

    document.addEventListener("click", (event) => {
        if (!nav.classList.contains("is-open")) return;
        if (!nav.contains(event.target)) setOpen(nav, false);
    });

    window.addEventListener("keydown", (event) => {
        if (event.key === "Escape") setOpen(nav, false);
    });

    window.addEventListener("resize", fitNav);
}
