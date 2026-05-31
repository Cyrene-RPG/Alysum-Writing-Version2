import { useCallback, useEffect, useMemo, useState } from "react";
import { analyzePlot, computeScorecard } from "../lib/analyze";
import { actsForTemplate, createDefaultState, loadState, saveState } from "../lib/templates";
import type { PlotStudioState, Scene, Story, StructureTemplate } from "../types";
import { createId } from "../types";

export function useStoryStore() {
  const [state, setState] = useState<PlotStudioState>(() => loadState());

  useEffect(() => {
    saveState(state);
  }, [state]);

  const updateStory = useCallback((patch: Partial<Story>) => {
    setState(prev => ({ ...prev, story: { ...prev.story, ...patch } }));
  }, []);

  const setTemplate = useCallback((template: StructureTemplate) => {
    setState(prev => {
      const acts = actsForTemplate(template);
      const firstAct = acts[0]?.id ?? "";
      const scenes = prev.scenes.map(s => ({
        ...s,
        actId: acts.some(a => a.id === s.actId) ? s.actId : firstAct,
      }));
      return {
        ...prev,
        story: { ...prev.story, structureTemplate: template },
        acts,
        scenes,
      };
    });
  }, []);

  const upsertScene = useCallback((scene: Scene) => {
    setState(prev => {
      const exists = prev.scenes.some(s => s.id === scene.id);
      const scenes = exists
        ? prev.scenes.map(s => (s.id === scene.id ? scene : s))
        : [...prev.scenes, scene];
      return { ...prev, scenes };
    });
  }, []);

  const deleteScene = useCallback((id: string) => {
    setState(prev => ({ ...prev, scenes: prev.scenes.filter(s => s.id !== id) }));
  }, []);

  const reorderScenes = useCallback((actId: string, orderedIds: string[]) => {
    setState(prev => {
      const others = prev.scenes.filter(s => s.actId !== actId);
      const reordered = orderedIds.map((id, i) => {
        const scene = prev.scenes.find(s => s.id === id)!;
        return { ...scene, actId, order: i * 10 };
      });
      return { ...prev, scenes: [...others, ...reordered] };
    });
  }, []);

  const moveSceneToAct = useCallback((sceneId: string, targetActId: string, order: number) => {
    setState(prev => ({
      ...prev,
      scenes: prev.scenes.map(s =>
        s.id === sceneId ? { ...s, actId: targetActId, order } : s
      ),
    }));
  }, []);

  const addScene = useCallback((actId: string): Scene => {
    const id = createId("scene");
    const order =
      Math.max(0, ...state.scenes.filter(s => s.actId === actId).map(s => s.order)) + 10;
    const scene: Scene = {
      id,
      actId,
      order,
      title: "New scene",
      povCharacter: state.story.mainCharacter,
      location: "",
      goal: "",
      conflict: "",
      outcome: "",
      emotionalShift: "",
      plotlineId: "pl-a",
      beatTag: "",
      notes: "",
    };
    setState(prev => ({ ...prev, scenes: [...prev.scenes, scene] }));
    return scene;
  }, [state.scenes, state.story.mainCharacter]);

  const resetAll = useCallback(() => {
    setState(createDefaultState());
  }, []);

  const diagnoses = useMemo(() => analyzePlot(state), [state]);
  const scorecard = useMemo(() => computeScorecard(state, diagnoses), [state, diagnoses]);

  return {
    state,
    updateStory,
    setTemplate,
    upsertScene,
    deleteScene,
    reorderScenes,
    moveSceneToAct,
    addScene,
    resetAll,
    diagnoses,
    scorecard,
  };
}

export type StoryStore = ReturnType<typeof useStoryStore>;
