import { useState } from "react";
import { DiagnosisPanel } from "./components/DiagnosisPanel";
import { ExportReport } from "./components/ExportReport";
import { SceneModal } from "./components/SceneModal";
import { ScorecardView } from "./components/ScorecardView";
import { Sidebar } from "./components/Sidebar";
import { StoryDashboard } from "./components/StoryDashboard";
import { TimelineView } from "./components/TimelineView";
import { useStoryStore } from "./hooks/useStoryStore";
import type { NavPage, Scene } from "./types";

export default function App() {
  const store = useStoryStore();
  const [page, setPage] = useState<NavPage>("dashboard");
  const [editingScene, setEditingScene] = useState<Scene | null>(null);

  const highIssues = store.diagnoses.filter(d => d.severity === "high").length;

  return (
    <div className="flex min-h-screen">
      <Sidebar
        page={page}
        onNavigate={setPage}
        storyTitle={store.state.story.title}
        issueCount={store.diagnoses.length}
      />
      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-700/60 bg-surface-raised/40 px-6 py-4 backdrop-blur">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Plot Studio</p>
            <p className="text-sm text-slate-300">
              {store.state.scenes.length} scene{store.state.scenes.length !== 1 ? "s" : ""} · Overall{" "}
              <span className="font-bold text-gold">{store.scorecard.overall}/10</span>
              {highIssues > 0 && (
                <span className="ml-2 text-amber-400">· {highIssues} high priority</span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <a
              href="../writer-dashboard.html"
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-400 hover:text-white"
            >
              ← Studio
            </a>
            <button
              type="button"
              onClick={() => {
                if (confirm("Reset all Plot Studio data? This cannot be undone.")) store.resetAll();
              }}
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-400 hover:border-red-500/50 hover:text-red-300"
            >
              Reset
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-6 lg:p-8">
          {page === "dashboard" && (
            <StoryDashboard
              story={store.state.story}
              onChange={store.updateStory}
              onTemplateChange={store.setTemplate}
            />
          )}
          {page === "timeline" && (
            <TimelineView
              acts={store.state.acts}
              scenes={store.state.scenes}
              plotlines={store.state.plotlines}
              onAddScene={actId => store.addScene(actId)}
              onEditScene={setEditingScene}
              onReorder={store.reorderScenes}
            />
          )}
          {page === "diagnosis" && (
            <DiagnosisPanel diagnoses={store.diagnoses} onJumpToTimeline={() => setPage("timeline")} />
          )}
          {page === "scorecard" && <ScorecardView scorecard={store.scorecard} />}
          {page === "report" && (
            <ExportReport
              story={store.state.story}
              scorecard={store.scorecard}
              diagnoses={store.diagnoses}
              scenes={store.state.scenes}
            />
          )}
        </div>
      </main>

      <SceneModal
        scene={editingScene}
        plotlines={store.state.plotlines}
        mainCharacter={store.state.story.mainCharacter}
        onSave={scene => {
          store.upsertScene(scene);
          setEditingScene(scene);
        }}
        onDelete={store.deleteScene}
        onClose={() => setEditingScene(null)}
      />
    </div>
  );
}
