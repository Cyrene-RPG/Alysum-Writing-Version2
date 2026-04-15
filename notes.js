// notes.js
import { db, auth } from "./firebase.js";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* =========================
   STATE
========================= */

let currentUser = null;
let unsubscribe = null;

/* =========================
   AUTH
========================= */

auth.onAuthStateChanged(user => {
  currentUser = user;
});

/* =========================
   HELPERS
========================= */

function requireUser() {
  if (!currentUser) {
    throw new Error("User not logged in");
  }
}

function notesRef() {
  return collection(db, "users", currentUser.uid, "notes");
}

function generateNote(title = "Untitled") {
  return {
    title,
    body: "",
    links: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

/* =========================
   CRUD
========================= */

// CREATE
export async function createNote(title = "Untitled") {
  requireUser();

  const note = generateNote(title);
  const docRef = await addDoc(notesRef(), note);

  return {
    id: docRef.id,
    ...note
  };
}

// UPDATE
export async function updateNote(noteId, updates) {
  requireUser();

  const ref = doc(db, "users", currentUser.uid, "notes", noteId);

  await updateDoc(ref, {
    ...updates,
    updatedAt: Date.now()
  });
}

// DELETE
export async function deleteNote(noteId) {
  requireUser();

  const ref = doc(db, "users", currentUser.uid, "notes", noteId);
  await deleteDoc(ref);
}

/* =========================
   REAL-TIME SYNC
========================= */

export function subscribeToNotes(callback) {
  requireUser();

  if (unsubscribe) unsubscribe();

  const q = query(notesRef(), orderBy("updatedAt", "desc"));

  unsubscribe = onSnapshot(q, (snapshot) => {
    const notes = [];

    snapshot.forEach(docSnap => {
      notes.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    callback(notes);
  });
}

/* =========================
   SEARCH
========================= */

export function searchNotes(notes, searchQuery) {
  const q = (searchQuery || "").toLowerCase();

  return notes.filter(note => {
    return (
      (note.title || "").toLowerCase().includes(q) ||
      (note.body || "").toLowerCase().includes(q)
    );
  });
}

/* =========================
   WIKI LINKS
========================= */

// Extract [[links]]
export function extractLinks(text = "") {
  const matches = text.match(/\[\[(.*?)\]\]/g) || [];

  return matches.map(link =>
    link.replace("[[", "").replace("]]", "")
  );
}

// Convert [[Note]] → clickable HTML
export function renderLinks(text = "") {
  return text.replace(/\[\[(.*?)\]\]/g, (match, name) => {
    return `<span class="wiki-link" data-link="${name}">${name}</span>`;
  });
}

/* =========================
   LINK NAVIGATION
========================= */

export function findNoteByTitle(notes, title) {
  return notes.find(
    n => (n.title || "").toLowerCase() === (title || "").toLowerCase()
  );
}

/* =========================
   CLEANUP (optional)
========================= */

export function unsubscribeNotes() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}
