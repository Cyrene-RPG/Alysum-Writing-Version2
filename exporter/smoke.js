const fs = require("node:fs");

async function main() {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      @page { size: 5in 8in; margin: 0; }
      html, body { margin: 0; padding: 0; }
      body { font-family: Georgia, "Times New Roman", serif; font-size: 11pt; }
      .book { padding: 0.75in 0.85in 0.85in; }
      .chapter { break-before: page; }
      .chapter-title { text-align: center; padding: 22% 0 12%; margin: 0; }
    </style>
  </head>
  <body>
    <main class="book">
      <section class="title-page" style="page: title;">
        <h1>Test Book</h1>
        <div>Author</div>
      </section>
      <section class="chapter" id="ch-1">
        <h2 class="chapter-title">Chapter 1</h2>
        <p>Hello world.</p>
      </section>
    </main>
  </body>
</html>`;

  const base = process.env.EXPORT_URL || "http://localhost:8787/api";
  const res = await fetch(`${base.replace(/\/+$/, "")}/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      html,
      options: { usePagedJs: true, title: "Test Book", author: "Author" }
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${text}`.trim());
  }

  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync("smoke.pdf", buf);
  console.log("wrote smoke.pdf bytes", buf.length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

