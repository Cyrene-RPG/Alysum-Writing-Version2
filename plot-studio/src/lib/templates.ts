import type { Act, PlotStudioState, Story, StructureTemplate } from "../types";
import { createId, DEFAULT_PLOTLINES } from "../types";

const STORAGE_PREFIX = "alysum-plot-doctor";

function storageKey(bookId?: string): string {
  const id = (bookId || "").trim() || "standalone";
  return `${STORAGE_PREFIX}-${id}-v1`;
}

export interface TemplateDef {
  id: StructureTemplate;
  label: string;
  description: string;
  acts: Omit<Act, "order">[];
}

export const STRUCTURE_TEMPLATES: TemplateDef[] = [
  {
    id: "three-act",
    label: "Three-act structure",
    description: "Classic setup, confrontation, resolution.",
    acts: [
      { id: "act-1", name: "Act I — Setup", description: "Establish world, character, and inciting incident." },
      { id: "act-2", name: "Act II — Confrontation", description: "Rising complications and midpoint shift." },
      { id: "act-3", name: "Act III — Resolution", description: "Climax, fallout, and new equilibrium." },
    ],
  },
  {
    id: "heros-journey",
    label: "Hero's Journey",
    description: "Campbell's monomyth in twelve movements.",
    acts: [
      { id: "hj-1", name: "Ordinary World", description: "Status quo before adventure." },
      { id: "hj-2", name: "Call to Adventure", description: "Problem or invitation disrupts normal life." },
      { id: "hj-3", name: "Refusal / Mentor", description: "Hesitation and guidance." },
      { id: "hj-4", name: "Crossing Threshold", description: "Commitment into the special world." },
      { id: "hj-5", name: "Tests & Allies", description: "Training, friends, early trials." },
      { id: "hj-6", name: "Approach", description: "Preparation for central ordeal." },
      { id: "hj-7", name: "Ordeal", description: "Death/rebirth midpoint crisis." },
      { id: "hj-8", name: "Reward", description: "Seizing the sword — insight or tool." },
      { id: "hj-9", name: "Road Back", description: "Consequences chase the hero." },
      { id: "hj-10", name: "Resurrection", description: "Final test of transformation." },
      { id: "hj-11", name: "Return with Elixir", description: "Changed hero brings gift home." },
    ],
  },
  {
    id: "save-the-cat",
    label: "Save the Cat",
    description: "Blake Snyder's fifteen-beat sheet (grouped).",
    acts: [
      { id: "stc-1", name: "Opening Image → Catalyst", description: "Tone, stakes seed, inciting break." },
      { id: "stc-2", name: "Debate → Break into Two", description: "Resistance then commitment to Act 2." },
      { id: "stc-3", name: "Fun & Games", description: "Promise of the premise." },
      { id: "stc-4", name: "Midpoint", description: "False victory or false defeat." },
      { id: "stc-5", name: "Bad Guys Close In", description: "Internal and external pressure." },
      { id: "stc-6", name: "All Is Lost → Dark Night", description: "Lowest point." },
      { id: "stc-7", name: "Break into Three → Finale", description: "Synthesis and climax." },
      { id: "stc-8", name: "Final Image", description: "Mirror of opening — change visible." },
    ],
  },
  {
    id: "romance",
    label: "Romance arc",
    description: "Meet, bond, rupture, reunion pattern.",
    acts: [
      { id: "rom-1", name: "Meet / Spark", description: "Chemistry and obstacle introduced." },
      { id: "rom-2", name: "Deepening", description: "Vulnerability and shared stakes." },
      { id: "rom-3", name: "Midpoint commitment", description: "Together against world or problem." },
      { id: "rom-4", name: "Black moment", description: "Lie, betrayal, or fear splits them." },
      { id: "rom-5", name: "Grand gesture / HEA", description: "Choice, repair, emotional payoff." },
    ],
  },
  {
    id: "mystery",
    label: "Mystery / thriller",
    description: "Crime, investigation, reveal, confrontation.",
    acts: [
      { id: "mys-1", name: "Crime / Hook", description: "Disruption and question posed." },
      { id: "mys-2", name: "Investigation", description: "Clues, red herrings, suspects." },
      { id: "mys-3", name: "Midpoint reveal", description: "Case twists — new stakes." },
      { id: "mys-4", name: "Rising danger", description: "Antagonist pressure intensifies." },
      { id: "mys-5", name: "Reveal & confrontation", description: "Truth exposed, final chase." },
      { id: "mys-6", name: "Aftermath", description: "Cost counted, order restored or denied." },
    ],
  },
];

