import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef, useState } from "react";
import type { BoardCard, BoardLabel, BoardList } from "../types";
import { CardItem } from "./CardItem";

interface Props {
  list: BoardList;
  cards: Record<string, BoardCard>;
  labels: BoardLabel[];
  onRename: (title: string) => void;
  onDelete: () => void;
  onAddCard: (title: string) => void;
  onOpenCard: (card: BoardCard) => void;
}

export function ListColumn({ list, cards, labels, onRename, onDelete, onAddCard, onOpenCard }: Props) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(list.title);
  const [addingCard, setAddingCard] = useState(false);
  const [cardDraft, setCardDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: list.id, data: { type: "list", list } });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `droppable-${list.id}`,
    data: { type: "list-drop", listId: list.id },
  });

  useEffect(() => {
    setTitleDraft(list.title);
  }, [list.title]);

  useEffect(() => {
    if (!menuOpen) return;
    function close(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
  };

  const listCards = list.cardIds.map(id => cards[id]).filter(Boolean) as BoardCard[];

  function commitTitle() {
    const t = titleDraft.trim() || "Untitled list";
    onRename(t);
    setTitleDraft(t);
    setEditingTitle(false);
  }

  function commitCard() {
    const t = cardDraft.trim();
    if (t) onAddCard(t);
    setCardDraft("");
    setAddingCard(false);
  }

  return (
    <section
      ref={setSortableRef}
      style={style}
      className="sb-list"
      aria-label={`${list.title} list`}
    >
      <div className="sb-list-accent" style={{ backgroundColor: list.color }} />
      <div className="sb-list-head">
        <button
          type="button"
          className="sb-list-drag"
          aria-label="Drag list"
          {...attributes}
          {...listeners}
        />
        {editingTitle ? (
          <input
            autoFocus
            className="sb-list-title-input"
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={e => {
              if (e.key === "Enter") commitTitle();
              if (e.key === "Escape") {
                setTitleDraft(list.title);
                setEditingTitle(false);
              }
            }}
          />
        ) : (
          <button type="button" className="sb-list-title" onClick={() => setEditingTitle(true)}>
            {list.title}
          </button>
        )}
        <span className="sb-list-count">{listCards.length}</span>
        <div className="sb-list-menu-wrap" ref={menuRef}>
          <button
            type="button"
            className="sb-list-menu-btn"
            aria-label="List actions"
            onClick={() => setMenuOpen(v => !v)}
          >
            ···
          </button>
          {menuOpen && (
            <div className="sb-list-menu">
              <button type="button" onClick={() => { setEditingTitle(true); setMenuOpen(false); }}>
                Rename list
              </button>
              <button
                type="button"
                className="is-danger"
                onClick={() => {
                  setMenuOpen(false);
                  if (confirm(`Delete "${list.title}" and all its cards?`)) onDelete();
                }}
              >
                Delete list
              </button>
            </div>
          )}
        </div>
      </div>

      <div
        ref={setDropRef}
        className={`sb-list-body ${isOver ? "is-over" : ""}`}
      >
        <SortableContext items={list.cardIds} strategy={verticalListSortingStrategy}>
          {listCards.map(card => (
            <CardItem
              key={card.id}
              card={card}
              labels={labels}
              onOpen={() => onOpenCard(card)}
            />
          ))}
        </SortableContext>

        {listCards.length === 0 && !addingCard && (
          <p className="sb-list-empty">Drop cards here or add one below</p>
        )}

        {addingCard ? (
          <div className="sb-add-card-form">
            <textarea
              autoFocus
              rows={2}
              className="sb-add-card-input"
              placeholder="Card title…"
              value={cardDraft}
              onChange={e => setCardDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  commitCard();
                }
                if (e.key === "Escape") {
                  setCardDraft("");
                  setAddingCard(false);
                }
              }}
            />
            <div className="sb-add-card-actions">
              <button type="button" className="sb-btn sb-btn-primary" onClick={commitCard}>
                Add card
              </button>
              <button
                type="button"
                className="sb-btn sb-btn-ghost"
                onClick={() => {
                  setCardDraft("");
                  setAddingCard(false);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="sb-add-card-btn" onClick={() => setAddingCard(true)}>
            + Add a card
          </button>
        )}
      </div>
    </section>
  );
}
