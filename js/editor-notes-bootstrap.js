/**
 * Editor page: mount floating notes after auth, without pulling nb-app into editor.html’s main module.
 * Uses the same firebase.js singleton as the editor.
 */
import { auth, db } from "../firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { mountEditorNotes } from "./nb-app.js?v=19";

function bookIdFromUrl() {
    return new URLSearchParams(window.location.search).get("book");
}

function tryMount(user) {
    if (!user) return;
    const bookId = bookIdFromUrl();
    if (!bookId) return;
    const panel = document.getElementById("nbPanel");
    const tree = document.getElementById("nbTree");
    if (!panel || !tree) return;
    if (panel.dataset.alysumNotesInit === "1") return;
    try {
        mountEditorNotes(bookId, { db, uid: user.uid });
    } catch (e) {
        console.error("Notes mount:", e);
    }
}

function scheduleMountAttempts(user) {
    if (!user) return;
    const delays = [0, 1, 10, 50, 150, 400];
    delays.forEach(ms => {
        setTimeout(() => tryMount(user), ms);
    });
}

onAuthStateChanged(auth, user => {
    if (!user) {
        document.getElementById("nbPanel")?.removeAttribute("data-alysum-notes-init");
        return;
    }
    scheduleMountAttempts(user);
});

if (auth.currentUser) {
    scheduleMountAttempts(auth.currentUser);
}
