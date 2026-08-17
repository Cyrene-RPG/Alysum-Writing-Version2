import { publicDisplayNameFromUserData } from "@alysum/account/profile-display.js";
import { pickWelcomeLine } from "/js/welcome-lines.js";

function fillWelcomeAvatar(imageUrl, name) {
    const img = document.getElementById("welcomePfpImg");
    const initial = document.getElementById("welcomePfpInitial");
    const letter = String(name || "A").trim().charAt(0).toUpperCase() || "A";
    const url = String(imageUrl || "").trim();

    if (img && url) {
        img.src = url;
        img.hidden = false;
        initial?.classList.add("is-hidden");
        return;
    }

    if (img) {
        img.removeAttribute("src");
        img.hidden = true;
    }
    if (initial) {
        initial.textContent = letter;
        initial.classList.remove("is-hidden");
    }
}

function closeWelcomePfpMenu() {
    const menu = document.getElementById("welcomePfpMenu");
    const btn = document.getElementById("welcomePfpBtn");
    const panel = document.getElementById("welcomePfpDropdown");
    if (!menu || !btn || !panel) return;
    menu.classList.remove("is-open");
    btn.setAttribute("aria-expanded", "false");
    panel.hidden = true;
}

function toggleWelcomePfpMenu() {
    const menu = document.getElementById("welcomePfpMenu");
    const btn = document.getElementById("welcomePfpBtn");
    const panel = document.getElementById("welcomePfpDropdown");
    if (!menu || !btn || !panel) return;
    const open = panel.hidden;
    menu.classList.toggle("is-open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    panel.hidden = !open;
}

export function initWelcomePfpMenu() {
    const menu = document.getElementById("welcomePfpMenu");
    const btn = document.getElementById("welcomePfpBtn");
    if (!menu || !btn || menu.dataset.ready === "1") return;
    menu.dataset.ready = "1";

    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleWelcomePfpMenu();
    });

    document.addEventListener("click", (e) => {
        if (!menu.contains(e.target)) closeWelcomePfpMenu();
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeWelcomePfpMenu();
    });

    menu.querySelectorAll("[data-close-pfp-menu]").forEach((el) => {
        el.addEventListener("click", () => closeWelcomePfpMenu());
    });
}

export function fillWelcomeBar(data = {}, options = {}) {
    const title = document.getElementById("welcomeTitle");
    const sub = document.getElementById("welcomeSubtitle");
    const name = publicDisplayNameFromUserData(data) || "writer";
    const refreshLine = options.refreshLine !== false;

    if (title) {
        title.replaceChildren();
        title.append("Welcome back, ");
        const nameEl = document.createElement("span");
        nameEl.className = "wd-name";
        nameEl.textContent = name;
        title.append(nameEl, ".");
    }

    if (sub) {
        if (refreshLine || !sub.textContent.trim()) {
            sub.textContent = pickWelcomeLine();
        }
        sub.classList.toggle("is-hidden", !sub.textContent.trim());
    }

    fillWelcomeAvatar(data.profileImageUrl ?? data.profile_image_url, name);
    initWelcomePfpMenu();
}
