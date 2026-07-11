export interface BoardLabel {
  id: string;
  name: string;
  color: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface BoardCard {
  id: string;
  title: string;
  description: string;
  labelIds: string[];
  checklist: ChecklistItem[];
}

export interface BoardList {
  id: string;
  title: string;
  cardIds: string[];
  color: string;
}

export interface BoardState {
  title: string;
  lists: BoardList[];
  cards: Record<string, BoardCard>;
  labels: BoardLabel[];
  updatedAt: string;
}

export const BOARD_LABELS: BoardLabel[] = [
  { id: "lbl-green", name: "Plot", color: "#22c55e" },
  { id: "lbl-yellow", name: "Character", color: "#eab308" },
  { id: "lbl-orange", name: "World", color: "#f97316" },
  { id: "lbl-red", name: "Urgent", color: "#ef4444" },
  { id: "lbl-purple", name: "Research", color: "#a855f7" },
  { id: "lbl-blue", name: "Revision", color: "#3b82f6" },
];

export const LIST_COLORS = [
  "#7c3aed",
  "#ec4899",
  "#06b6d4",
  "#f59e0b",
  "#22c55e",
  "#6366f1",
];

export function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
