/* ============================= */
/* GLOBAL STATE */
/* ============================= */

let currentSize = "5x8";

/* ============================= */
/* SAMPLE BOOK (replace later with Firebase) */
/* ============================= */

const book = {
  title: "My Book",
  sections: {
    body: [
      {
        title: "Chapter 1",
        content: "<p>This is a sample paragraph so you can see your formatter working. Add more text here to test pagination.</p><p>Second paragraph for testing layout behavior.</p>"
      },
      {
        title: "Chapter 2",
        content: "<p>More content here. This will appear on another page depending on size.</p>"
      }
    ]
  }
};

/* ============================= */
/* CREATE PAGE */
/* ============================= */

function createPage() {
  const page = document.createElement("div");
  page.className = "page";

  if (currentSize !== "5x8") {
    page.classList.add("size-" + currentSize);
  }

  return page;
}

/* ============================= */
/* BUILD CONTENT */
/* ============================= */

function buildPages() {
  const preview = document.getElementById("preview");
  preview.innerHTML = "";

  book.sections.body.forEach((ch, index) => {
    const page = createPage();

    // Chapter title
    const title = document.createElement("h1");
    title.className = "chapter-title";
    title.innerText = ch.title;

    page.appendChild(title);

    // Content
    const wrapper = document.createElement("div");
    wrapper.innerHTML = ch.content;

    page.appendChild(wrapper);

    // Page number
    const num = document.createElement("div");
    num.className = "page-number";
    num.innerText = index + 1;

    page.appendChild(num);

    preview.appendChild(page);
  });
}

/* ============================= */
/* BUTTON HOOKS */
/* ============================= */

// Render button
document.getElementById("renderBtn").onclick = () => {
  buildPages();
};

// Export button
document.getElementById("exportBtn").onclick = () => {
  const blob = new Blob([document.documentElement.outerHTML], {
    type: "text/html"
  });

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "book.html";
  a.click();
};

// Trim size selector
document.getElementById("trimSize").onchange = (e) => {
  currentSize = e.target.value;
};

// Theme toggle
document.getElementById("themeToggle").onclick = () => {
  document.body.classList.toggle("light");
};

/* ============================= */
/* INITIAL RENDER */
/* ============================= */

buildPages();