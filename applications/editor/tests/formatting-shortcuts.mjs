import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const root = resolve(new URL("../../../", import.meta.url).pathname);
const fixture = [
'<!doctype html><html><head><meta charset="utf-8">',
'<style>.is-typewriter #toolbar{display:none}</style>',
'<script type="importmap">{"imports":{"@alysum/statistics/":"/core/statistics/"}}</script>',
'</head><body><div id="toolbar"></div><div id="page"></div>',
'<input id="title" value="Chapter title"><div id="reference" tabindex="0" contenteditable="false">Reference words</div>',
'<button id="exit" hidden>Exit</button><div id="confirmOverlay" hidden></div>',
'<script type="module">',
'import {mountDocument} from "/applications/editor/page-ui/document.js";',
'import {mountToolbar} from "/applications/editor/page-ui/toolbar.js";',
'import {mountTypewriter} from "/applications/editor/page-ui/page/typewriter.js";',
'const pageEl=document.querySelector("#page");',
'window.saves=[];',
'window.editor=mountDocument({pageEl,onInput:html=>{window.saves.push(html);localStorage.setItem("saved",html)}});',
'editor.setHtml(localStorage.getItem("saved") || "<p>Sample manuscript words</p>");',
'window.typewriter=mountTypewriter({pageEl,editor,typewriterExit:document.querySelector("#exit")});',
'const toolbar=mountToolbar({mount:document.querySelector("#toolbar"),pageEl,editor,onTypewriter:()=>typewriter.setTypewriter(true),getChapterTypography:()=>({})});',
'typewriter.setToolbarApi(toolbar);window.ready=true;',
'</script></body></html>'
].join("\n");
const server = createServer(async (req, res) => {
    try {
        const url = new URL(req.url, "http://localhost");
        if (url.pathname === "/fixture") {
            res.setHeader("Content-Type", "text/html"); res.end(fixture); return;
        }
        const path = resolve(root, "." + url.pathname);
        if (!path.startsWith(root + "/")) throw Error("Outside fixture");
        res.setHeader("Content-Type", extname(path) === ".css" ? "text/css" : "text/javascript");
        res.end(await readFile(path));
    } catch { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true });
try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("https://fonts.googleapis.com/**", route => route.fulfill({contentType:"text/css",body:""}));
    await page.goto("http://127.0.0.1:" + server.address().port + "/fixture");
    await page.waitForFunction(() => window.ready);
    const select = async (html = "<p>Sample manuscript words</p>", caret = false) => {
        await page.evaluate(({html,caret}) => {
            editor.setHtml(html); editor.focus();
            const range = document.createRange();
            range.selectNodeContents(document.querySelector("#page p"));
            if (caret) range.collapse(false);
            const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
            window.saves = [];
        }, {html,caret});
    };
    const active = command => page.evaluate(command => document.queryCommandState(command), command);
    for (const modifier of ["Control", "Meta"]) {
        for (const [key, command] of [["b","bold"],["i","italic"],["u","underline"]]) {
            await select();
            await page.keyboard.press(modifier + "+" + key);
            assert.equal(await active(command), true, modifier + "+" + key + " formats the selection");
            assert.ok(await page.evaluate(() => saves.length > 0), "Formatting enters normal save handling");
            const saved = await page.evaluate(() => localStorage.getItem("saved"));
            await page.reload(); await page.waitForFunction(() => window.ready);
            assert.equal(await page.locator("#page").innerHTML(), saved, "Saved formatting survives reload");
            await select(saved);
            assert.equal(await active(command), true);
            await page.keyboard.press(modifier + "+" + key);
            assert.equal(await active(command), false, "Shortcut toggles formatting off");
        }
    }
    await select(); await page.keyboard.press("Control+b");
    await page.keyboard.press("Control+z");
    assert.equal(await active("bold"), false, "Formatting participates in native undo");
    await select("<p>Plain</p>", true);
    await page.keyboard.press("Control+i"); await page.keyboard.type(" italic");
    assert.equal(await active("italic"), true, "Caret formatting applies to newly typed text");
    await page.keyboard.press("Control+i"); await page.keyboard.type(" plain");
    assert.equal(await active("italic"), false, "Caret formatting can be switched off");
    assert.match(await page.locator("#page").textContent(), /Plain\s+italic\s+plain/);
    await select();
    await page.evaluate(() => typewriter.setTypewriter(true));
    assert.equal(await page.locator("#toolbar").isVisible(), false);
    await page.keyboard.press("Control+u");
    assert.equal(await active("underline"), true, "Shortcut works with hidden Typewriter toolbar");
    await page.evaluate(() => typewriter.setTypewriter(false));
    await select();
    const untouched = await page.evaluate(() => {
        const target = document.querySelector("#page");
        const cases = [
            {key:"b",ctrlKey:true,shiftKey:true}, {key:"i",ctrlKey:true,altKey:true},
            {key:"u",metaKey:true,isComposing:true}, {key:"b",ctrlKey:true,keyCode:229},
            {key:"u"}, {key:"x",ctrlKey:true}
        ];
        return cases.map(options => {
            const event = new KeyboardEvent("keydown",{bubbles:true,cancelable:true,...options});
            target.dispatchEvent(event); return event.defaultPrevented;
        });
    });
    assert.deepEqual(untouched, Array(6).fill(false), "Other shortcuts and composition are untouched");
    assert.equal(await page.evaluate(() => saves.length), 0);
    await page.keyboard.press("Control+b");
    await page.evaluate(() => document.querySelector("#page").dispatchEvent(new KeyboardEvent("keydown",{
        key:"b",ctrlKey:true,repeat:true,bubbles:true,cancelable:true
    })));
    assert.equal(await active("bold"), true, "Key repeat does not toggle formatting again");
    for (const target of ["#title", "#reference"]) {
        await page.locator(target).focus();
        const before = await page.locator("#page").innerHTML();
        const prevented = await page.locator(target).evaluate(el => {
            const event = new KeyboardEvent("keydown",{key:"b",ctrlKey:true,bubbles:true,cancelable:true});
            el.dispatchEvent(event); return event.defaultPrevented;
        });
        assert.equal(prevented, false, "No shortcut interception outside the manuscript");
        assert.equal(await page.locator("#page").innerHTML(), before);
    }
    await select("<p>Read-only</p>");
    assert.equal(await page.evaluate(() => {
        const el=document.querySelector("#page"); el.contentEditable="false";
        const event=new KeyboardEvent("keydown",{key:"b",ctrlKey:true,bubbles:true,cancelable:true});
        el.dispatchEvent(event); return event.defaultPrevented;
    }), false, "Read-only manuscripts are not formatted");
    for (const key of ["b","i","u"]) {
        const button = page.locator('[aria-keyshortcuts="Control+' + key + ' Meta+' + key + '"]');
        assert.equal(await button.count(), 1);
        assert.match(await button.getAttribute("title"), /Ctrl\+/);
    }
    assert.deepEqual(errors, []);
    console.log("PASS formatting shortcuts: Ctrl, Meta, selection, caret, save/reload, undo, Typewriter, scope, modifiers and IME");
} finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
}
