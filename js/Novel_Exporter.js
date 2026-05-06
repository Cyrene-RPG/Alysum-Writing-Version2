(function () {
    var cb = document.getElementById("neCpOptionalInclude");
    var ta = document.getElementById("neCpOptional");
    if (cb && ta) {
        function syncOptionalAdvisory() {
            ta.disabled = !cb.checked;
        }
        cb.addEventListener("change", syncOptionalAdvisory);
        syncOptionalAdvisory();
    }

    var workspace = document.querySelector(".ne-workspace");
    var preview = document.getElementById("pdfPreviewMount");
    var radios = document.querySelectorAll('input[name="nePageFormat"]');
    var layoutAttrs = ["data-margin-top-in", "data-margin-bottom-in", "data-margin-outer-in", "data-margin-inner-in", "data-bleed-in"];
    var toggleBtn = document.getElementById("neTogglePrintGuides");
    var handRadios = document.querySelectorAll('input[name="nePageHand"]');

    function clearLayoutMarginsBleed() {
        if (!preview) return;
        layoutAttrs.forEach(function (a) {
            preview.removeAttribute(a);
        });
    }

    function setGuideVars(pw, ph, opts) {
        if (!preview) return;
        var bleed = opts.bleed != null ? opts.bleed : 0;
        preview.style.setProperty("--guide-pgw", String(pw));
        preview.style.setProperty("--guide-pgh", String(ph));
        preview.style.setProperty("--guide-bleed", String(bleed));
        preview.style.setProperty("--guide-mt", String(opts.mt));
        preview.style.setProperty("--guide-mb", String(opts.mb));
        preview.style.setProperty("--guide-mi", String(opts.mi));
        preview.style.setProperty("--guide-mo", String(opts.mo));
        preview.classList.toggle("ne-print-guides-no-bleed", bleed <= 0);
    }

    function applyGuideMeasurements() {
        if (!preview) return;
        var fmt = preview.getAttribute("data-format");
        // Trade presets share the same margin/bleed specs (recto gutter on the left).
        if (fmt === "6x9") {
            setGuideVars(6, 9, {
                bleed: 0.125,
                mt: 0.5,
                mb: 0.5,
                mi: 0.75,
                mo: 0.5,
            });
        } else if (fmt === "5x8") {
            setGuideVars(5, 8, {
                bleed: 0.125,
                mt: 0.5,
                mb: 0.5,
                mi: 0.75,
                mo: 0.5,
            });
        } else if (fmt === "letter") {
            setGuideVars(8.5, 11, {
                bleed: 0,
                mt: 0.5,
                mb: 0.5,
                mi: 0.5,
                mo: 0.5,
            });
        } else {
            setGuideVars(5, 8, {
                bleed: 0.125,
                mt: 0.5,
                mb: 0.5,
                mi: 0.75,
                mo: 0.5,
            });
        }
    }

    function applyPageFormat(value) {
        clearLayoutMarginsBleed();

        if (value === "letter") {
            preview.setAttribute("data-format", "letter");
            preview.setAttribute("data-page-width-in", "8.5");
            preview.setAttribute("data-page-height-in", "11");
        } else if (value === "6x9") {
            preview.setAttribute("data-format", "6x9");
            preview.setAttribute("data-page-width-in", "6");
            preview.setAttribute("data-page-height-in", "9");
            preview.setAttribute("data-margin-top-in", "0.5");
            preview.setAttribute("data-margin-bottom-in", "0.5");
            preview.setAttribute("data-margin-outer-in", "0.5");
            preview.setAttribute("data-margin-inner-in", "0.75");
            preview.setAttribute("data-bleed-in", "0.125");
        } else {
            preview.setAttribute("data-format", "5x8");
            preview.setAttribute("data-page-width-in", "5");
            preview.setAttribute("data-page-height-in", "8");
            preview.setAttribute("data-margin-top-in", "0.5");
            preview.setAttribute("data-margin-bottom-in", "0.5");
            preview.setAttribute("data-margin-outer-in", "0.5");
            preview.setAttribute("data-margin-inner-in", "0.75");
            preview.setAttribute("data-bleed-in", "0.125");
        }
        applyGuideMeasurements();
    }

    function applyPageHand(value) {
        if (!preview) return;
        var verso = value === "verso";
        preview.setAttribute("data-page-hand", verso ? "verso" : "recto");
        preview.classList.toggle("ne-preview-page--verso", verso);
    }

    if (preview && radios.length) {
        radios.forEach(function (el) {
            el.addEventListener("change", function () {
                if (el.checked) applyPageFormat(el.value);
            });
        });
        var picked = document.querySelector('input[name="nePageFormat"]:checked');
        if (picked) applyPageFormat(picked.value);
        else applyGuideMeasurements();
    }

    if (preview && handRadios.length) {
        handRadios.forEach(function (el) {
            el.addEventListener("change", function () {
                if (el.checked) applyPageHand(el.value);
            });
        });
        var handPicked = document.querySelector('input[name="nePageHand"]:checked');
        if (handPicked) applyPageHand(handPicked.value);
    }

    if (workspace && toggleBtn && preview) {
        var guidesLayer = preview.querySelector(".ne-preview-print-guides");

        function syncGuideOverlayVisibility() {
            var on = toggleBtn.getAttribute("aria-pressed") === "true";
            workspace.classList.toggle("ne-print-guides-on", on);
            if (guidesLayer) {
                guidesLayer.setAttribute("aria-hidden", on ? "false" : "true");
            }
        }

        toggleBtn.addEventListener("click", function () {
            var on = toggleBtn.getAttribute("aria-pressed") !== "true";
            toggleBtn.setAttribute("aria-pressed", on ? "true" : "false");
            syncGuideOverlayVisibility();
        });
        syncGuideOverlayVisibility();
    }

    var newPageBtn = document.getElementById("neChapterNewPageEach");
    var dropCapBtn = document.getElementById("neChapterDropCap");

    function bindPreviewFlagToggle(btn, dataAttr) {
        if (!preview || !btn) return;
        function sync() {
            var on = btn.getAttribute("aria-pressed") === "true";
            preview.setAttribute(dataAttr, on ? "true" : "false");
        }
        btn.addEventListener("click", function () {
            var on = btn.getAttribute("aria-pressed") !== "true";
            btn.setAttribute("aria-pressed", on ? "true" : "false");
            sync();
        });
        sync();
    }

    bindPreviewFlagToggle(newPageBtn, "data-chapter-new-page");
    bindPreviewFlagToggle(dropCapBtn, "data-chapter-drop-cap");
})();
