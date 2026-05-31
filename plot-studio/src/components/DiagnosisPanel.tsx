import type { Diagnosis } from "../types";

const SEV_STYLE: Record<string, string> = {
  high: "border-red-500/40 bg-red-500/10 text-red-300",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  low: "border-slate-500/40 bg-slate-500/10 text-slate-300",
};

interface Props {
  diagnoses: Diagnosis[];
  onJumpToTimeline?: () => void;
}

export function DiagnosisPanel({ diagnoses, onJumpToTimeline }: Props) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold text-white">Plot Doctor</h2>
          <p className="mt-1 text-slate-400">
            Diagnoses derived from your dashboard fields and scene cards — not generic writing tips.
          </p>
        </div>
        {onJumpToTimeline && (
          <button
            type="button"
            onClick={onJumpToTimeline}
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:border-accent hover:text-white"
          >
            Edit timeline →
          </button>
        )}
      </header>

      {diagnoses.length === 0 ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center">
          <p className="text-lg font-semibold text-emerald-200">No major issues flagged</p>
          <p className="mt-2 text-sm text-emerald-300/80">
            Keep adding scenes with goals, conflict, and outcomes — Plot Doctor will refine as your outline grows.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {diagnoses.map(d => (
            <article
              key={d.id}
              className="rounded-xl border border-slate-700/60 bg-surface-raised/60 p-5 shadow-card"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase ${SEV_STYLE[d.severity]}`}>
                  {d.severity}
                </span>
                <span className="text-xs uppercase tracking-wide text-slate-500">{d.category}</span>
              </div>
              <h3 className="mt-3 text-lg font-semibold text-white">{d.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{d.diagnosis}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-slate-900/50 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Why it matters</p>
                  <p className="mt-1 text-sm text-slate-300">{d.whyItMatters}</p>
                </div>
                <div className="rounded-lg bg-slate-900/50 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Specific fix</p>
                  <p className="mt-1 text-sm text-slate-300">{d.specificFix}</p>
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-accent/20 bg-accent/5 p-3">
                <p className="text-xs font-bold uppercase text-accent-glow">Example rewrite</p>
                <p className="mt-1 text-sm italic text-slate-300">{d.exampleRewrite}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
