import { createSnippetDownloadApi } from "/core/publishing/snippet-download.js";
import { createExcerptApi } from "/core/publishing/excerpts.js";
import { createBetaReadApi } from "../beta-read-api.js";
import { mountSnippetSharing } from "../snippets.js";
import { mountBetaReadSharing } from "../beta-read-sharing.js";

/** Excerpt Share + standalone Beta Read mounts for the editor chrome. */
export function mountEditorSharing({ supabase, getBook, getAuthor, origin = window.location.origin }) {
    mountSnippetSharing({
        button: document.getElementById("share-snippet"),
        excerptApi: createExcerptApi(supabase, { origin }),
        downloadApi: createSnippetDownloadApi(supabase, { origin, getBook }),
        pageEl: document.getElementById("pageEditor"),
        getBook,
        getAuthor,
    });
    mountBetaReadSharing({
        button: document.getElementById("share-beta-read"),
        getBook,
        getAuthor,
        api: createBetaReadApi(supabase, { origin }),
    });
}
