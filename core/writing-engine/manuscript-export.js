/** Storage-free DOCX rendering. The caller supplies docx 9.6.1. */
export function createManuscriptDocument(manuscript, details, library) {
    const { Document, Paragraph, TextRun, Header, PageNumber, AlignmentType, LineRuleType, Tab, TabStopType } = library;
    const font = details.font === "Times New Roman" ? "Times New Roman" : "Courier New";
    const run = (text, italic = false) => new TextRun({ text: String(text || ""), italics: italic, font, size: 24, color: "000000" });
    const doubleSpacing = { before: 0, after: 0, line: 480, lineRule: LineRuleType.AUTO };
    const singleSpacing = { before: 0, after: 0, line: 240, lineRule: LineRuleType.AUTO };
    const paragraph = (text, options = {}) => new Paragraph({
        children: [run(text)], indent: { firstLine: 0, left: 0, right: 0 }, ...options,
        spacing: { ...doubleSpacing, ...options.spacing },
    });
    const children = [];
    const wordCount = Math.round(manuscript.words / 100) * 100 || manuscript.words;
    children.push(new Paragraph({
        alignment: AlignmentType.LEFT,
        indent: { firstLine: 0, left: 0, right: 0 },
        spacing: singleSpacing,
        // US Letter minus two one-inch margins: align count to the text's right edge.
        tabStops: [{ type: TabStopType.RIGHT, position: 9360 }],
        children: [run(details.legalName || ""), new TextRun({ children: [new Tab()] }), run(`about ${wordCount.toLocaleString("en-US")} words`)],
    }));
    const contact = [...String(details.address || "").split(/\r?\n/), details.email].filter(Boolean);
    contact.forEach(text => children.push(paragraph(text, { spacing: singleSpacing })));
    children.push(paragraph(manuscript.title, { alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 1800, after: 240 } }));
    children.push(paragraph(`by ${details.authorName || details.legalName || "Anonymous"}`, { alignment: AlignmentType.CENTER, keepNext: true, spacing: { after: 480 } }));
    manuscript.chapters.forEach((chapter, index) => {
        const showHeading = details.layout !== "story" || index > 0;
        if (showHeading) children.push(paragraph(chapter.title, {
            pageBreakBefore: true,
            alignment: AlignmentType.CENTER,
            spacing: { before: 1440, after: 480 },
        }));
        chapter.paragraphs.forEach(block => {
            if (block.sceneBreak) {
                children.push(paragraph("#", { alignment: AlignmentType.CENTER }));
            } else {
                // Replace pasted paragraph-leading tabs/spaces with the preset's
                // real indent, without changing the stored HTML or the source runs.
                let atStart = true;
                const normalizedRuns = block.runs.map(item => {
                    if (item.break) { atStart = false; return item; }
                    const text = atStart ? String(item.text || "").replace(/^[\t \u00a0]+/, "") : item.text;
                    if (text) atStart = false;
                    return { ...item, text };
                });
                children.push(new Paragraph({
                    alignment: AlignmentType.LEFT,
                    indent: { firstLine: 720, left: 0, right: 0 },
                    spacing: doubleSpacing,
                    children: normalizedRuns.map(item => item.break ? new TextRun({ break: 1 }) : run(item.text, item.italic)),
                }));
            }
        });
    });
    const surname = String(details.headerName || details.authorName || details.legalName || "Author").trim();
    const shortTitle = details.shortTitle || manuscript.title;
    return new Document({
        title: manuscript.title,
        creator: details.authorName || details.legalName || "",
        styles: { default: { document: {
            run: { font, size: 24, color: "000000" },
            paragraph: { spacing: { before: 0, after: 0, line: 480, lineRule: LineRuleType.AUTO }, alignment: AlignmentType.LEFT },
        } } },
        sections: [{
            properties: {
                titlePage: details.hideFirstHeader !== false,
                page: {
                    size: { width: 12240, height: 15840 },
                    margin: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 720, footer: 720 },
                },
            },
            headers: {
                default: new Header({ children: [new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    indent: { firstLine: 0, left: 0, right: 0 },
                    spacing: singleSpacing,
                    children: [run(`${surname} / ${shortTitle} / `), new TextRun({ children: [PageNumber.CURRENT], font, size: 24 })],
                })] }),
                first: new Header({ children: [paragraph("")] }),
            },
            children,
        }],
    });
}
