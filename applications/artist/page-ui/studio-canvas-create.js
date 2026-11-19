import {
    CANVAS_PRESETS,
    PAPER_COLORS,
    canvasMemoryMb,
    clampDpi,
    measureFromPixels,
    pixelsFromMeasure,
    screenCanvasSize,
    undoLimitFor,
} from "@alysum/artist/studio.js";

export function mountCanvasCreator(root, onCreate) {
    const form = root.querySelector("#draw-create");
    const presets = root.querySelector("#draw-presets");
    const papers = root.querySelector("#draw-bgs");
    const units = root.querySelector("#draw-units");
    const dpiRow = root.querySelector("#draw-dpi");
    const widthInput = root.querySelector("#draw-width-input");
    const heightInput = root.querySelector("#draw-height-input");
    const sheetlet = root.querySelector("#draw-sheetlet");
    const preview = root.querySelector("#draw-canvas-preview");
    const physical = root.querySelector("#draw-canvas-physical");
    const memory = root.querySelector("#draw-canvas-memory");
    const custom = document.createElement("input");
    custom.type = "color";
    custom.value = "#7eb6ff";
    custom.setAttribute("aria-label", "Custom paper color");
    const setup = { unit: "px", dpi: 300, background: "#ffffff", presetId: "sketch" };

    function pixels() {
        return { width: Number(form.width.value), height: Number(form.height.value) };
    }

    function setPixels(width, height) {
        form.width.value = String(pixelsFromMeasure(width, "px", setup.dpi));
        form.height.value = String(pixelsFromMeasure(height, "px", setup.dpi));
    }

    function writeMeasures() {
        const size = pixels();
        const width = measureFromPixels(size.width, setup.unit, setup.dpi);
        const height = measureFromPixels(size.height, setup.unit, setup.dpi);
        widthInput.value = setup.unit === "px" ? String(Math.round(width)) : width.toFixed(2);
        heightInput.value = setup.unit === "px" ? String(Math.round(height)) : height.toFixed(2);
    }

    function readMeasures() {
        setPixels(
            pixelsFromMeasure(widthInput.value, setup.unit, setup.dpi),
            pixelsFromMeasure(heightInput.value, setup.unit, setup.dpi),
        );
        const size = pixels();
        const match = CANVAS_PRESETS.find((preset) => preset.width === size.width && preset.height === size.height);
        setup.presetId = match ? match.id : "";
        refresh();
    }

    function screenBox() {
        const view = window.visualViewport;
        return {
            width: view?.width || window.innerWidth,
            height: view?.height || window.innerHeight,
            top: view?.offsetTop || 0,
            left: view?.offsetLeft || 0,
        };
    }

    function placeDialog() {
        const dialog = root.querySelector("#draw-sheet");
        if (!dialog) return;
        if (!dialog.open) {
            dialog.style.position = "";
            dialog.style.margin = "";
            dialog.style.top = "";
            dialog.style.left = "";
            dialog.style.right = "";
            dialog.style.bottom = "";
            dialog.style.width = "";
            dialog.style.height = "";
            return;
        }
        const box = screenBox();
        const margin = 8;
        dialog.style.position = "fixed";
        dialog.style.margin = "0";
        dialog.style.top = `${Math.round(box.top + margin)}px`;
        dialog.style.left = `${Math.round(box.left + margin)}px`;
        dialog.style.right = "auto";
        dialog.style.bottom = "auto";
        dialog.style.width = `${Math.max(0, Math.round(box.width - margin * 2))}px`;
        dialog.style.height = `${Math.max(0, Math.round(box.height - margin * 2))}px`;
    }

    function previewBudget() {
        const stage = sheetlet.parentElement;
        const columns = getComputedStyle(stage.parentElement).gridTemplateColumns.trim().split(/\s+/).filter(Boolean);
        const sideBySide = columns.length > 1 && stage.clientWidth > 80 && stage.clientHeight > 80;
        if (sideBySide) {
            const style = getComputedStyle(stage);
            const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
            const padY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
            const gap = parseFloat(style.rowGap) || parseFloat(style.gap) || 0;
            const captions = [...stage.querySelectorAll("p")];
            const captionHeight = captions.reduce((sum, node) => sum + node.offsetHeight, 0);
            return {
                availW: Math.max(24, stage.clientWidth - padX),
                availH: Math.max(24, stage.clientHeight - padY - captionHeight - gap * captions.length),
            };
        }
        const box = screenBox();
        const wide = box.width >= 680;
        return {
            availW: Math.max(72, Math.min(440, box.width - 64)),
            availH: Math.max(64, Math.min(wide ? 280 : 220, box.height * (wide ? 0.34 : 0.28))),
        };
    }

    function refresh() {
        const size = pixels();
        const inchesW = measureFromPixels(size.width, "in", setup.dpi);
        const inchesH = measureFromPixels(size.height, "in", setup.dpi);
        preview.textContent = `${size.width} × ${size.height} px`;
        physical.textContent = `${inchesW.toFixed(2)} × ${inchesH.toFixed(2)} in · ${setup.dpi} DPI`;
        const mb = canvasMemoryMb(size.width, size.height);
        const amount = mb >= 10 ? String(Math.round(mb)) : mb.toFixed(1);
        memory.textContent = undoLimitFor(size.width, size.height) < 24
            ? `About ${amount} MB for one layer. Undo history is shorter at this size.`
            : `About ${amount} MB for one layer.`;
        placeDialog();
        void sheetlet.parentElement?.parentElement?.offsetHeight;
        const { availW, availH } = previewBudget();
        const scale = Math.min(availW / size.width, availH / size.height);
        sheetlet.style.width = `${Math.max(1, Math.round(size.width * scale))}px`;
        sheetlet.style.height = `${Math.max(1, Math.round(size.height * scale))}px`;
        sheetlet.style.background = setup.background === "transparent"
            ? "repeating-conic-gradient(#d8d8dc 0% 25%, #f4f4f6 0% 50%) 50% / 18px 18px"
            : setup.background;
        for (const button of presets.querySelectorAll("button")) {
            button.classList.toggle("is-on", button.dataset.preset === setup.presetId);
            const page = button.querySelector("i");
            if (page) page.style.background = sheetlet.style.background;
        }
        for (const button of papers.querySelectorAll("button")) {
            button.classList.toggle("is-on", button.dataset.paper === setup.background);
        }
        for (const button of units.querySelectorAll("button")) button.classList.toggle("is-on", button.dataset.unit === setup.unit);
        for (const button of dpiRow.querySelectorAll("button")) button.classList.toggle("is-on", Number(button.dataset.dpi) === setup.dpi);
        writeMeasures();
    }

    function choosePreset(preset) {
        setup.presetId = preset.id;
        setup.unit = "px";
        if (preset.width === 0) {
            const screen = screenCanvasSize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
            setPixels(screen.width, screen.height);
        } else setPixels(preset.width, preset.height);
        refresh();
    }

    for (const [id, label] of [["px", "Pixels"], ["in", "Inches"], ["cm", "Centimeters"]]) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.unit = id;
        button.textContent = label;
        button.addEventListener("click", () => { setup.unit = id; refresh(); });
        units.append(button);
    }
    for (const [dpi, label] of [[72, "72 Web"], [132, "132 Screen"], [300, "300 Print"]]) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.dpi = String(dpi);
        button.textContent = label;
        button.addEventListener("click", () => {
            const size = pixels();
            const width = measureFromPixels(size.width, setup.unit, setup.dpi);
            const height = measureFromPixels(size.height, setup.unit, setup.dpi);
            setup.dpi = clampDpi(dpi);
            if (setup.unit === "px") setPixels(size.width, size.height);
            else {
                setPixels(pixelsFromMeasure(width, setup.unit, setup.dpi), pixelsFromMeasure(height, setup.unit, setup.dpi));
                setup.presetId = "";
            }
            refresh();
        });
        dpiRow.append(button);
    }
    for (const paper of PAPER_COLORS) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.paper = paper.value;
        button.setAttribute("aria-label", paper.name);
        button.title = paper.name;
        button.style.background = paper.value === "transparent"
            ? "repeating-conic-gradient(#d8d8dc 0% 25%, #f4f4f6 0% 50%) 50% / 12px 12px"
            : paper.value;
        button.addEventListener("click", () => { setup.background = paper.value; refresh(); });
        papers.append(button);
    }
    custom.addEventListener("input", () => { setup.background = custom.value; refresh(); });
    papers.append(custom);
    for (const preset of CANVAS_PRESETS) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.preset = preset.id;
        const page = document.createElement("i");
        const sample = preset.width === 0 ? { width: 3, height: 4 } : preset;
        const side = 42 / Math.max(sample.width, sample.height);
        page.style.width = `${Math.max(12, Math.round(sample.width * side))}px`;
        page.style.height = `${Math.max(12, Math.round(sample.height * side))}px`;
        const name = document.createElement("strong");
        name.textContent = preset.name;
        const meta = document.createElement("span");
        meta.textContent = preset.width === 0 ? "This device" : `${preset.width} × ${preset.height}`;
        button.append(page, name, meta);
        button.addEventListener("click", () => choosePreset(preset));
        presets.append(button);
    }
    widthInput.addEventListener("change", readMeasures);
    heightInput.addEventListener("change", readMeasures);
    root.querySelector("#draw-flip").addEventListener("click", () => {
        const size = pixels();
        setPixels(size.height, size.width);
        const next = pixels();
        const found = CANVAS_PRESETS.find((preset) => preset.width === next.width && preset.height === next.height);
        setup.presetId = found ? found.id : "";
        refresh();
    });
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        readMeasures();
        const size = pixels();
        const name = String(new FormData(form).get("title") || "").trim() || "Untitled Canvas";
        onCreate({ width: size.width, height: size.height, background: setup.background, name });
    });
    choosePreset(CANVAS_PRESETS.find((preset) => preset.id === "sketch"));
    const refit = () => {
        if (root.querySelector("#draw-sheet")?.open) refresh();
    };
    window.addEventListener("resize", refit);
    window.visualViewport?.addEventListener("resize", refit);
    window.visualViewport?.addEventListener("scroll", refit);
    root.querySelector("#draw-sheet")?.addEventListener("toggle", refit);
}

