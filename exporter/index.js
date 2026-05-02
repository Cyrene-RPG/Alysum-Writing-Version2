const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
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
    const launchOpts = {
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    };
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOpts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    browserPromise = puppeteer.launch(launchOpts);
  }
  return browserPromise;
}

function pagedPolyfillPath() {
  const direct = path.join(__dirname, "node_modules", "pagedjs", "dist", "paged.polyfill.js");
  if (fs.existsSync(direct)) return direct;
  try {
    return require.resolve("pagedjs", { conditions: ["polyfill", "require", "default"] });
  } catch (e) {
    return direct;
  }
}

async function handlePdf(req, res) {
  const { html, options } = req.body || {};
  if (typeof html !== "string" || !html.trim()) {
    return res.status(400).send("Missing 'html' string");
  }

  const opt = options && typeof options === "object" ? options : {};
  const usePagedJs = Boolean(opt.usePagedJs);

  try {
    const browser = await getBrowser();
    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: ["domcontentloaded", "networkidle0"] });
    await page.emulateMediaType("print");

    if (usePagedJs) {
      const pagedPath = pagedPolyfillPath();
      const pagedJs = fs.readFileSync(pagedPath, "utf8");

      await page.addScriptTag({ content: pagedJs });
      await page.addScriptTag({
        content: `
          (function () {
            window.__PAGED_DONE = false;
            function done() { window.__PAGED_DONE = true; }
            try {
              if (window.PagedPolyfill && typeof window.PagedPolyfill.preview === "function") {
                window.PagedPolyfill.preview().then(done).catch(done);
              } else if (window.Paged && window.Paged.Previewer) {
                const p = new window.Paged.Previewer();
                p.preview().then(done).catch(done);
              } else {
                done();
              }
            } catch (e) {
              done();
            }
          })();
        `
      });

      await page.waitForFunction("window.__PAGED_DONE === true", { timeout: 120000 });
    }

    const pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      margin: { top: "0in", bottom: "0in", left: "0in", right: "0in" }
    });

    await page.close();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="book.pdf"');
    return res.status(200).send(pdf);
  } catch (err) {
    return res.status(500).send(err?.stack || err?.message || String(err));
  }
}

const api = express.Router();
api.get("/health", (req, res) => res.json({ ok: true }));
api.post("/pdf", handlePdf);

app.use("/api", api);
app.use("/", api);

const port = Number(process.env.PORT) || 8787;
app.listen(port, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`PDF exporter listening on port ${port} (paths /api/* and /*)`);
});
