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

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// DOM
const editorText = document.getElementById("editorText");
const editorDisplay = document.getElementById("editorDisplay");
const noteTitle = document.getElementById("noteTitle");
const treeRoot = document.getElementById("treeRoot");
const newNoteBtn = document.getElementById("newNoteBtn");
const deleteBtn = document.getElementById("deleteBtn");

// STATE
let currentUser = null;
let notes = [];
let activeNoteId = null;

// FIREBASE REFS
function notesRef() {
  return collection(db, "users", currentUser.uid, "notes");
}

function noteDocRef(id) {
  return doc(db, "users", currentUser.uid, "notes", id);
}

// ==========================
// CORE
// ==========================

function activeNote() {
  return notes.find(n => n.id === activeNoteId);
}

// ==========================
// RENDER
// ==========================

function renderSidebar() {
  treeRoot.innerHTML = "";

  notes.forEach(note => {
    const div = document.createElement("div");
    div.className = "note-item" + (note.id === activeNoteId ? " active" : "");
    div.textContent = note.title || "Untitled";

    div.onclick = () => openNote(note.id);

    treeRoot.appendChild(div);
  });
}

function renderEditor() {
  const note = activeNote();
  if (!note) return;

  noteTitle.value = note.title || "";
  editorText.value = note.body || "";

  renderDisplay();
}

function renderDisplay() {
  const text = editorText.value;

  const html = text.replace(/\[\[(.*?)\]\]/g, (match, name) => {
    return `<span class="editor-link" data-note="${name}">[[${name}]]</span>`;
  });

  editorDisplay.innerHTML = html.replace(/\n/g, "<br>");
}

// ==========================
// NOTE ACTIONS
// ==========================

async function createNote(title = "Untitled") {
  const ref = await addDoc(notesRef(), {
    title,
    body: "",
    createdAt: Date.now(),
    updatedAt: Date.now()
  });

  // instant UI update
  const newNote = {
    id: ref.id,
    title,
    body: ""
  };

  notes.push(newNote);
  activeNoteId = ref.id;

  renderSidebar();
  renderEditor();
}

function openNote(id) {
  activeNoteId = id;
  renderSidebar();
  renderEditor();
}

async function openOrCreateNote(title) {
  let note = notes.find(n => n.title === title);

  if (!note) {
    await createNote(title);
    return;
  }

  openNote(note.id);
}

async function saveNote() {
  const note = activeNote();
  if (!note) return;

  const title = noteTitle.value;
  const body = editorText.value;

  note.title = title;
  note.body = body;

  renderSidebar();

  await updateDoc(noteDocRef(note.id), {
    title,
    body,
    updatedAt: Date.now()
  });
}

async function deleteNote() {
  const note = activeNote();
  if (!note) return;

  if (!confirm("Delete note?")) return;

  await deleteDoc(noteDocRef(note.id));

  notes = notes.filter(n => n.id !== note.id);
  activeNoteId = notes.length ? notes[0].id : null;

  renderSidebar();
  renderEditor();
}

// ==========================
// EVENTS
// ==========================

editorText.addEventListener("input", () => {
  renderDisplay();
  saveNote();
});

noteTitle.addEventListener("input", saveNote);

editorDisplay.addEventListener("click", (e) => {
  let el = e.target;

  while (el && el !== editorDisplay) {
    if (el.classList && el.classList.contains("editor-link")) {
      const name = el.dataset.note;
      openOrCreateNote(name);
      return;
    }
    el = el.parentNode;
  }
});

newNoteBtn.addEventListener("click", () => createNote());
deleteBtn.addEventListener("click", deleteNote);

// ==========================
// FIREBASE SYNC
// ==========================

function subscribe() {
  const q = query(notesRef(), orderBy("updatedAt", "desc"));

  onSnapshot(q, (snap) => {
    notes = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (!activeNoteId && notes.length) {
      activeNoteId = notes[0].id;
    }

    renderSidebar();
    renderEditor();
  });
}

// ==========================
// INIT
// ==========================

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "/login.html";
    return;
  }

  currentUser = user;
  subscribe();
});