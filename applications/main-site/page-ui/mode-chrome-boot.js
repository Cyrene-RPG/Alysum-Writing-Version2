/**
 * Sync boot: hide Writer toolbar before modules load when UI mode is Reader.
 * Keep this file import-free so it can run as a classic blocking script.
 */
(function () {
    var KEY = "alysum-ui-mode";
    var path = location.pathname || "";
    var onReaderPath = path === "/reader" || path.indexOf("/reader/") === 0;
    var mode = null;
    try {
        mode = sessionStorage.getItem(KEY);
        if (onReaderPath) sessionStorage.setItem(KEY, "library");
    } catch (e) {}
    if (!(onReaderPath || mode === "library")) return;

    var writer =
        document.getElementById("writerSettingsNav") ||
        document.getElementById("writerOverviewNav") ||
        document.getElementById("writerConnectionsNav") ||
        document.getElementById("writerInboxNav") ||
        document.getElementById("writerUpdatesNav") ||
        document.getElementById("writerLibraryNav") ||
        document.querySelector(".wd-nav-wrap");
    var reader = document.getElementById("reader-icons");
    if (writer) writer.hidden = true;
    if (reader) reader.hidden = false;
    document.body.classList.add("reader-shell");
})();
