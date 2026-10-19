/** Synthetic writing only. No user manuscripts or profile details. */
export const sampleBook = {
    id: "editor-test-sample",
    title: "The Lantern Test",
    words: 0,
    sections: {
        front: [{ id: "test-front", title: "Dedication", content: "<p>For the testers.</p>" }],
        body: [{ id: "test-part", kind: "folder", title: "Part One", children: [
            { id: "test-chapter-one", title: "The Arrival", content: '<p>The lantern glowed in the <em>quiet</em> harbor.</p><p>A second paragraph with <strong>bold</strong> and <span style="font-style:italic">italic words</span>.</p><p class="scene-break scene-break--stars" contenteditable="false"><span class="scene-break-glyph"></span></p><p>After the break, she waited.</p>', notes: [{ id: "test-note", kind: "note", title: "Private note", content: "<p>This note must not be exported.</p>" }] },
            { id: "test-chapter-two", title: "The List", content: "<p>Supplies:</p><ul><li>Paper</li><li>Ink<ul><li>Blue ink</li></ul></li></ul><ol><li>Open the door</li><li>Light the lantern</li></ol><blockquote><p>Remember the way home.</p></blockquote><p>Final words — café, 星, &amp; hope.</p>" },
        ] }],
        back: [{ id: "test-back", title: "Afterword", content: "<p>The end.</p>" }],
    },
    publish_meta: { testMarker: "preserve this metadata" },
    published_chapter_ids: [],
    is_published: false,
};
