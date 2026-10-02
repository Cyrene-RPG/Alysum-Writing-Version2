import { supabase } from "@alysum/authentication/client.js";
import { wireHomepageAuth } from "/js/homepage-auth-nav.js";
import { homeUrlForUserData } from "@alysum/account/mode.js";
import { startHomepageLibrary } from "/js/homepage-library.js";

await wireHomepageAuth(supabase);

supabase.auth.onAuthStateChange(() => {
    void wireHomepageAuth(supabase);
});

const { data: { session } } = await supabase.auth.getSession();
if (session?.user) {
    let profile = {};
    try {
        const { data } = await supabase
            .from("users")
            .select("account_type, username, display_name")
            .eq("id", session.user.id)
            .maybeSingle();
        if (data) {
            profile = {
                accountType: data.account_type,
                username: data.username,
                displayName: data.display_name,
            };
        }
    } catch (e) {
        console.warn(e);
    }
    window.location.replace(homeUrlForUserData(profile));
}

const backendAlert = document.getElementById("backendAlert");
const backendAlertClose = backendAlert?.querySelector(".alert-close");
if (localStorage.getItem("alysumBackendAlertDismissed") === "true") {
    backendAlert?.classList.add("hidden");
}
backendAlertClose?.addEventListener("click", () => {
    backendAlert?.classList.add("hidden");
    localStorage.setItem("alysumBackendAlertDismissed", "true");
});

// Hero background: stop the drifting rows while they are scrolled out of view
const proseFrame = document.getElementById("proseFrame");
if (proseFrame && "IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
        proseFrame.classList.toggle("is-offscreen", !entry.isIntersecting);
    }).observe(proseFrame);
}

// Studio card: live word count for the "Chapter one" sample page (nothing saves)
const firstLine = document.getElementById("firstLine");
const wordCount = document.getElementById("firstLineWords");
firstLine?.addEventListener("input", () => {
    const words = (firstLine.innerText.match(/[\p{L}\p{N}’'-]+/gu) || []).length;
    if (wordCount) wordCount.textContent = words.toLocaleString("en-US");
});

// "New!" slider
const slider = document.getElementById("featured");
if (slider) {
    const slides = [...slider.querySelectorAll(".slide")];
    const total = Math.max(1, ...slides.map((slide) => Number(slide.dataset.i) + 1));
    let current = 0;
    const show = (index) => {
        current = (index + total) % total;
        slides.forEach((slide) => {
            const on = Number(slide.dataset.i) === current;
            slide.hidden = !on;
            slide.classList.toggle("fade", on);
        });
        const counter = document.getElementById("slideIndex");
        if (counter) counter.textContent = String(current + 1);
    };
    document.getElementById("slidePrev")?.addEventListener("click", () => show(current - 1));
    document.getElementById("slideNext")?.addEventListener("click", () => show(current + 1));
}

if (document.getElementById("library")) {
    startHomepageLibrary(supabase);
}