export function actsForTemplate(template: StructureTemplate): Act[] {
  const def = STRUCTURE_TEMPLATES.find(t => t.id === template) ?? STRUCTURE_TEMPLATES[0];
  return def.acts.map((a, i) => ({ ...a, order: i }));
}

function defaultStory(): Story {
  const now = new Date().toISOString();
  return {
    id: createId("story"),
    title: "Untitled novel",
    genre: "",
    targetAudience: "",
    logline: "",
    theme: "",
    mainCharacter: "",
    antagonist: "",
    storyWorld: "",
    endingSummary: "",
    structureTemplate: "three-act",
    updatedAt: now,
  };
}

export function createDefaultState(): PlotStudioState {
  return {
    story: defaultStory(),
    characters: [],
    plotlines: [...DEFAULT_PLOTLINES],
    acts: actsForTemplate("three-act"),
    scenes: [],
  };
}

export function loadState(bookId?: string): PlotStudioState {
  try {
    const raw = localStorage.getItem(storageKey(bookId));
    if (!raw) return createDefaultState();
    const parsed = JSON.parse(raw) as PlotStudioState;
    if (!parsed?.story?.id) return createDefaultState();
    return {
      ...createDefaultState(),
      ...parsed,
      plotlines: parsed.plotlines?.length ? parsed.plotlines : DEFAULT_PLOTLINES,
    };
  } catch {
    return createDefaultState();
  }
}

export function saveState(state: PlotStudioState, bookId?: string): void {
  const next = {
    ...state,
    story: { ...state.story, updatedAt: new Date().toISOString() },
  };
  localStorage.setItem(storageKey(bookId), JSON.stringify(next));
}

export function exportReportMarkdown(
  story: Story,
  scorecard: import("../types").Scorecard,
  diagnoses: import("../types").Diagnosis[],
  scenes: import("../types").Scene[]
): string {
  const lines: string[] = [
    `# Plot Doctor Report — ${story.title || "Untitled"}`,
    "",
    `**Genre:** ${story.genre || "—"} · **Audience:** ${story.targetAudience || "—"}`,
    "",
    "## Logline",
    story.logline || "—",
    "",
    "## Scorecard",
    `| Metric | Score |`,
    `|--------|-------|`,
    `| Structure | ${scorecard.structure}/10 |`,
    `| Character motivation | ${scorecard.characterMotivation}/10 |`,
    `| Stakes | ${scorecard.stakes}/10 |`,
    `| Conflict | ${scorecard.conflict}/10 |`,
    `| Pacing | ${scorecard.pacing}/10 |`,
    `| Emotional arc | ${scorecard.emotionalArc}/10 |`,
    `| Theme integration | ${scorecard.themeIntegration}/10 |`,
    `| Ending payoff | ${scorecard.endingPayoff}/10 |`,
    `| **Overall** | **${scorecard.overall}/10** |`,
    "",
    "## Diagnoses",
  ];
  for (const d of diagnoses) {
    lines.push(`### [${d.severity.toUpperCase()}] ${d.title}`, "", d.diagnosis, "", `**Fix:** ${d.specificFix}`, "");
  }
  lines.push("## Scene inventory", "", `Total scenes: ${scenes.length}`, "");
  for (const s of [...scenes].sort((a, b) => a.order - b.order)) {
    lines.push(`- **${s.title || "Untitled"}** — POV: ${s.povCharacter || "—"} · ${s.location || "—"}`);
  }
  return lines.join("\n");
}
