export type StructureTemplate =
  | "three-act"
  | "heros-journey"
  | "save-the-cat"
  | "romance"
  | "mystery";

export type Severity = "low" | "medium" | "high";

export type NavPage = "dashboard" | "timeline" | "diagnosis" | "scorecard" | "report";

export interface Character {
  id: string;
  name: string;
  role: "protagonist" | "antagonist" | "supporting" | "other";
  motivation: string;
  flaw: string;
  arcStart: string;
  arcEnd: string;
}

export interface Plotline {
  id: string;
  name: string;
  color: string;
}

export interface Scene {
  id: string;
  actId: string;
  order: number;
  title: string;
  povCharacter: string;
  location: string;
  goal: string;
  conflict: string;
  outcome: string;
  emotionalShift: string;
  plotlineId: string;
  beatTag: string;
  notes: string;
}

export interface Act {
  id: string;
  name: string;
  order: number;
  description: string;
}

export interface Story {
  id: string;
  title: string;
  genre: string;
  targetAudience: string;
  logline: string;
  theme: string;
  mainCharacter: string;
  antagonist: string;
  storyWorld: string;
  endingSummary: string;
  structureTemplate: StructureTemplate;
  updatedAt: string;
}

export interface Diagnosis {
  id: string;
  category: string;
  title: string;
  diagnosis: string;
  whyItMatters: string;
  specificFix: string;
  exampleRewrite: string;
  severity: Severity;
  relatedSceneIds: string[];
}

export interface Scorecard {
  structure: number;
  characterMotivation: number;
  stakes: number;
  conflict: number;
  pacing: number;
  emotionalArc: number;
  themeIntegration: number;
  endingPayoff: number;
  overall: number;
}

export interface PlotStudioState {
  story: Story;
  characters: Character[];
  plotlines: Plotline[];
  acts: Act[];
  scenes: Scene[];
}

export const DEFAULT_PLOTLINES: Plotline[] = [
  { id: "pl-a", name: "A-plot", color: "#8b5cf6" },
  { id: "pl-b", name: "B-plot", color: "#06b6d4" },
  { id: "pl-c", name: "C-plot", color: "#f59e0b" },
  { id: "pl-rom", name: "Romance", color: "#ec4899" },
  { id: "pl-theme", name: "Theme", color: "#84cc16" },
];

export function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
