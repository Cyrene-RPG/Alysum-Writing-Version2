const {
    createPublicClient,
    siteOrigin,
    absUrl,
    escHtml,
    truncate,
    libraryRowData,
    bookPageTitle,
    bookMetaDescription,
    bookAuthorLabel,
    firstChapterExcerpt,
    buildBookJsonLd,
} = require("../lib/seo-public.js");
const { isAiBotUserAgent } = require("../lib/bot-agents.js");

function metaTag(attr, key, value) {
    if (!value) return "";
    return `<meta ${attr}="${escHtml(key)}" content="${escHtml(value)}">`;
}

function buildHead({ title, description, canonical, image, type, author, jsonLd, robots, aiBot }) {
    const robotsValue = robots || (aiBot ? "noindex, nofollow, noai, noimageai" : "index, follow");
    const lines = [
        "<meta charset=\"UTF-8\">",
        `<title>${escHtml(title)}</title>`,
        metaTag("name", "description", description),
        metaTag("name", "author", author),
        metaTag("name", "robots", robotsValue),
        metaTag("name", "googlebot", robotsValue),
        `<link rel="canonical" href="${escHtml(canonical)}">`,
        metaTag("property", "og:site_name", "Alysum"),
        metaTag("property", "og:locale", "en_US"),
        metaTag("property", "og:type", type || "website"),
        metaTag("property", "og:title", title),
        metaTag("property", "og:description", description),
        metaTag("property", "og:url", canonical),
        metaTag("property", "og:image", image),
        metaTag("name", "twitter:card", "summary_large_image"),
        metaTag("name", "twitter:title", title),
        metaTag("name", "twitter:description", description),
        metaTag("name", "twitter:image", image),
    ].filter(Boolean);

    if (jsonLd && !aiBot) {
        lines.push(`<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`);
    }
    return lines.join("\n    ");
}

