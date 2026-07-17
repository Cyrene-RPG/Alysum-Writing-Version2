/**
 * Story Wiki page boot — hub loads with minimal imports; full workspace loads only for ?book=.
 */
import { supabase } from "../firebase.js";
import { requireStudioSession } from "./studio-session.js?v=3";
import { loadStoryWikiHub } from "./story-wiki-hub.js?v=3";
import { isStoryBibleUiEnabled, STORY_BIBLE_PREF_KEY, STORY_BIBLE_PREF_EVENT } from "./story-bible-prefs.js?v=1";

function byId(id) {
    return document.getElementById(id);
}

function bookIdFromUrl() {
    return (new URLSearchParams(window.location.search).get("book") || "").trim();
}

function applyStoryBiblePageGate() {
    const disabled = byId("sbDisabled");
    const root = byId("sbEnabledRoot");
    const hub = byId("sbHubView");
    if (!disabled || !root) return !isStoryBibleUiEnabled();
    const off = !isStoryBibleUiEnabled();
    disabled.classList.toggle("hidden", !off);
    root.classList.toggle("hidden", off);
    hub?.classList.toggle("hidden", off);
    return off;
}

function collectMountOpts(uid) {
    return {
        supabase,
        uid,
        statusEl: byId("sbStatusLine"),
        hubView: byId("sbHubView"),
        bookView: byId("sbBookView"),
        bookGrid: byId("sbBookGrid"),
        charList: byId("sbCharList"),
        placeList: byId("sbPlaceList"),
        charGrid: byId("sbCharGrid"),
        placeGrid: byId("sbPlaceGrid"),
        objectGrid: byId("sbObjectGrid"),
        placeSearch: byId("sbPlaceSearch"),
        objectSearch: byId("sbObjectSearch"),
        rosterSearch: byId("sbRosterSearch"),
        newCharBtn: byId("sbNewChar"),
        newPlaceBtn: byId("sbNewPlace"),
        newObjectBtn: byId("sbNewObject"),
        tabCharsBtn: byId("sbTabChars"),
        tabPlacesBtn: byId("sbTabPlaces"),
        tabObjectsBtn: byId("sbTabObjects"),
        asideCharsEl: byId("sbAsideChars"),
        asidePlacesEl: byId("sbAsidePlaces"),
        asideObjectsEl: byId("sbAsideObjects"),
        charFieldsEl: byId("sbFormCharFields"),
        placeFieldsEl: byId("sbFormPlaceFields"),
        placeParentEl: byId("sbFormPlaceParent"),
        charIdentityEl: byId("sbFormCharIdentity"),
        deceasedFieldEl: byId("sbFormDeceasedField"),
        entryHeroEl: byId("sbEntryHero"),
        editorDrawer: byId("sbEditorDrawer"),
        drawerClose: byId("sbDrawerClose"),
        formTitleEl: byId("sbFormTitle"),
        dirtyEl: byId("sbDirty"),
        healthBarEl: byId("sbHealthBar"),
        healthSummaryEl: byId("sbHealthSummary"),
        healthWarnEl: byId("sbHealthWarn"),
        labelNameEl: byId("sbLabelName"),
        labelAliasesEl: byId("sbLabelAliases"),
        saveCharBtn: byId("sbSaveChar"),
        deleteCharBtn: byId("sbDeleteChar"),
        moveEntryBtn: byId("sbMoveEntry"),
        openEditorLink: byId("sbOpenEditor"),
        openStoryBoardLink: byId("sbOpenStoryBoard"),
        importEditorLink: byId("sbImportEditorLink"),
        bookTitleEl: byId("sbBookTitle"),
        sidebarMetaEl: byId("sbSidebarMeta"),
        viewHeadingEl: byId("sbViewHeading"),
        fields: {
            name: byId("sbName"),
            aliases: byId("sbAliases"),
            pronouns: byId("sbPronouns"),
            status: byId("sbCharStatus"),
            deceased: byId("sbDeceased"),
            placeKind: byId("sbPlaceKind"),
            placeParent: byId("sbPlaceParent"),
            age: byId("sbAge"),
            eyes: byId("sbEyes"),
            hair: byId("sbHair"),
            height: byId("sbHeight"),
            skin: byId("sbSkin"),
            build: byId("sbBuild"),
            distinctive: byId("sbDistinctive"),
            tags: byId("sbTags"),
            introduced: byId("sbIntroduced"),
            notes: byId("sbNotes")
        },
        scanBtn: byId("sbScanBtn"),
        scanResultsEl: byId("sbScanResults"),
        scanLooseCheck: byId("sbScanLoose"),
        enrichBtn: byId("sbEnrichBtn"),
        enrichResultsEl: byId("sbEnrichResults"),
        scanDrawerEl: byId("sbScanDrawer"),
        scanDrawerClose: byId("sbScanDrawerClose"),
        scanDrawerSummary: byId("sbScanDrawerSummary")
    };
}

