import { useEffect, useMemo, useState } from "react";
import { DiagnosisPanel } from "./components/DiagnosisPanel";
import { ExportReport } from "./components/ExportReport";
import { SceneModal } from "./components/SceneModal";
import { ScorecardView } from "./components/ScorecardView";
import { Sidebar } from "./components/Sidebar";
import { StoryDashboard } from "./components/StoryDashboard";
import { TimelineView } from "./components/TimelineView";
import {
  fetchAlysumBook,
  flattenBookChapters,
  readBookIdFromUrl,
  scenesFromBookChapters,
} from "./lib/bookLoad";
import { loadState } from "./lib/templates";
import { useStoryStore } from "./hooks/useStoryStore";
import type { NavPage, Scene } from "./types";

// @ts-expect-error — shared Alysum Supabase client (parent folder)
import { supabase } from "../../firebase.js";

export default function App() {
  const bookId = useMemo(() => readBookIdFromUrl(), []);
  const store = useStoryStore(bookId);
  const [page, setPage] = useState<NavPage>("dashboard");
  const [editingScene, setEditingScene] = useState<Scene | null>(null);
  const [importOffer, setImportOffer] = useState<number | null>(null);
  const [bootDone, setBootDone] = useState(false);

  const editorHref = bookId ? `../editor.html?book=${encodeURIComponent(bookId)}` : "../writer-dashboard.html";
  const bibleHref = bookId ? `../Story-Bible-New.html?book=${encodeURIComponent(bookId)}` : "../Story-Bible-New.html";

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
        const chapters = flattenBookChapters(book.sections);
        const local = loadState(bookId);
        store.updateStory({ title: book.title || local.story.title });
        if (local.scenes.length === 0 && chapters.length > 0) {
          setImportOffer(chapters.length);
        }
      } catch (e) {
        console.warn("[plot-doctor] book bootstrap failed:", e);
      } finally {
        if (!cancelled) setBootDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const highIssues = store.diagnoses.filter(d => d.severity === "high").length;

  function importChaptersAsScenes() {
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid || !bookId) return;
      const book = await fetchAlysumBook(supabase, uid, bookId);
      if (!book) return;
      const chapters = flattenBookChapters(book.sections);
      const scenes = scenesFromBookChapters(chapters, store.state.acts);
      store.replaceState({
        ...store.state,
        story: { ...store.state.story, title: book.title || store.state.story.title },
        scenes,
      });
      setImportOffer(null);
      setPage("timeline");
    })();
  }

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
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Plot Doctor</p>
            <p className="text-sm text-slate-300">
              {store.state.scenes.length} scene{store.state.scenes.length !== 1 ? "s" : ""} · Overall{" "}
              <span className="font-bold text-gold">{store.scorecard.overall}/10</span>
              {highIssues > 0 && (
                <span className="ml-2 text-amber-400">· {highIssues} high priority</span>
              )}
              {bookId && <span className="ml-2 text-slate-500">· linked to book</span>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={editorHref}
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:text-white"
            >
              ← Editor
            </a>
            <a
              href={bibleHref}
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:text-white"
            >
              Story Bible
            </a>
            <button
              type="button"
              onClick={() => {
                if (confirm("Reset Plot Doctor data for this book? This cannot be undone.")) store.resetAll();
              }}
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-400 hover:border-red-500/50 hover:text-red-300"
            >
              Reset
            </button>
          </div>
        </header>

        {importOffer !== null && bootDone && (
          <div className="border-b border-accent/30 bg-accent/10 px-6 py-4">
            <p className="text-sm text-slate-200">
              <strong>{importOffer} chapters</strong> found in your Alysum manuscript. Import them as scene cards
              to start Plot Doctor analysis?
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={importChaptersAsScenes}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90"
              >
                Import chapters as scenes
              </button>
              <button
                type="button"
                onClick={() => setImportOffer(null)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-400"
              >
                Start blank
              </button>
            </div>
          </div>
        )}

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
