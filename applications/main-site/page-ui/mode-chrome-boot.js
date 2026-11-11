/**
 * Sync boot: hide Writer toolbar before modules load when UI mode is Reader.
 * Keep this file import-free so it can run as a classic blocking script.
 */
(function () {
    var KEY = "alysum-ui-mode";
    var mode = null;
    try {
        mode = sessionStorage.getItem(KEY);
    } catch (e) {}
    if (mode !== "library") return;

    var writer =
        document.getElementById("writerSettingsNav") ||
        document.getElementById("writerOverviewNav") ||
        document.getElementById("writerConnectionsNav") ||
        document.getElementById("writerInboxNav") ||
        document.querySelector(".wd-nav-wrap");
    var reader = document.getElementById("reader-icons");
    if (writer) writer.hidden = true;
    if (reader) reader.hidden = false;
    document.body.classList.add("reader-shell");
})();