function showHubBootError(message) {
    const hubLoading = byId("sbHubLoading");
    const bookGrid = byId("sbBookGrid");
    const statusEl = byId("sbStatusLine");
    const html =
        `<div class="sb-empty">${message}<br>` +
        `<a class="sb-link" href="writer-dashboard.html">Open Studio</a> · ` +
        `<a class="sb-link" href="login.html?next=${encodeURIComponent("story-bible.html")}">Sign in</a></div>`;
    if (bookGrid) bookGrid.innerHTML = html;
    else if (hubLoading) hubLoading.outerHTML = html;
    if (statusEl) {
        statusEl.textContent = "Story Wiki failed to load.";
        statusEl.classList.add("is-error");
    }
}

/**
 * Boot Story Wiki — hub-only when no ?book=; full codex when opening a book wiki.
 */
export async function bootStoryWikiPage() {
    const hubLoading = byId("sbHubLoading");
    const bookGrid = byId("sbBookGrid");
    const statusEl = byId("sbStatusLine");
    const explicitBookId = bookIdFromUrl();

    window.addEventListener("storage", e => {
        if (e.key === STORY_BIBLE_PREF_KEY) location.reload();
    });
    window.addEventListener(STORY_BIBLE_PREF_EVENT, () => location.reload());

    let session;
    try {
        session = await requireStudioSession(supabase, "story-bible.html" + window.location.search);
    } catch (e) {
        console.error("[story-wiki-boot] session failed:", e);
        showHubBootError("Could not verify your session. Try signing in again.");
        return;
    }

    if (!session) {
        if (hubLoading) hubLoading.textContent = "Redirecting to sign in…";
        return;
    }

    if (applyStoryBiblePageGate()) return;

    if (!explicitBookId) {
        document.body.classList.remove("sw-wp-book-open");
        byId("sbHubView")?.classList.remove("hidden");
        byId("sbBookView")?.classList.add("hidden");
        try {
            await loadStoryWikiHub(supabase, session.user.id, bookGrid, statusEl);
        } catch (e) {
            console.error("[story-wiki-boot] hub failed:", e);
            showHubBootError(
                `Could not load your books. ${e?.message || "Check your connection and refresh."}`
            );
        }
        return;
    }

    document.body.classList.add("sw-wp-book-open");
    byId("sbHubView")?.classList.add("hidden");
    byId("sbBookView")?.classList.remove("hidden");

    try {
        const { mountUnifiedStoryBible } = await import("./story-bible-unified.js?v=19");
        await mountUnifiedStoryBible(collectMountOpts(session.user.id));
    } catch (e) {
        console.error("[story-wiki-boot] workspace failed:", e);
        showHubBootError(
            "This book wiki failed to load. Hard refresh (Ctrl+Shift+R) or pick another book from " +
                '<a class="sb-link" href="story-bible.html">All books</a>.'
        );
    }
}
