/** Same profile picture the writer and reader welcome bars use. */
export function paintWelcomePfp(imageUrl, name) {
    const img = document.getElementById("welcomePfpImg");
    const initial = document.getElementById("welcomePfpInitial");
    const letter = String(name || "A").trim().charAt(0).toUpperCase() || "A";
    const url = String(imageUrl || "").trim();
    if (initial) initial.textContent = letter;
    if (img && url) {
        initial?.classList.add("is-hidden");
        img.onerror = () => {
            img.removeAttribute("src");
            img.hidden = true;
            initial?.classList.remove("is-hidden");
        };
        img.hidden = false;
        img.src = url;
        return;
    }
    if (img) {
        img.removeAttribute("src");
        img.hidden = true;
    }
    initial?.classList.remove("is-hidden");
}
