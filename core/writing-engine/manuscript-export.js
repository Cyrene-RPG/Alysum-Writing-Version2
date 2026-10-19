/** Storage-free DOCX rendering. The caller supplies docx 9.6.1. */
export function createManuscriptDocument(manuscript, details, library) {
    const { Document, Paragraph, TextRun, Header, PageNumber, AlignmentType, LineRuleType } = library;
    const font = details.font === "Times New Roman" ? "Times New Roman" : "Courier New";
    const run = (text, italic = false) => new TextRun({ text: String(text || ""), italics: italic, font, size: 24, color: "000000" });
    const paragraph = (text, options = {}) => new Paragraph({ children: [run(text)], indent: { firstLine: 0 }, ...options });
    const children = [];
    const wordCount = Math.round(manuscript.words / 100) * 100 || manuscript.words;
    children.push(paragraph(`about ${wordCount.toLocaleString("en-US")} words`, { alignment: AlignmentType.RIGHT, spacing: { line: 240, lineRule: LineRuleType.AUTO } }));
    const contact = [details.legalName, ...String(details.address || "").split(/\r?\n/), details.email].filter(Boolean);
    contact.forEach(text => children.push(paragraph(text, { spacing: { line: 240, lineRule: LineRuleType.AUTO } })));
    children.push(paragraph(manuscript.title, { alignment: AlignmentType.CENTER, spacing: { before: 1800, after: 240 } }));
    children.push(paragraph(`by ${details.authorName || details.legalName || "Anonymous"}`, { alignment: AlignmentType.CENTER, spacing: { after: 480 } }));
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
                children.push(new Paragraph({
                    indent: { firstLine: 720 },
                    children: block.runs.map(item => item.break ? new TextRun({ break: 1 }) : run(item.text, item.italic)),
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
                    children: [run(`${surname} / ${shortTitle} / `), new TextRun({ children: [PageNumber.CURRENT], font, size: 24 })],
                })] }),
                first: new Header({ children: [paragraph("")] }),
            },
            children,
        }],
    });
}
