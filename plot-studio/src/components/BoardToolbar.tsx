interface Props {
  title: string;
  cardCount: number;
  bookLinked: boolean;
  editorHref: string;
  bibleHref: string;
  onTitleChange: (title: string) => void;
  onReset: () => void;
}

export function BoardToolbar({
  title,
  cardCount,
  bookLinked,
  editorHref,
  bibleHref,
  onTitleChange,
  onReset,
}: Props) {
  return (
    <header className="sb-toolbar">
      <div className="sb-toolbar-left">
        <a className="sb-brand" href="../writer-dashboard.html" title="Back to Studio">
          <img src="../Alysum-3.png" alt="" width={28} height={28} />
          <span>Story Board</span>
        </a>
        <span className="sb-sep" aria-hidden="true" />
        <input
          className="sb-title-input"
          value={title}
          onChange={e => onTitleChange(e.target.value)}
          placeholder="Board title"
          aria-label="Board title"
        />
        <span className="sb-meta">
          {cardCount} card{cardCount !== 1 ? "s" : ""}
          {bookLinked ? " · linked to book" : ""}
        </span>
      </div>
      <div className="sb-toolbar-right">
        <a className="sb-btn sb-btn-ghost" href={editorHref}>
          Editor
        </a>
        <a className="sb-btn sb-btn-ghost" href={bibleHref}>
          Story Bible
        </a>
        <button
          type="button"
          className="sb-btn sb-btn-danger"
          onClick={() => {
            if (confirm("Reset this board? All lists and cards will be deleted.")) onReset();
          }}
        >
          Reset
        </button>
      </div>
    </header>
  );
}