function buildAiLibraryPage({ origin, path, canonical }) {
    const title = "Alysum Library";
    const description =
        "Alysum Library is a free online story platform. Visit Alysum to browse and read fiction, fanfiction, nonfiction, and comics written by our community.";
    const image = absUrl(origin, "/Alysum-3.png");
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    ${buildHead({ title, description, canonical, image, type: "website", author: "Alysum", aiBot: true })}
</head>
<body>
    <main>
        <h1>Alysum Library</h1>
        <p>${escHtml(description)}</p>
        <p><a href="${escHtml(absUrl(origin, "/library.html"))}">Browse Alysum Library</a></p>
    </main>
</body>
</html>`;
    return html;
}

async function loadBook(bookId) {
    const supabase = createPublicClient();
    const { data, error } = await supabase.from("library").select("*").eq("id", bookId).maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const payload = libraryRowData(data);
    if (payload.isPublished === false) return null;

    const title = String(payload.title || "Untitled").trim() || "Untitled";
    const author = String(payload.author || "Unknown").trim() || "Unknown";
    const summary = String(payload.summary || "").trim();
    const coverUrl = String(payload.coverUrl || payload.cover_url || "").trim();
    const isAnonymous = !!(payload.isAnonymous ?? payload.is_anonymous);
    const excerpt = firstChapterExcerpt(payload);
    let authorUrl = null;

    if (!isAnonymous) {
        const ownerId = String(payload.ownerUid || payload.user_id || data.user_id || "").trim();
        if (ownerId) {
            const { data: userRow } = await supabase
                .from("users")
                .select("username")
                .eq("id", ownerId)
                .maybeSingle();
            const username = String(userRow?.username || "").trim();
            if (username) authorUrl = `/author.html?u=${encodeURIComponent(username)}`;
        }
    }

    return { title, author, summary, coverUrl, isAnonymous, authorUrl, excerpt };
}

async function loadAuthor(username) {
    const supabase = createPublicClient();
    const handle = String(username || "").trim();
    if (!handle) return null;

    const { data, error } = await supabase
        .from("users")
        .select("id, username, display_name, profile_image_url, bio")
        .ilike("username", handle)
        .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const displayName = String(data.display_name || data.username || handle).trim() || handle;
    const bio = truncate(data.bio, 320);
    const image = String(data.profile_image_url || "").trim();

    const { data: works, error: worksError } = await supabase.from("library").select("id, data").eq("user_id", data.id);
    if (worksError) throw worksError;

    const books = (works || [])
        .map((row) => {
            const payload = libraryRowData(row);
            if (payload.isPublished === false || payload.isAnonymous) return null;
            return {
                id: String(row.id || payload.id || "").trim(),
                title: String(payload.title || "Untitled").trim() || "Untitled",
            };
        })
        .filter(Boolean)
        .slice(0, 12);

    return {
        username: String(data.username || handle).trim(),
        displayName,
        bio,
        image,
        books,
    };
}

module.exports = async function handler(req, res) {
    const origin =
        siteOrigin(req.headers.host) ||
        `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;
    const path = String(req.query._path || "/read.html");
    const defaultImage = absUrl(origin, "/Alysum-3.png");
    const userAgent = String(req.headers["user-agent"] || "");
    const aiBot = String(req.query._ai || "") === "1" || isAiBotUserAgent(userAgent);

    const sendHtml = (html, status = 200) => {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", aiBot ? "public, s-maxage=300" : "public, s-maxage=3600, stale-while-revalidate=86400");
        if (aiBot) res.setHeader("X-Robots-Tag", "noai, noimageai, noindex, nofollow");
        res.status(status).send(html);
    };

    try {
        if (path === "/library.html") {
            const canonical = absUrl(origin, "/library.html");
            if (aiBot) {
                sendHtml(buildAiLibraryPage({ origin, path, canonical }));
                return;
            }

            const supabase = createPublicClient();
            let rows = null;
            const catalogResult = await supabase.from("library_catalog").select("id, data");
            if (catalogResult.error && /library_catalog|relation.*does not exist/i.test(String(catalogResult.error.message || catalogResult.error))) {
                const fallback = await supabase.from("library").select("id, data");
                if (fallback.error) throw fallback.error;
                rows = fallback.data;
            } else {
                if (catalogResult.error) throw catalogResult.error;
                rows = catalogResult.data;
            }

            const books = (rows || [])
                .map((row) => {
                    const payload = libraryRowData(row);
                    if (payload.isPublished === false) return null;
                    return {
                        id: String(row.id || payload.id || "").trim(),
                        title: String(payload.title || "Untitled").trim() || "Untitled",
                        author: String(payload.author || "Unknown").trim() || "Unknown",
                    };
                })
                .filter(Boolean)
                .slice(0, 48);

            const pageTitle = "Read Free Stories Online — Alysum Library";
            const description =
                "Browse and read free stories online — fiction, fanfiction, nonfiction, and comics published by writers on Alysum.";
            const listHtml = books.length
                ? `<ul>${books
                      .map(
                          (book) =>
                              `<li><a href="${escHtml(absUrl(origin, `/read.html?book=${encodeURIComponent(book.id)}`))}">${escHtml(book.title)} by ${escHtml(book.author)}</a></li>`
                      )
                      .join("")}</ul>`
                : "";

            const html = `<!DOCTYPE html>
<html lang="en">
<head>
    ${buildHead({ title: pageTitle, description, canonical, image: defaultImage, type: "website", author: "Alysum" })}
</head>
<body>
    <main>
        <h1>Alysum Library</h1>
        <p>${escHtml(description)}</p>
        ${listHtml}
        <p><a href="${escHtml(canonical)}">Browse Alysum Library</a></p>
    </main>
</body>
</html>`;
            sendHtml(html);
            return;
        }

        if (path === "/read.html") {
            if (aiBot) {
                const canonical = absUrl(origin, `/read.html?book=${encodeURIComponent(String(req.query.book || req.query.id || ""))}`);
                sendHtml(buildAiLibraryPage({ origin, path, canonical }));
                return;
            }

            const bookId = String(req.query.book || req.query.id || req.query.bookId || "").trim();
            if (!bookId) {
                res.status(404).setHeader("Content-Type", "text/html; charset=utf-8").send("Story not found.");
                return;
            }

            const book = await loadBook(bookId);
            if (!book) {
                res.status(404).setHeader("Content-Type", "text/html; charset=utf-8").send("Story not found.");
                return;
            }

            const canonical = absUrl(origin, `/read.html?book=${encodeURIComponent(bookId)}`);
            const authorName = bookAuthorLabel(book.author, book.isAnonymous);
            const pageTitle = bookPageTitle(book.title, book.author, book.isAnonymous);
            const description = bookMetaDescription(book.title, book.author, book.summary, book.isAnonymous);
            const image = book.coverUrl ? absUrl(origin, book.coverUrl) : defaultImage;
            const authorPageAbs = book.authorUrl ? absUrl(origin, book.authorUrl) : null;
            const jsonLd = buildBookJsonLd({
                title: book.title,
                author: book.author,
                isAnonymous: book.isAnonymous,
                summary: book.summary,
                description,
                pageUrl: canonical,
                imageUrl: image,
                authorPageUrl: authorPageAbs,
            });

            const authorLine = book.isAnonymous
                ? `<p>By Anonymous</p>`
                : book.authorUrl
                  ? `<p>By <a href="${escHtml(authorPageAbs)}">${escHtml(book.author)}</a></p>`
                  : `<p>By ${escHtml(book.author)}</p>`;

            const excerptBlock =
                book.excerpt.excerpt
                    ? `<article>
        <h2>${escHtml(book.excerpt.chapterTitle)}</h2>
        <p>${escHtml(book.excerpt.excerpt)}</p>
    </article>`
                    : "";

            const html = `<!DOCTYPE html>
<html lang="en">
<head>
    ${buildHead({ title: pageTitle, description, canonical, image, type: "book", author: authorName, jsonLd })}
</head>
<body>
    <main>
        <h1>${escHtml(book.title)}</h1>
        ${authorLine}
        ${book.summary ? `<p>${escHtml(book.summary)}</p>` : `<p>${escHtml(description)}</p>`}
        ${excerptBlock}
        <p><a href="${escHtml(canonical)}">Read ${escHtml(book.title)} by ${escHtml(authorName)} on Alysum</a></p>
    </main>
</body>
</html>`;

            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
            res.status(200).send(html);
            return;
        }

        if (path === "/author.html") {
            if (aiBot) {
                const canonical = absUrl(origin, `/author.html?u=${encodeURIComponent(String(req.query.u || req.query.user || ""))}`);
                sendHtml(buildAiLibraryPage({ origin, path, canonical }));
                return;
            }

            const username = String(req.query.u || req.query.user || req.query.username || "").trim();
            if (!username) {
                res.status(404).setHeader("Content-Type", "text/html; charset=utf-8").send("Author not found.");
                return;
            }

            const author = await loadAuthor(username);
            if (!author) {
                res.status(404).setHeader("Content-Type", "text/html; charset=utf-8").send("Author not found.");
                return;
            }

            const canonical = absUrl(origin, `/author.html?u=${encodeURIComponent(author.username)}`);
            const pageTitle = `${author.displayName} — Author on Alysum`;
            const description =
                author.bio ||
                `Read published stories by ${author.displayName} (@${author.username}) on Alysum.`;
            const image = author.image ? absUrl(origin, author.image) : defaultImage;
            const jsonLd = {
                "@context": "https://schema.org",
                "@type": "ProfilePage",
                name: `${author.displayName} — Alysum Author`,
                url: canonical,
                mainEntity: {
                    "@type": "Person",
                    name: author.displayName,
                    alternateName: `@${author.username}`,
                    description: author.bio || description,
                    url: canonical,
                    image,
                },
            };

            const worksHtml = author.books.length
                ? `<ul>${author.books
                      .map(
                          (work) =>
                              `<li><a href="${escHtml(absUrl(origin, `/read.html?book=${encodeURIComponent(work.id)}`))}">${escHtml(work.title)} by ${escHtml(author.displayName)}</a></li>`
                      )
                      .join("")}</ul>`
                : "";

            const html = `<!DOCTYPE html>
<html lang="en">
<head>
    ${buildHead({ title: pageTitle, description, canonical, image, type: "profile", author: author.displayName, jsonLd })}
</head>
<body>
    <main>
        <h1>${escHtml(author.displayName)}</h1>
        <p>@${escHtml(author.username)}</p>
        ${author.bio ? `<p>${escHtml(author.bio)}</p>` : ""}
        ${worksHtml}
        <p><a href="${escHtml(canonical)}">View this author on Alysum</a></p>
    </main>
</body>
</html>`;

            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
            res.status(200).send(html);
            return;
        }

        res.status(404).setHeader("Content-Type", "text/plain; charset=utf-8").send("Not found.");
    } catch (err) {
        console.error("bot-preview error", err);
        res.status(500).setHeader("Content-Type", "text/plain; charset=utf-8").send("Could not render preview.");
    }
};
