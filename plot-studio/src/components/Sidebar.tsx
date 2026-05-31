import type { NavPage } from "../types";

const NAV: { id: NavPage; label: string; icon: string }[] = [
  { id: "dashboard", label: "Story dashboard", icon: "◆" },
  { id: "timeline", label: "Timeline", icon: "▤" },
  { id: "diagnosis", label: "Plot Doctor", icon: "✦" },
  { id: "scorecard", label: "Scorecard", icon: "◎" },
  { id: "report", label: "Export report", icon: "↓" },
];

interface Props {
  page: NavPage;
  onNavigate: (p: NavPage) => void;
  storyTitle: string;
  issueCount: number;
}

export function Sidebar({ page, onNavigate, storyTitle, issueCount }: Props) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-700/60 bg-surface-raised/80 backdrop-blur">
      <div className="border-b border-slate-700/60 px-5 py-6">
        <p className="text-xs font-bold uppercase tracking-widest text-gold">Plot Doctor</p>
        <h1 className="mt-1 font-display text-lg font-semibold text-white truncate" title={storyTitle}>
          {storyTitle || "Untitled novel"}
        </h1>
        {issueCount > 0 && (
          <p className="mt-2 text-xs text-amber-300">{issueCount} issue{issueCount !== 1 ? "s" : ""} flagged</p>
        )}
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {NAV.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${
              page === item.id
                ? "bg-accent/25 text-accent-glow shadow-glow"
                : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
            }`}
          >
            <span className="w-5 text-center opacity-70">{item.icon}</span>
            {item.label}
            {item.id === "diagnosis" && issueCount > 0 && (
              <span className="ml-auto rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">
                {issueCount}
              </span>
            )}
          </button>
        ))}
      </nav>
      <div className="border-t border-slate-700/60 p-4 text-xs text-slate-500">
        Saved locally in your browser
      </div>
    </aside>
  );
}
