import { railButton } from "/applications/artist/page-ui/studio-draw-widgets.js";

export function drawMarkup(ICONS) {
    return `
        <section class="draw-gallery" id="draw-gallery">
            <header class="draw-gallery-head">
                <div class="draw-gallery-bar">
                    <a href="/artist">Characters</a>
                    <button type="button" class="draw-new" id="draw-new">New canvas</button>
                </div>
                <div class="draw-gallery-heading">
                    <p class="draw-kicker">Studio</p>
                    <h1>Draw</h1>
                </div>
            </header>
            <div class="draw-cards" id="draw-cards"></div>
        </section>
        <section class="draw-stage" id="draw-stage" hidden>
            <header class="draw-top">
                <button type="button" class="draw-gallery-btn" id="draw-back">Gallery</button>
                <button type="button" class="draw-title" id="draw-title">Untitled Canvas</button>
                <div class="draw-top-actions">
                    <button type="button" id="draw-undo" aria-label="Undo">${ICONS.undo}</button>
                    <button type="button" id="draw-redo" aria-label="Redo">${ICONS.redo}</button>
                    <button type="button" id="draw-fit" aria-label="Fit canvas">${ICONS.fit}</button>
                </div>
            </header>
            <div class="draw-body">
                <nav class="draw-rail draw-rail-left" aria-label="Canvas tools">
                    ${railButton("actions", "wrench", "Actions")}
                    ${railButton("adjust", "wand", "Adjustments")}
                    ${railButton("select", "lasso", "Selection")}
                    ${railButton("transform", "move", "Transform")}
                    ${railButton("shape", "shapes", "Shapes")}
                    ${railButton("fill", "fill", "Fill")}
                    ${railButton("pick", "dropper", "Eyedropper")}
                </nav>
                <div class="draw-viewport" id="draw-viewport">
                    <canvas id="draw-canvas"></canvas>
                    <div class="draw-cursor" id="draw-cursor" hidden></div>
                    <div class="draw-loupe" id="draw-loupe" hidden><canvas width="112" height="112"></canvas></div>
                </div>
                <div class="draw-sliders" id="draw-sliders">
                    <label>Size<input id="draw-size" type="range" min="1" max="240" value="8"></label>
                    <label>Opacity<input id="draw-opacity" type="range" min="1" max="100" value="100"></label>
                </div>
                <nav class="draw-rail draw-rail-right" aria-label="Paint tools">
                    ${railButton("paint", "brush", "Brush")}
                    ${railButton("smudge", "smudge", "Smudge")}
                    ${railButton("erase", "eraser", "Eraser")}
                    ${railButton("layers", "layers", "Layers")}
                    <button type="button" class="draw-tool draw-color-btn" data-panel="color" aria-label="Color"><span id="draw-swatch"></span></button>
                </nav>
            </div>
            <aside class="draw-panel from-right" id="draw-panel" hidden></aside>
            <p class="draw-toast" id="draw-toast" hidden></p>
            <div class="draw-timelapse" id="draw-timelapse" hidden><img alt=""></div>
        </section>
        <button type="button" class="draw-notice" id="draw-notice">
            <strong>Work in progress</strong>
            <span>Tap for details</span>
        </button>
        <dialog class="draw-sheet" id="draw-notice-dialog">
            <form method="dialog">
                <h2>Work in progress</h2>
                <p class="draw-notice-copy">This is a work in progress. Features may break. It works best on a tablet.</p>
                <div class="draw-sheet-actions">
                    <button type="submit" class="draw-new">OK</button>
                </div>
            </form>
        </dialog>
        <dialog class="draw-sheet draw-create-sheet" id="draw-sheet">
            <form method="dialog" id="draw-create" class="draw-create">
                <header class="draw-create-bar">
                    <button type="button" id="draw-cancel">Cancel</button>
                    <h2>New canvas</h2>
                    <button type="submit" class="draw-new">Create</button>
                </header>
                <div class="draw-create-body">
                    <div class="draw-create-stage">
                        <div class="draw-sheetlet" id="draw-sheetlet"></div>
                        <p id="draw-canvas-preview"></p>
                        <p class="draw-note" id="draw-canvas-physical"></p>
                        <p class="draw-note" id="draw-canvas-memory"></p>
                    </div>
                    <div class="draw-create-settings">
                        <label class="draw-field">Name<input name="title" id="draw-canvas-name" maxlength="80" value="Untitled Canvas"></label>
                        <div class="draw-segment" id="draw-units" role="group" aria-label="Units"></div>
                        <div class="draw-dims">
                            <label class="draw-dim"><span>Width</span><input id="draw-width-input" inputmode="decimal"></label>
                            <button type="button" id="draw-flip" aria-label="Swap width and height" title="Swap width and height">⇄</button>
                            <label class="draw-dim"><span>Height</span><input id="draw-height-input" inputmode="decimal"></label>
                        </div>
                        <input type="hidden" name="width" value="1600">
                        <input type="hidden" name="height" value="1200">
                        <div class="draw-segment" id="draw-dpi" role="group" aria-label="Resolution"></div>
                        <p class="draw-field-label">Paper</p>
                        <div class="draw-bgs" id="draw-bgs"></div>
                        <p class="draw-field-label">Presets</p>
                        <div class="draw-presets" id="draw-presets"></div>
                    </div>
                </div>
            </form>
        </dialog>
        <dialog class="draw-sheet draw-help" id="draw-help">
            <form method="dialog">
                <h2>Studio controls</h2>
                <ul>
                    <li>Draw with one finger, a stylus, or the mouse.</li>
                    <li>Pinch to zoom, twist to rotate, drag with two fingers to pan.</li>
                    <li>Tap with two fingers to undo. Tap with three to redo.</li>
                    <li>Tap Brush, Smudge, or Eraser to open the brush library. Drag those buttons up or down to resize.</li>
                    <li>Hold still on a stroke to snap a line, ellipse, or rectangle.</li>
                    <li>Use Fill to flood a region, or drag the color button onto the canvas to fill a layer.</li>
                    <li>Use Eyedropper, or hold without moving, to pick a color.</li>
                </ul>
                <button type="submit" class="draw-new">Got it</button>
            </form>
        </dialog>`;
}
