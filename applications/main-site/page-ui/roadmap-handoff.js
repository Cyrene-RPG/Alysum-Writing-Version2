import { openRoadmap } from "@alysum/authentication/open-roadmap.js";

const SECTIONS = new Set(["report", "bugs", "suggestions"]);

function sectionFromHash() {
    const raw = String(location.hash || "").replace(/^#/, "").split("&")[0].split("=")[0];
    return SECTIONS.has(raw) ? raw : "";
}

void openRoadmap(sectionFromHash());
