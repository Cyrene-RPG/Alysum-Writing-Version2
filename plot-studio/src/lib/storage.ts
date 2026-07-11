import type { BoardCard, BoardList, BoardState } from "../types";
import { BOARD_LABELS, LIST_COLORS, createId } from "../types";

const STORAGE_PREFIX = "alysum-story-board";

function storageKey(bookId?: string): string {
  const id = (bookId || "").trim() || "standalone";
  return `${STORAGE_PREFIX}-${id}-v2`;
}

function defaultLists(): BoardList[] {
  const titles = ["Plot beats", "Scenes", "Characters", "Research", "Done"];
  return titles.map((title, i) => ({
    id: createId("list"),
    title,
    cardIds: [],
    color: LIST_COLORS[i % LIST_COLORS.length]!,
  }));
}

export function createDefaultBoard(): BoardState {
  return {
    title: "Untitled board",
    lists: defaultLists(),
    cards: {},
    labels: [...BOARD_LABELS],
    updatedAt: new Date().toISOString(),
  };
}

function normalizeCard(raw: Partial<BoardCard> & { id: string }): BoardCard {
  return {
    id: raw.id,
    title: raw.title ?? "",
    description: raw.description ?? "",
    labelIds: Array.isArray(raw.labelIds) ? raw.labelIds : [],
    checklist: Array.isArray(raw.checklist) ? raw.checklist : [],
  };
}

function normalizeList(raw: Partial<BoardList> & { id: string; title: string; cardIds: string[] }, i: number): BoardList {
  return {
    id: raw.id,
    title: raw.title,
    cardIds: raw.cardIds,
    color: raw.color ?? LIST_COLORS[i % LIST_COLORS.length]!,
  };
}

export function loadBoard(bookId?: string): BoardState {
  const id = (bookId || "").trim() || "standalone";
  try {
    const raw = localStorage.getItem(storageKey(bookId));
    const legacyRaw = raw ? null : localStorage.getItem(`${STORAGE_PREFIX}-${id}-v1`);
    const source = raw ?? legacyRaw;
    if (!source) return createDefaultBoard();
    const parsed = JSON.parse(source) as BoardState;
    if (!parsed?.lists?.length) return createDefaultBoard();

    const cards: Record<string, BoardCard> = {};
    if (parsed.cards && typeof parsed.cards === "object") {
      for (const [cid, card] of Object.entries(parsed.cards)) {
        cards[cid] = normalizeCard({ ...card, id: cid });
      }
    }

    const state = {
      ...createDefaultBoard(),
      ...parsed,
      labels: parsed.labels?.length ? parsed.labels : BOARD_LABELS,
      lists: parsed.lists.map((l, i) => normalizeList(l, i)),
      cards,
    };
    if (legacyRaw) saveBoard(state, bookId);
    return state;
  } catch {
    return createDefaultBoard();
  }
}

export function saveBoard(state: BoardState, bookId?: string): void {
  const next = { ...state, updatedAt: new Date().toISOString() };
  localStorage.setItem(storageKey(bookId), JSON.stringify(next));
}

function listByKeyword(lists: BoardList[], keywords: string[]): BoardList | undefined {
  const lower = keywords.map(k => k.toLowerCase());
  return lists.find(l => lower.some(k => l.title.toLowerCase().includes(k)));
}

export function cardsFromChapterTitles(
  titles: string[],
  lists: BoardList[]
): { lists: BoardList[]; cards: Record<string, BoardCard> } {
  const scenesList = listByKeyword(lists, ["scene", "writing", "plot"]) ?? lists[1] ?? lists[0];
  const researchList = listByKeyword(lists, ["research", "idea"]) ?? lists[3] ?? lists[0];
  const doneList = listByKeyword(lists, ["done", "complete"]) ?? lists[lists.length - 1];

  const cards: Record<string, BoardCard> = {};
  const additions = new Map<string, string[]>();

  for (const title of titles) {
    const id = createId("card");
    const lower = title.toLowerCase();
    let target = scenesList;
    if (lower.startsWith("front:") || lower.startsWith("back:")) target = researchList;
    if (lower.includes("done") || lower.includes("complete")) target = doneList;

    cards[id] = {
      id,
      title: title.replace(/^(Front|Body|Back):\s*/i, ""),
      description: "",
      labelIds: lower.startsWith("body:") ? ["lbl-green"] : lower.startsWith("front:") ? ["lbl-purple"] : [],
      checklist: [],
    };

    const listId = target?.id ?? scenesList!.id;
    const bucket = additions.get(listId) ?? [];
    bucket.push(id);
    additions.set(listId, bucket);
  }

  const nextLists = lists.map(l => ({
    ...l,
    cardIds: [...l.cardIds, ...(additions.get(l.id) ?? [])],
  }));

  return { lists: nextLists, cards };
}
