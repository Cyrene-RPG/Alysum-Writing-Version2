/**
 * Editor page only: mount the floating notes vault as soon as auth + bookId are known.
 * Kept separate from editor.html’s main module so notes still bind if that bundle is slow or errors early.
 */
import { auth, db } from "../firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { mountEditorNotes } from "./nb-app.js?v=15";

onAuthStateChanged(auth, user => {
    if (!user) {
        window.__alysumEditorNotesMountKey = "";
        document.getElementById("nbPanel")?.removeAttribute("data-alysum-notes-init");
        return;
    }
    const bookId = new URLSearchParams(window.location.search).get("book");
    if (!bookId) return;
    const key = `${user.uid}:${bookId}`;
    if (window.__alysumEditorNotesMountKey === key) return;
    window.__alysumEditorNotesMountKey = key;
    try {
        mountEditorNotes(bookId, { db, uid: user.uid });
    } catch (err) {
        console.error("Notes mount:", err);
        window.__alysumEditorNotesMountKey = "";
    }
});
