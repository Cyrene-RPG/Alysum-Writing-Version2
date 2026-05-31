import { useEffect } from "react";
import type { Plotline, Scene } from "../types";

interface Props {
  scene: Scene | null;
  plotlines: Plotline[];
  mainCharacter: string;
  onSave: (scene: Scene) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function SceneModal({ scene, plotlines, mainCharacter, onSave, onDelete, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!scene) return null;

  const set = (patch: Partial<Scene>) => onSave({ ...scene, ...patch });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-600 bg-surface-raised shadow-card"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
          <h3 className="text-lg font-semibold text-white">Edit scene</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>
        <div className="space-y-4 p-6">
          <label className="block">
            <span className="text-xs font-semibold uppercase text-slate-400">Scene title</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-white"
              value={scene.title}
              onChange={e => set({ title: e.target.value })}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold uppercase text-slate-400">POV character</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-white"
                value={scene.povCharacter}
                onChange={e => set({ povCharacter: e.target.value })}
                placeholder={mainCharacter}
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase text-slate-400">Location</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-white"
                value={scene.location}
                onChange={e => set({ location: e.target.value })}
              />
            </label>
          </div>
          {(
            [
              ["Goal", "goal"],
              ["Conflict", "conflict"],
              ["Outcome", "outcome"],
              ["Emotional shift", "emotionalShift"],
            ] as const
          ).map(([label, key]) => (
            <label key={key} className="block">
              <span className="text-xs font-semibold uppercase text-slate-400">{label}</span>
              <textarea
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-white"
                rows={2}
                value={scene[key]}
                onChange={e => set({ [key]: e.target.value })}
              />
            </label>
          ))}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold uppercase text-slate-400">Plotline</span>
              <select
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-white"
                value={scene.plotlineId}
                onChange={e => set({ plotlineId: e.target.value })}
              >
                {plotlines.map(pl => (
                  <option key={pl.id} value={pl.id}>
                    {pl.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase text-slate-400">Beat tag</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-white"
                value={scene.beatTag}
                onChange={e => set({ beatTag: e.target.value })}
                placeholder="inciting, midpoint, climax…"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-semibold uppercase text-slate-400">Notes</span>
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-white"
              rows={3}
              value={scene.notes}
              onChange={e => set({ notes: e.target.value })}
            />
          </label>
        </div>
        <div className="flex justify-between border-t border-slate-700 px-6 py-4">
          <button
            type="button"
            onClick={() => {
              if (confirm("Delete this scene?")) {
                onDelete(scene.id);
                onClose();
              }
            }}
            className="text-sm text-red-400 hover:text-red-300"
          >
            Delete scene
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
