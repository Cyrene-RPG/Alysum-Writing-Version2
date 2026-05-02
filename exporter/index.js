const express = require("express");
const puppeteer = require("puppeteer");

const app = express();

app.use(express.json({ limit: "25mb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

let browserPromise = null;

function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
  }
  return browserPromise;
}

function headerTemplate({ title = "", author = "", showHeaders }) {
  if (!showHeaders) return "<div></div>";
  const safeTitle = String(title).replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeAuthor = String(author).replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `
    <div style="width:100%; font-size:9px; color:#555; padding:0 0.55in; font-family: Georgia, 'Times New Roman', serif;">
      <div style="display:flex; justify-content:space-between; width:100%;">
        <span>${safeAuthor}</span>
        <span>${safeTitle}</span>
      </div>
    </div>
  `;
}

function footerTemplate({ showPageNumbers }) {
  if (!showPageNumbers) return "<div></div>";
  return `
    <div style="width:100%; font-size:9px; color:#555; padding:0 0.55in; font-family: Georgia, 'Times New Roman', serif;">
      <div style="text-align:center; width:100%;">
        <span class="pageNumber"></span>
      </div>
    </div>
  `;
}

app.get("/health", (req, res) => res.json({ ok: true }));

app.post("/pdf", async (req, res) => {
  const { html, options } = req.body || {};
  if (typeof html !== "string" || !html.trim()) {
    return res.status(400).send("Missing 'html' string");
  }

  const opt = options && typeof options === "object" ? options : {};
  const showHeaders = Boolean(opt.showHeaders);
  const showPageNumbers = Boolean(opt.showPageNumbers);

  try {
    const browser = await getBrowser();
    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: ["domcontentloaded", "networkidle0"] });
    await page.emulateMediaType("print");

    const pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: Boolean(opt.showHeaderFooter),
      headerTemplate: headerTemplate({ title: opt.title, author: opt.author, showHeaders }),
      footerTemplate: footerTemplate({ showPageNumbers }),
      margin: { top: showHeaders ? "0.55in" : "0.2in", bottom: showPageNumbers ? "0.55in" : "0.2in", left: "0in", right: "0in" }
    });

    await page.close();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="book.pdf"');
    return res.status(200).send(pdf);
  } catch (err) {
    return res.status(500).send(err?.stack || err?.message || String(err));
  }
});

const port = Number(process.env.PORT) || 8787;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`PDF exporter listening on http://localhost:${port}`);
});

