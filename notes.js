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

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

/* =========================
   STATE
========================= */

let currentUser = null;
let unsubscribe = null;
let authReadyResolver = null;

const authReadyPromise = new Promise((resolve) => {
  authReadyResolver = resolve;
});

/* =========================
   AUTH
========================= */

onAuthStateChanged(auth, (user) => {
  currentUser = user || null;
  if (authReadyResolver) {
    authReadyResolver();
    authReadyResolver = null;
  }
});

export async function waitForAuthReady() {
  await authReadyPromise;
  return currentUser;
}

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
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

/* =========================
   CRUD
========================= */

export async function createNote(title = "Untitled") {
  requireUser();

  const note = generateNote(title);
  const docRef = await addDoc(notesRef(), note);

  return {
    id: docRef.id,
    ...note
  };
}

export async function updateNote(noteId, updates) {
  requireUser();

  const ref = doc(db, "users", currentUser.uid, "notes", noteId);

  await updateDoc(ref, {
    ...updates,
    updatedAt: Date.now()
  });
}

export async function deleteNote(noteId) {
  requireUser();

  const ref = doc(db, "users", currentUser.uid, "notes", noteId);
  await deleteDoc(ref);
}

/* =========================
   REAL-TIME SYNC
========================= */

export async function subscribeToNotes(callback) {
  await waitForAuthReady();
  requireUser();

  if (unsubscribe) unsubscribe();

  const q = query(notesRef(), orderBy("updatedAt", "desc"));

  unsubscribe = onSnapshot(q, (snapshot) => {
    const notes = [];

    snapshot.forEach((docSnap) => {
      notes.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    callback(notes);
  });

  return unsubscribe;
}

/* =========================
   SEARCH
========================= */

export function searchNotes(notes, searchQuery) {
  const q = (searchQuery || "").toLowerCase();

  return notes.filter((note) => {
    return (
      (note.title || "").toLowerCase().includes(q) ||
      (note.body || "").toLowerCase().includes(q)
    );
  });
}

/* =========================
   WIKI LINKS
========================= */

export function extractLinks(text = "") {
  const matches = text.match(/\[\[(.*?)\]\]/g) || [];

  return matches
    .map((link) => link.replace("[[", "").replace("]]", "").trim())
    .filter(Boolean);
}

function escapeHtml(text = "") {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function renderLinks(text = "") {
  const escaped = escapeHtml(text).replace(/\n/g, "<br>");

  return escaped.replace(/\[\[(.*?)\]\]/g, (match, name) => {
    const clean = name.trim();
    return `<span class="wiki-link" data-link="${clean}">[[${clean}]]</span>`;
  });
}

/* =========================
   LINK NAVIGATION
========================= */

export function findNoteByTitle(notes, title) {
  return notes.find(
    (n) => (n.title || "").toLowerCase() === (title || "").toLowerCase()
  );
}

/* =========================
   CLEANUP
========================= */

export function unsubscribeNotes() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}
