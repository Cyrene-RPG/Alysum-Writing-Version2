import type { Scorecard } from "../types";

const METRICS: { key: keyof Omit<Scorecard, "overall">; label: string }[] = [
  { key: "structure", label: "Structure" },
  { key: "characterMotivation", label: "Character motivation" },
  { key: "stakes", label: "Stakes" },
  { key: "conflict", label: "Conflict" },
  { key: "pacing", label: "Pacing" },
  { key: "emotionalArc", label: "Emotional arc" },
  { key: "themeIntegration", label: "Theme integration" },
  { key: "endingPayoff", label: "Ending payoff" },
];

function barColor(score: number): string {
  if (score >= 8) return "bg-emerald-500";
  if (score >= 5) return "bg-amber-500";
  return "bg-red-500";
}

interface Props {
  scorecard: Scorecard;
}

export function ScorecardView({ scorecard }: Props) {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h2 className="font-display text-2xl font-semibold text-white">Scorecard</h2>
        <p className="mt-1 text-slate-400">Scores 1–10 computed from your story data and flagged issues.</p>
      </header>

      <div className="rounded-xl border border-accent/30 bg-accent/10 p-8 text-center shadow-glow">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent-glow">Overall</p>
        <p className="mt-2 text-5xl font-bold text-white">{scorecard.overall}</p>
        <p className="text-slate-400">/ 10</p>
      </div>

      <div className="space-y-4 rounded-xl border border-slate-700/60 bg-surface-raised/60 p-6">
        {METRICS.map(({ key, label }) => {
          const score = scorecard[key];
          return (
            <div key={key}>
              <div className="mb-1 flex justify-between text-sm">
                <span className="font-medium text-slate-200">{label}</span>
                <span className="font-bold text-white">{score}/10</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full rounded-full transition-all ${barColor(score)}`}
                  style={{ width: `${score * 10}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
