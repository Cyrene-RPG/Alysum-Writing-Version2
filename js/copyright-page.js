/** @typedef {{ year: string, holder: string, contact: string, editionYear: string, imprint: string, publisherLocation: string, isbn: string, coverDesignBy: string, editingBy: string, printedIn: string, optionalOn: boolean, optionalText: string }} CopyrightFields */

const FIELD_IDS = {
    year: "edCpYear",
    holder: "edCpHolderName",
    contact: "edCpContact",
    editionYear: "edCpEditionYear",
    imprint: "edCpImprint",
    publisherLocation: "edCpPublisherLoc",
    isbn: "edCpIsbn",
    coverDesignBy: "edCpCoverDesign",
    editingBy: "edCpEditingBy",
    printedIn: "edCpPrintedIn",
    optionalOn: "edCpOptionalInclude",
    optionalText: "edCpOptional",
};

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/** @param {Partial<CopyrightFields>} defaults @returns {CopyrightFields} */
export function emptyCopyrightFields(defaults = {}) {
    const year = String(new Date().getFullYear());
    return {
        year: defaults.year ?? year,
        holder: defaults.holder ?? "",
        contact: defaults.contact ?? "",
        editionYear: defaults.editionYear ?? year,
        imprint: defaults.imprint ?? "",
        publisherLocation: defaults.publisherLocation ?? "",
        isbn: defaults.isbn ?? "",
        coverDesignBy: defaults.coverDesignBy ?? "",
        editingBy: defaults.editingBy ?? "",
        printedIn: defaults.printedIn ?? "",
        optionalOn: !!defaults.optionalOn,
        optionalText: defaults.optionalText ?? "",
    };
}

export function isCopyrightChapter(section, index, chapter) {
    if (section !== "front" || index !== 0) return false;
    const title = String(chapter?.title || "").trim().toLowerCase();
    return !title || title === "copyright" || /^copyright\b/.test(title);
}

/** @param {CopyrightFields} fields */
export function buildCopyrightHtml(fields) {
    const f = emptyCopyrightFields(fields);
    const year = escapeHtml(f.year);
    const holder = escapeHtml(f.holder);
    const blocks = [];

    blocks.push(`<p>Copyright © ${year || "____"}${holder ? ` by ${holder}` : ""}</p>`);
    blocks.push("<p>All rights reserved.</p>");
    blocks.push(
        "<p>No part of this publication may be reproduced, distributed, stored in a retrieval system, or transmitted in any form or by any means—electronic, mechanical, photocopying, recording, scanning, or otherwise—without the prior written permission of the publisher or copyright owner, except in the case of brief quotations embodied in critical reviews and certain other noncommercial uses permitted by copyright law.</p>"
    );
    blocks.push(
        "<p>This book is protected under international and domestic copyright laws and treaties. Any unauthorized use of the material contained herein may violate copyright, trademark, and other applicable laws and could result in criminal or civil penalties.</p>"
    );
    blocks.push(
        "<p>This is a work of fiction. Names, characters, businesses, organizations, places, events, and incidents are either the product of the author’s imagination or used fictitiously. Any resemblance to actual persons, living or dead, or actual events is purely coincidental.</p>"
    );
    blocks.push("<p>The author asserts the moral right to be identified as the author of this work.</p>");
    blocks.push(
        "<p>No part of this book may be used, reproduced, or transmitted in any manner for the purpose of training, developing, or improving machine learning systems, artificial intelligence models, or similar technologies without the express written consent of the copyright owner. This includes, but is not limited to, text and data mining, scraping, or inclusion in datasets used for training artificial intelligence systems.</p>"
    );

    if (f.contact) {
        blocks.push(`<p>For information about permissions, rights, or licensing requests, contact:<br>${escapeHtml(f.contact)}</p>`);
    }
    if (f.editionYear) blocks.push(`<p>First Edition: ${escapeHtml(f.editionYear)}</p>`);
    if (f.imprint) blocks.push(`<p>Published by ${escapeHtml(f.imprint)}</p>`);
    if (f.publisherLocation) blocks.push(`<p>${escapeHtml(f.publisherLocation)}</p>`);
    if (f.isbn) blocks.push(`<p>ISBN: ${escapeHtml(f.isbn)}</p>`);
    if (f.coverDesignBy) blocks.push(`<p>Cover design by: ${escapeHtml(f.coverDesignBy)}</p>`);
    if (f.editingBy) blocks.push(`<p>Editing by: ${escapeHtml(f.editingBy)}</p>`);
    if (f.printedIn) blocks.push(`<p>Printed in ${escapeHtml(f.printedIn)}</p>`);
    if (f.optionalOn && f.optionalText) {
        blocks.push(`<p>${escapeHtml(f.optionalText).replace(/\n+/g, "<br>")}</p>`);
    }

    return blocks.join("");
}

/** @returns {CopyrightFields} */
export function readCopyrightFieldsFromDom(root = document) {
    const get = (id) => root.getElementById(id);
    return emptyCopyrightFields({
        year: get(FIELD_IDS.year)?.value,
        holder: get(FIELD_IDS.holder)?.value,
        contact: get(FIELD_IDS.contact)?.value,
        editionYear: get(FIELD_IDS.editionYear)?.value,
        imprint: get(FIELD_IDS.imprint)?.value,
        publisherLocation: get(FIELD_IDS.publisherLocation)?.value,
        isbn: get(FIELD_IDS.isbn)?.value,
        coverDesignBy: get(FIELD_IDS.coverDesignBy)?.value,
        editingBy: get(FIELD_IDS.editingBy)?.value,
        printedIn: get(FIELD_IDS.printedIn)?.value,
        optionalOn: !!get(FIELD_IDS.optionalOn)?.checked,
        optionalText: get(FIELD_IDS.optionalText)?.value,
    });
}

/** @param {CopyrightFields} fields @param {ParentNode} root */
export function writeCopyrightFieldsToDom(fields, root = document) {
    const f = emptyCopyrightFields(fields);
    const set = (id, value) => {
        const el = root.getElementById(id);
        if (el) el.value = value ?? "";
    };
    set(FIELD_IDS.year, f.year);
    set(FIELD_IDS.holder, f.holder);
    set(FIELD_IDS.contact, f.contact);
    set(FIELD_IDS.editionYear, f.editionYear);
    set(FIELD_IDS.imprint, f.imprint);
    set(FIELD_IDS.publisherLocation, f.publisherLocation);
    set(FIELD_IDS.isbn, f.isbn);
    set(FIELD_IDS.coverDesignBy, f.coverDesignBy);
    set(FIELD_IDS.editingBy, f.editingBy);
    set(FIELD_IDS.printedIn, f.printedIn);
    const optionalOn = root.getElementById(FIELD_IDS.optionalOn);
    const optionalText = root.getElementById(FIELD_IDS.optionalText);
    if (optionalOn) optionalOn.checked = !!f.optionalOn;
    if (optionalText) {
        optionalText.value = f.optionalText;
        optionalText.disabled = !f.optionalOn;
    }
}

export function bindCopyrightOptionalToggle(root = document) {
    const optionalOn = root.getElementById(FIELD_IDS.optionalOn);
    const optionalText = root.getElementById(FIELD_IDS.optionalText);
    if (!optionalOn || !optionalText) return;
    optionalOn.addEventListener("change", () => {
        optionalText.disabled = !optionalOn.checked;
        if (!optionalOn.checked) optionalText.value = "";
    });
}
