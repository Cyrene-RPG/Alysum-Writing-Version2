/**
 * Alysum SEO helpers — updates meta tags without touching page layout.
 * Loaded on every page via the ALYSUM:SEO head block.
 */
(function (global) {
    "use strict";

    var DEFAULT_IMAGE = "/Alysum-3.png";

    function origin() {
        return (global.location && global.location.origin) || "";
    }

    function absUrl(url) {
        if (!url) return "";
        if (/^https?:\/\//i.test(url)) return url;
        if (url.startsWith("//")) return "https:" + url;
        var base = origin();
        if (!base) return url;
        return base + (url.startsWith("/") ? url : "/" + url);
    }

    function setMeta(attr, key, content) {
        if (content == null || content === "") return;
        var selector =
            attr === "name"
                ? 'meta[name="' + key + '"]'
                : 'meta[property="' + key + '"]';
        var el = document.head.querySelector(selector);
        if (!el) {
            el = document.createElement("meta");
            el.setAttribute(attr, key);
            document.head.appendChild(el);
        }
        el.setAttribute("content", String(content));
    }

    function setLink(rel, href) {
        if (!href) return;
        var el = document.head.querySelector('link[rel="' + rel + '"]');
        if (!el) {
            el = document.createElement("link");
            el.setAttribute("rel", rel);
            document.head.appendChild(el);
        }
        el.setAttribute("href", href);
    }

    function apply(opts) {
        opts = opts || {};
        if (opts.title) document.title = opts.title;
        if (opts.description) {
            setMeta("name", "description", opts.description);
            setMeta("property", "og:description", opts.description);
            setMeta("name", "twitter:description", opts.description);
        }
        if (opts.title) {
            setMeta("property", "og:title", opts.title);
            setMeta("name", "twitter:title", opts.title);
        }
        if (opts.image) {
            var img = absUrl(opts.image);
            setMeta("property", "og:image", img);
            setMeta("name", "twitter:image", img);
        }
        if (opts.url) setMeta("property", "og:url", absUrl(opts.url));
        if (opts.type) setMeta("property", "og:type", opts.type);
        if (opts.robots) setMeta("name", "robots", opts.robots);
        if (opts.author) setMeta("name", "author", opts.author);
        if (opts.canonical) setLink("canonical", absUrl(opts.canonical));
        if (opts.jsonLd) setJsonLd(opts.jsonLd, opts.jsonLdId);
    }

    function setJsonLd(data, id) {
        if (!data) return;
        id = id || "alysum-jsonld-dynamic";
        var existing = document.getElementById(id);
        if (!existing) {
            existing = document.createElement("script");
            existing.type = "application/ld+json";
            existing.id = id;
            document.head.appendChild(existing);
        }
        existing.textContent = JSON.stringify(data);
    }

    function resolveStatic() {
        var canonical = document.querySelector('link[rel="canonical"][data-seo-path]');
        if (canonical) {
            var path = canonical.getAttribute("data-seo-path") || global.location.pathname;
            var href = absUrl(path);
            canonical.removeAttribute("data-seo-path");
            canonical.href = href;
            setMeta("property", "og:url", href);
        }

        document
            .querySelectorAll('meta[property="og:image"], meta[name="twitter:image"]')
            .forEach(function (el) {
                var c = el.getAttribute("content");
                if (c && !/^https?:\/\//i.test(c)) {
                    el.setAttribute("content", absUrl(c));
                }
            });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", resolveStatic);
    } else {
        resolveStatic();
    }

    global.AlysumSeo = { apply: apply, absUrl: absUrl, defaultImage: DEFAULT_IMAGE, setJsonLd: setJsonLd };
})(typeof window !== "undefined" ? window : globalThis);
