#!/usr/bin/env python3
"""Local preview with the same public URLs as production.

    python3 core/server/dev.py

Then open http://127.0.0.1:3000/
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse
import os

ROOT = Path(__file__).resolve().parent.parent.parent
PORT = int(os.environ.get("PORT", "3000"))

TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
    ".txt": "text/plain; charset=utf-8",
}

EXACT = {
    "/sw.js": "applications/main-site/public/sw.js",
    "/manifest.webmanifest": "applications/main-site/public/manifest.webmanifest",
    "/robots.txt": "applications/main-site/public/robots.txt",
    "/Alysum-3.png": "applications/main-site/public/Alysum-3.png",
    "/discord-logo.png": "applications/main-site/public/discord-logo.png",
}


def public_to_file(url_path: str) -> Path:
    clean = unquote(urlparse(url_path).path)
    if clean in ("/", "/index.html"):
        return ROOT / "applications/main-site/pages/index.html"
    if clean in EXACT:
        return ROOT / EXACT[clean]
    if clean.startswith("/js/signup/"):
        return ROOT / "applications/main-site/signup" / clean[len("/js/signup/") :]
    if clean.startswith("/js/settings/"):
        return ROOT / "applications/main-site/settings" / clean[len("/js/settings/") :]
    if clean.startswith("/js/studio/"):
        return ROOT / "applications/studio/page-ui" / clean[len("/js/studio/") :]
    if clean.startswith("/js/editor/"):
        return ROOT / "applications/editor/page-ui" / clean[len("/js/editor/") :]
    if clean.startswith("/js/"):
        name = clean[len("/js/") :]
        if name.startswith("homepage"):
            return ROOT / "applications/main-site/homepage" / name
        if name.startswith("login"):
            return ROOT / "applications/main-site/login" / name
        return ROOT / "applications/main-site/page-ui" / name
    if clean.startswith("/css/homepage/"):
        return ROOT / "applications/main-site/homepage/homepage-css" / clean[len("/css/homepage/") :]
    if clean.startswith("/css/login/"):
        return ROOT / "applications/main-site/login/login-css" / clean[len("/css/login/") :]
    if clean.startswith("/css/signup/"):
        return ROOT / "applications/main-site/signup/signup-css" / clean[len("/css/signup/") :]
    if clean.startswith("/css/settings/"):
        return ROOT / "applications/main-site/settings/settings-css" / clean[len("/css/settings/") :]
    if clean.startswith("/css/studio/"):
        return ROOT / "applications/studio/studio-css" / clean[len("/css/studio/") :]
    if clean.startswith("/css/editor/"):
        return ROOT / "applications/editor/editor-css" / clean[len("/css/editor/") :]
    if clean.startswith("/css/"):
        return ROOT / "applications/main-site/pages-css" / clean[len("/css/") :]
    if clean.startswith("/assets/"):
        return ROOT / "applications/main-site/assets" / clean[len("/assets/") :]
    if clean.startswith(("/site-appearance/", "/core/")):
        return ROOT / clean[1:]
    if clean == "/studio.html":
        return ROOT / "applications/studio/pages/studio.html"
    if clean == "/editor.html":
        return ROOT / "applications/editor/pages/editor.html"
    if clean.endswith(".html") and "/" not in clean[1:]:
        return ROOT / "applications/main-site/pages" / clean[1:]
    return ROOT / clean[1:]


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        file_path = public_to_file(self.path)
        try:
            file_path.resolve().relative_to(ROOT)
        except ValueError:
            self.send_error(403)
            return
        if not file_path.is_file():
            self.send_error(404)
            return
        data = file_path.read_bytes()
        content_type = TYPES.get(file_path.suffix, "application/octet-stream")
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format, *args):
        print("%s - %s" % (self.address_string(), format % args))


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Alysum local preview: http://127.0.0.1:{PORT}/", flush=True)
    server.serve_forever()
