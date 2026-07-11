import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { BoardCard, BoardLabel } from "../types";

interface Props {
  card: BoardCard;
  labels: BoardLabel[];
  onOpen: () => void;
  isOverlay?: boolean;
}

export function CardItem({ card, labels, onOpen, isOverlay }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: "card", card },
    disabled: isOverlay,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging && !isOverlay ? 0.35 : 1,
  };

  const cardLabels = labels.filter(l => card.labelIds.includes(l.id));
  const doneCount = card.checklist.filter(i => i.done).length;
  const totalChecks = card.checklist.length;

  return (
    <article
      ref={isOverlay ? undefined : setNodeRef}
      style={isOverlay ? undefined : style}
      className={`sb-card ${isOverlay ? "sb-card-overlay" : ""}`}
      {...(isOverlay ? {} : { ...attributes, ...listeners })}
      onClick={() => {
        if (!isDragging) onOpen();
      }}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
    >
      {cardLabels.length > 0 && (
        <div className="sb-card-labels">
          {cardLabels.map(l => (
            <span key={l.id} className="sb-card-label" style={{ backgroundColor: l.color }} title={l.name} />
          ))}
        </div>
      )}
      <p className="sb-card-title">{card.title || "Untitled card"}</p>
      {card.description && <p className="sb-card-desc">{card.description}</p>}
      {totalChecks > 0 && (
        <p className="sb-card-checks">
          <span aria-hidden="true">☑</span> {doneCount}/{totalChecks}
        </p>
      )}
    </article>
  );
}
