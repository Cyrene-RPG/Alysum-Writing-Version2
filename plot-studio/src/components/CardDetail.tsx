import { useEffect, useRef } from "react";
import type { BoardCard, BoardLabel } from "../types";
import { createId } from "../types";

interface Props {
  card: BoardCard | null;
  listTitle?: string;
  labels: BoardLabel[];
  onSave: (card: BoardCard) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function CardDetail({ card, listTitle, labels, onSave, onDelete, onClose }: Props) {
  const titleRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!card) return;
    titleRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [card?.id, onClose]);

  if (!card) return null;

  const current = card;
  const doneCount = current.checklist.filter(i => i.done).length;

  function toggleLabel(labelId: string) {
    const has = current.labelIds.includes(labelId);
    onSave({
      ...current,
      labelIds: has ? current.labelIds.filter(id => id !== labelId) : [...current.labelIds, labelId],
    });
  }

  function toggleCheck(itemId: string) {
    onSave({
      ...current,
      checklist: current.checklist.map(i =>
        i.id === itemId ? { ...i, done: !i.done } : i
      ),
    });
  }

  function addCheckItem() {
    onSave({
      ...current,
      checklist: [...current.checklist, { id: createId("chk"), text: "", done: false }],
    });
  }

  function updateCheckText(itemId: string, text: string) {
    onSave({
      ...current,
      checklist: current.checklist.map(i => (i.id === itemId ? { ...i, text } : i)),
    });
  }

  function removeCheck(itemId: string) {
    onSave({
      ...current,
      checklist: current.checklist.filter(i => i.id !== itemId),
    });
  }

  return (
    <>
      <button type="button" className="sb-detail-backdrop" aria-label="Close card" onClick={onClose} />
      <aside className="sb-detail" role="dialog" aria-modal="true" aria-labelledby="sb-detail-title">
        <div className="sb-detail-head">
          {listTitle && <p className="sb-detail-list">in {listTitle}</p>}
          <textarea
            ref={titleRef}
            id="sb-detail-title"
            className="sb-detail-title"
            rows={2}
            placeholder="Card title"
            value={current.title}
            onChange={e => onSave({ ...current, title: e.target.value })}
          />
          <button type="button" className="sb-detail-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="sb-detail-body">
          <section className="sb-detail-section">
            <h3>Labels</h3>
            <div className="sb-detail-labels">
              {labels.map(l => {
                const active = current.labelIds.includes(l.id);
                return (
                  <button
                    key={l.id}
                    type="button"
                    className={`sb-detail-label ${active ? "is-on" : ""}`}
                    style={{ backgroundColor: l.color }}
                    onClick={() => toggleLabel(l.id)}
                  >
                    {l.name}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="sb-detail-section">
            <h3>Description</h3>
            <textarea
              className="sb-detail-textarea"
              rows={5}
              placeholder="Scene notes, beats, character goals…"
              value={current.description}
              onChange={e => onSave({ ...current, description: e.target.value })}
            />
          </section>

          <section className="sb-detail-section">
            <div className="sb-detail-section-head">
              <h3>Checklist</h3>
              {current.checklist.length > 0 && (
                <span className="sb-detail-check-meta">
                  {doneCount}/{current.checklist.length}
                </span>
              )}
            </div>
            <ul className="sb-checklist">
              {current.checklist.map(item => (
                <li key={item.id}>
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() => toggleCheck(item.id)}
                    aria-label="Mark done"
                  />
                  <input
                    type="text"
                    className="sb-check-input"
                    value={item.text}
                    placeholder="Checklist item"
                    onChange={e => updateCheckText(item.id, e.target.value)}
                  />
                  <button
                    type="button"
                    className="sb-check-remove"
                    onClick={() => removeCheck(item.id)}
                    aria-label="Remove item"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="sb-check-add" onClick={addCheckItem}>
              + Add checklist item
            </button>
          </section>
        </div>

        <footer className="sb-detail-foot">
          <button
            type="button"
            className="sb-btn sb-btn-danger"
            onClick={() => {
              if (confirm("Delete this card?")) {
                onDelete(current.id);
                onClose();
              }
            }}
          >
            Delete card
          </button>
        </footer>
      </aside>
    </>
  );
}
