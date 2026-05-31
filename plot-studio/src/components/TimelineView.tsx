import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import type { Act, Plotline, Scene } from "../types";

interface Props {
  acts: Act[];
  scenes: Scene[];
  plotlines: Plotline[];
  onAddScene: (actId: string) => Scene;
  onEditScene: (scene: Scene) => void;
  onReorder: (actId: string, orderedIds: string[]) => void;
}

function plotlineColor(plotlines: Plotline[], id: string): string {
  return plotlines.find(p => p.id === id)?.color ?? "#8b5cf6";
}

function SceneCard({
  scene,
  plotlines,
  onEdit,
  dragHandle,
}: {
  scene: Scene;
  plotlines: Plotline[];
  onEdit: () => void;
  dragHandle?: React.ReactNode;
}) {
  const color = plotlineColor(plotlines, scene.plotlineId);
  return (
    <div
      className="group cursor-pointer rounded-lg border border-slate-600/80 bg-slate-900/70 p-3 shadow-sm transition hover:border-accent/50 hover:shadow-glow"
      style={{ borderLeftWidth: 4, borderLeftColor: color }}
      onClick={onEdit}
    >
      <div className="flex items-start gap-2">
        {dragHandle}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-white">{scene.title || "Untitled scene"}</p>
          <p className="mt-0.5 truncate text-xs text-slate-400">
            {scene.povCharacter && `${scene.povCharacter} · `}
            {scene.location || "No location"}
          </p>
          {scene.goal && <p className="mt-2 line-clamp-2 text-xs text-slate-300">Goal: {scene.goal}</p>}
          {scene.beatTag && (
            <span className="mt-2 inline-block rounded bg-slate-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-accent-glow">
              {scene.beatTag}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function SortableScene({
  scene,
  plotlines,
  onEdit,
}: {
  scene: Scene;
  plotlines: Plotline[];
  onEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: scene.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <SceneCard
        scene={scene}
        plotlines={plotlines}
        onEdit={onEdit}
        dragHandle={
          <button
            type="button"
            className="mt-0.5 cursor-grab touch-none text-slate-500 hover:text-slate-300 active:cursor-grabbing"
            {...attributes}
            {...listeners}
            onClick={e => e.stopPropagation()}
            aria-label="Drag scene"
          >
            ⠿
          </button>
        }
      />
    </div>
  );
}

export function TimelineView({ acts, scenes, plotlines, onAddScene, onEditScene, onReorder }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const sortedActs = [...acts].sort((a, b) => a.order - b.order);
  const activeScene = activeId ? scenes.find(s => s.id === activeId) : null;

  function scenesForAct(actId: string) {
    return scenes.filter(s => s.actId === actId).sort((a, b) => a.order - b.order);
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const scene = scenes.find(s => s.id === active.id);
    if (!scene) return;
    const actScenes = scenesForAct(scene.actId);
    const ids = actScenes.map(s => s.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = [...ids];
    next.splice(oldIndex, 1);
    next.splice(newIndex, 0, String(active.id));
    onReorder(scene.actId, next);
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="font-display text-2xl font-semibold text-white">Visual timeline</h2>
        <p className="mt-1 text-slate-400">Drag scenes within an act. Click to edit goal, conflict, and outcome.</p>
      </header>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {sortedActs.map(act => {
          const actScenes = scenesForAct(act.id);
          return (
            <div
              key={act.id}
              className="flex w-72 shrink-0 flex-col rounded-xl border border-slate-700/60 bg-surface-raised/50"
            >
              <div className="border-b border-slate-700/60 px-4 py-3">
                <h3 className="text-sm font-bold text-white">{act.name}</h3>
                <p className="mt-0.5 text-xs text-slate-500">{act.description}</p>
              </div>
              <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <SortableContext items={actScenes.map(s => s.id)} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-1 flex-col gap-2 p-3 min-h-[120px]">
                    {actScenes.map(scene => (
                      <SortableScene
                        key={scene.id}
                        scene={scene}
                        plotlines={plotlines}
                        onEdit={() => onEditScene(scene)}
                      />
                    ))}
                  </div>
                </SortableContext>
                <DragOverlay>
                  {activeScene ? (
                    <SceneCard scene={activeScene} plotlines={plotlines} onEdit={() => {}} />
                  ) : null}
                </DragOverlay>
              </DndContext>
              <button
                type="button"
                onClick={() => onEditScene(onAddScene(act.id))}
                className="m-3 rounded-lg border border-dashed border-slate-600 py-2 text-sm text-slate-400 hover:border-accent hover:text-accent-glow"
              >
                + Add scene
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-slate-400">
        {plotlines.map(pl => (
          <span key={pl.id} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: pl.color }} />
            {pl.name}
          </span>
        ))}
      </div>
    </div>
  );
}
