import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useEffect, useMemo, useState } from "react";
import { BoardToolbar } from "./components/BoardToolbar";
import { CardDetail } from "./components/CardDetail";
import { CardItem } from "./components/CardItem";
import { ListColumn } from "./components/ListColumn";
import {
  fetchAlysumBook,
  flattenBookChapters,
  readBookIdFromUrl,
} from "./lib/bookLoad";
import { useBoardStore } from "./hooks/useBoardStore";
import type { BoardCard } from "./types";

// @ts-expect-error — shared Alysum Supabase client (parent folder)
import { supabase } from "../../firebase.js";

function findListForCard(lists: { id: string; title: string; cardIds: string[] }[], cardId: string) {
  return lists.find(l => l.cardIds.includes(cardId));
}

export default function App() {
  const bookId = useMemo(() => readBookIdFromUrl(), []);
  const store = useBoardStore(bookId);
  const [editingCard, setEditingCard] = useState<BoardCard | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [importOffer, setImportOffer] = useState<number | null>(null);
  const [bootDone, setBootDone] = useState(false);
  const [addingList, setAddingList] = useState(false);
  const [listDraft, setListDraft] = useState("");

  const editorHref = bookId ? `../editor.html?book=${encodeURIComponent(bookId)}` : "../writer-dashboard.html";
  const bibleHref = bookId ? `../Story-Bible-New.html?book=${encodeURIComponent(bookId)}` : "../Story-Bible-New.html";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 140, tolerance: 6 } })
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!bookId) {
        setBootDone(true);
        return;
      }
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const uid = session?.user?.id;
        if (!uid) {
          setBootDone(true);
          return;
        }
        const book = await fetchAlysumBook(supabase, uid, bookId);
        if (cancelled || !book) {
          setBootDone(true);
          return;
        }
        store.setTitle(book.title || store.state.title);
        const chapters = flattenBookChapters(book.sections);
        if (store.cardCount === 0 && chapters.length > 0) {
          setImportOffer(chapters.length);
        }
      } catch (e) {
        console.warn("[story-board] book bootstrap failed:", e);
      } finally {
        if (!cancelled) setBootDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  useEffect(() => {
    if (editingCard) {
      const fresh = store.state.cards[editingCard.id];
      if (fresh) setEditingCard(fresh);
    }
  }, [store.state.cards, editingCard?.id]);

  const editingListTitle = editingCard
    ? findListForCard(store.state.lists, editingCard.id)?.title
    : undefined;

  function importChapters() {
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid || !bookId) return;
      const book = await fetchAlysumBook(supabase, uid, bookId);
      if (!book) return;
      const chapters = flattenBookChapters(book.sections);
      store.importChapters(chapters.map(c => c.title));
      store.setTitle(book.title || store.state.title);
      setImportOffer(null);
    })();
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDragId(null);
    if (!over) return;

    const activeType = active.data.current?.type;

    if (activeType === "list") {
      const overId = String(over.id);
      const overIndex = store.state.lists.findIndex(l => l.id === overId);
      if (overIndex !== -1) store.moveList(String(active.id), overIndex);
      return;
    }

    if (activeType !== "card") return;

    const activeId = String(active.id);
    const overData = over.data.current;
    let overListId: string | null = null;
    let overIndex = 0;

    if (overData?.type === "list-drop") {
      overListId = overData.listId as string;
      const list = store.state.lists.find(l => l.id === overListId);
      overIndex = list?.cardIds.length ?? 0;
    } else if (overData?.type === "card") {
      const card = overData.card as BoardCard;
      const list = findListForCard(store.state.lists, card.id);
      if (!list) return;
      overListId = list.id;
      overIndex = list.cardIds.indexOf(card.id);
    } else if (overData?.type === "list") {
      overListId = (overData.list as { id: string }).id;
      const list = store.state.lists.find(l => l.id === overListId);
      overIndex = list?.cardIds.length ?? 0;
    }

    if (!overListId) return;
    store.moveCard(activeId, overListId, overIndex);
  }

  const activeCard = activeDragId ? store.state.cards[activeDragId] : null;

  function commitList() {
    const t = listDraft.trim();
    if (t) store.addList(t);
    setListDraft("");
    setAddingList(false);
  }

  const showWelcome = bootDone && store.cardCount === 0 && importOffer === null;

  return (
    <div className="sb-app">
      <BoardToolbar
        title={store.state.title}
        cardCount={store.cardCount}
        bookLinked={!!bookId}
        editorHref={editorHref}
        bibleHref={bibleHref}
        onTitleChange={store.setTitle}
        onReset={store.resetBoard}
      />

      {importOffer !== null && bootDone && (
        <div className="sb-banner">
          <p>
            <strong>{importOffer} chapters</strong> in your manuscript — import them as scene cards?
          </p>
          <div className="sb-banner-actions">
            <button type="button" className="sb-btn sb-btn-primary" onClick={importChapters}>
              Import chapters
            </button>
            <button type="button" className="sb-btn sb-btn-ghost" onClick={() => setImportOffer(null)}>
              Start blank
            </button>
          </div>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className={`sb-canvas ${showWelcome ? "has-welcome" : ""}`}>
          {showWelcome && (
            <div className="sb-welcome">
              <h2>Plan your novel on a board</h2>
              <p>
                Drag cards between lists, add checklists for revision passes, and label scenes by plot,
                character, or research. Hold a card briefly to drag it.
              </p>
            </div>
          )}

          <SortableContext
            items={store.state.lists.map(l => l.id)}
            strategy={horizontalListSortingStrategy}
          >
            <div className="sb-lists">
              {store.state.lists.map(list => (
                <ListColumn
                  key={list.id}
                  list={list}
                  cards={store.state.cards}
                  labels={store.state.labels}
                  onRename={title => store.renameList(list.id, title)}
                  onDelete={() => store.deleteList(list.id)}
                  onAddCard={title => setEditingCard(store.addCard(list.id, title))}
                  onOpenCard={setEditingCard}
                />
              ))}

              <div className="sb-add-list">
                {addingList ? (
                  <div className="sb-add-list-form">
                    <input
                      autoFocus
                      className="sb-add-list-input"
                      placeholder="List name…"
                      value={listDraft}
                      onChange={e => setListDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") commitList();
                        if (e.key === "Escape") {
                          setListDraft("");
                          setAddingList(false);
                        }
                      }}
                    />
                    <div className="sb-add-card-actions">
                      <button type="button" className="sb-btn sb-btn-primary" onClick={commitList}>
                        Add list
                      </button>
                      <button
                        type="button"
                        className="sb-btn sb-btn-ghost"
                        onClick={() => {
                          setListDraft("");
                          setAddingList(false);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="sb-add-list-btn" onClick={() => setAddingList(true)}>
                    + Add list
                  </button>
                )}
              </div>
            </div>
          </SortableContext>
        </div>

        <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.18, 0.67, 0.6, 1)" }}>
          {activeCard && (
            <CardItem
              card={activeCard}
              labels={store.state.labels}
              onOpen={() => {}}
              isOverlay
            />
          )}
        </DragOverlay>
      </DndContext>

      <CardDetail
        card={editingCard}
        listTitle={editingListTitle}
        labels={store.state.labels}
        onSave={store.updateCard}
        onDelete={store.deleteCard}
        onClose={() => setEditingCard(null)}
      />
    </div>
  );
}
