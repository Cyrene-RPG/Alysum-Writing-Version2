import { exportReportMarkdown } from "../lib/templates";
import type { Diagnosis, Scene, Scorecard, Story } from "../types";

interface Props {
  story: Story;
  scorecard: Scorecard;
  diagnoses: Diagnosis[];
  scenes: Scene[];
}

export function ExportReport({ story, scorecard, diagnoses, scenes }: Props) {
  const markdown = exportReportMarkdown(story, scorecard, diagnoses, scenes);

  function download() {
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(story.title || "plot-doctor-report").replace(/\W+/g, "-").slice(0, 40)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copy() {
    void navigator.clipboard.writeText(markdown);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold text-white">Export report</h2>
          <p className="mt-1 text-slate-400">Markdown summary of scores, diagnoses, and scene inventory.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={copy}
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:text-white"
          >
            Copy
          </button>
          <button
            type="button"
            onClick={download}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90"
          >
            Download .md
          </button>
        </div>
      </header>
      <pre className="max-h-[70vh] overflow-auto rounded-xl border border-slate-700/60 bg-slate-950/80 p-6 text-sm leading-relaxed text-slate-300 whitespace-pre-wrap">
        {markdown}
      </pre>
    </div>
  );
}
