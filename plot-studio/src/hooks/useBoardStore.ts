import { useCallback, useEffect, useState } from "react";
import type { BoardCard, BoardList, BoardState } from "../types";
import { LIST_COLORS, createId } from "../types";
import { cardsFromChapterTitles, createDefaultBoard, loadBoard, saveBoard } from "../lib/storage";

export function useBoardStore(bookId?: string) {
  const [state, setState] = useState<BoardState>(() => loadBoard(bookId));

  useEffect(() => {
    setState(loadBoard(bookId));
  }, [bookId]);

  useEffect(() => {
    saveBoard(state, bookId);
  }, [state, bookId]);

  const setTitle = useCallback((title: string) => {
    setState(prev => ({ ...prev, title }));
  }, []);

  const addList = useCallback((title = "New list") => {
    const id = createId("list");
    setState(prev => ({
      ...prev,
      lists: [
        ...prev.lists,
        { id, title, cardIds: [], color: LIST_COLORS[prev.lists.length % LIST_COLORS.length]! },
      ],
    }));
  }, []);

  const renameList = useCallback((listId: string, title: string) => {
    setState(prev => ({
      ...prev,
      lists: prev.lists.map(l => (l.id === listId ? { ...l, title } : l)),
    }));
  }, []);

  const deleteList = useCallback((listId: string) => {
    setState(prev => {
      const list = prev.lists.find(l => l.id === listId);
      if (!list) return prev;
      const cards = { ...prev.cards };
      for (const id of list.cardIds) delete cards[id];
      return {
        ...prev,
        lists: prev.lists.filter(l => l.id !== listId),
        cards,
      };
    });
  }, []);

  const addCard = useCallback((listId: string, title = "New card"): BoardCard => {
    const id = createId("card");
    const card: BoardCard = { id, title, description: "", labelIds: [], checklist: [] };
    setState(prev => ({
      ...prev,
      cards: { ...prev.cards, [id]: card },
      lists: prev.lists.map(l =>
        l.id === listId ? { ...l, cardIds: [...l.cardIds, id] } : l
      ),
    }));
    return card;
  }, []);

  const updateCard = useCallback((card: BoardCard) => {
    setState(prev => ({
      ...prev,
      cards: { ...prev.cards, [card.id]: card },
    }));
  }, []);

  const deleteCard = useCallback((cardId: string) => {
    setState(prev => ({
      ...prev,
      cards: Object.fromEntries(Object.entries(prev.cards).filter(([id]) => id !== cardId)),
      lists: prev.lists.map(l => ({
        ...l,
        cardIds: l.cardIds.filter(id => id !== cardId),
      })),
    }));
  }, []);

  const moveCard = useCallback((activeId: string, overListId: string, overIndex: number) => {
    setState(prev => {
      const lists = prev.lists.map(l => ({ ...l, cardIds: [...l.cardIds] }));
      let sourceList: BoardList | undefined;
      let sourceIndex = -1;

      for (const list of lists) {
        const idx = list.cardIds.indexOf(activeId);
        if (idx !== -1) {
          sourceList = list;
          sourceIndex = idx;
          break;
        }
      }
      if (!sourceList || sourceIndex === -1) return prev;

      const target = lists.find(l => l.id === overListId);
      if (!target) return prev;

      sourceList.cardIds.splice(sourceIndex, 1);

      let insertAt = Math.max(0, Math.min(overIndex, target.cardIds.length));
      if (sourceList.id === target.id && sourceIndex < overIndex) {
        insertAt = Math.max(0, overIndex - 1);
      }

      target.cardIds.splice(insertAt, 0, activeId);
      return { ...prev, lists };
    });
  }, []);

  const moveList = useCallback((activeId: string, overIndex: number) => {
    setState(prev => {
      const lists = [...prev.lists];
      const from = lists.findIndex(l => l.id === activeId);
      if (from === -1) return prev;
      const [item] = lists.splice(from, 1);
      const to = Math.max(0, Math.min(overIndex, lists.length));
      lists.splice(to, 0, item);
      return { ...prev, lists };
    });
  }, []);

  const importChapters = useCallback((titles: string[]) => {
    setState(prev => {
      const { lists, cards } = cardsFromChapterTitles(titles, prev.lists);
      return { ...prev, lists, cards: { ...prev.cards, ...cards } };
    });
  }, []);

  const resetBoard = useCallback(() => {
    setState(createDefaultBoard());
  }, []);

  const cardCount = Object.keys(state.cards).length;

  return {
    state,
    cardCount,
    setTitle,
    addList,
    renameList,
    deleteList,
    addCard,
    updateCard,
    deleteCard,
    moveCard,
    moveList,
    importChapters,
    resetBoard,
  };
}
