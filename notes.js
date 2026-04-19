const editorText = document.getElementById("editorText");
const editorDisplay = document.getElementById("editorDisplay");

let notes = [
  { id: "1", title: "Test", body: "Hello [[Second]]" },
  { id: "2", title: "Second", body: "Back to [[Test]]" }
];

let activeNoteId = "1";

function activeNote() {
  return notes.find(n => n.id === activeNoteId);
}

function renderEditor() {
  const note = activeNote();
  editorText.value = note.body;
  renderDisplay();
}

function renderDisplay() {
  const text = editorText.value;

  const html = text.replace(/\[\[(.*?)\]\]/g, (match, name) => {
    return `<span class="editor-link" data-note="${name}">[[${name}]]</span>`;
  });

  editorDisplay.innerHTML = html.replace(/\n/g, "<br>");
}

function openNoteByTitle(title) {
  let note = notes.find(n => n.title === title);

  if (!note) {
    note = {
      id: Date.now().toString(),
      title,
      body: ""
    };
    notes.push(note);
  }

  activeNoteId = note.id;
  renderEditor();
}

function handleClick(e) {
  const link = e.target.closest(".editor-link");
  if (!link) return;

  const name = link.dataset.note;
  openNoteByTitle(name);
}

editorText.addEventListener("input", renderDisplay);
editorDisplay.addEventListener("click", handleClick);

renderEditor();