import type { Diagnosis, PlotStudioState, Scene, Scorecard, Severity } from "../types";
import { createId } from "../types";

function clampScore(n: number): number {
  return Math.max(1, Math.min(10, Math.round(n)));
}

function hasText(v: string | undefined): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

function scenesInAct(scenes: Scene[], actId: string): Scene[] {
  return scenes.filter(s => s.actId === actId).sort((a, b) => a.order - b.order);
}

function firstActId(state: PlotStudioState): string | undefined {
  return [...state.acts].sort((a, b) => a.order - b.order)[0]?.id;
}

function middleActIds(state: PlotStudioState): string[] {
  const sorted = [...state.acts].sort((a, b) => a.order - b.order);
  if (sorted.length <= 2) return sorted.slice(1).map(a => a.id);
  return sorted.slice(1, -1).map(a => a.id);
}

function lastActId(state: PlotStudioState): string | undefined {
  return [...state.acts].sort((a, b) => a.order - b.order).at(-1)?.id;
}

function sceneHasConflict(s: Scene): boolean {
  return hasText(s.conflict);
}

function sceneHasGoal(s: Scene): boolean {
  return hasText(s.goal);
}

function sceneHasOutcome(s: Scene): boolean {
  return hasText(s.outcome);
}

function sceneHasEmotionalShift(s: Scene): boolean {
  return hasText(s.emotionalShift);
}

function mkDiagnosis(
  category: string,
  title: string,
  diagnosis: string,
  whyItMatters: string,
  specificFix: string,
  exampleRewrite: string,
  severity: Severity,
  relatedSceneIds: string[] = []
): Diagnosis {
  return {
    id: createId("dx"),
    category,
    title,
    diagnosis,
    whyItMatters,
    specificFix,
    exampleRewrite,
    severity,
    relatedSceneIds,
  };
}

export function analyzePlot(state: PlotStudioState): Diagnosis[] {
  const { story, scenes } = state;
  const dx: Diagnosis[] = [];
  const sorted = [...scenes].sort((a, b) => a.order - b.order);
  const act1 = firstActId(state);
  const actMid = middleActIds(state);
  const actLast = lastActId(state);
  const act1Scenes = act1 ? scenesInAct(scenes, act1) : [];
  const midScenes = scenes.filter(s => actMid.includes(s.actId));
  const lastScenes = actLast ? scenesInAct(scenes, actLast) : [];

  if (!hasText(story.logline)) {
    dx.push(
      mkDiagnosis(
        "foundation",
        "Missing logline",
        `"${story.title || "Your story"}" has no logline yet — the Plot Doctor can't judge whether scenes build toward a clear promise.`,
        "The logline is your contract with the reader. Without it, structure checks become guesswork.",
        `Write one sentence: [Who] wants [goal] but [obstacle] forces [choice/stakes].`,
        `Example: "A grieving archivist must forge a forbidden treaty before the city's last library burns — but the man who destroyed her family holds the only key."`,
        "high"
      )
    );
  }

  if (sorted.length === 0) {
    dx.push(
      mkDiagnosis(
        "structure",
        "No scenes on the timeline",
        "Your timeline is empty. Add at least 5–8 scenes across acts before expecting meaningful structure feedback.",
        "Diagnosis compares goals, conflict, and outcomes across acts — it needs scene cards to work.",
        "Add an opening scene in Act I with a clear goal and disruption, then map your midpoint and climax.",
        "Act I scene: goal = 'deliver the sealed letter'; conflict = 'recipient is already dead'; outcome = 'letter mentions the antagonist by name'.",
        "high"
      )
    );
    return dx;
  }

  const incitingCandidates = act1Scenes.filter(
    s => sceneHasConflict(s) && (sceneHasOutcome(s) || /inciting|catalyst|disrupt|call|hook/i.test(s.beatTag + s.title))
  );
  if (act1Scenes.length >= 2 && incitingCandidates.length === 0) {
    dx.push(
      mkDiagnosis(
        "structure",
        "Weak or missing inciting incident",
        `Act I has ${act1Scenes.length} scene(s) but none clearly disrupt the status quo with conflict + outcome.`,
        "Readers need a definitive break into the story problem early — usually by end of Act I.",
        `Tag one Act I scene as "inciting" and give it an outcome that makes the protagonist's old plan impossible.`,
        `Rewrite outcome: "She can't return the ring — it's engraved with the regime's sigil, and soldiers are already at the door."`,
        "high",
        act1Scenes.map(s => s.id)
      )
    );
  }

  if (midScenes.length >= 3) {
    const lowConflictMid = midScenes.filter(s => !sceneHasConflict(s)).length;
    const ratio = lowConflictMid / midScenes.length;
    if (ratio >= 0.5) {
      dx.push(
        mkDiagnosis(
          "pacing",
          "Sagging middle — low conflict density",
          `${Math.round(ratio * 100)}% of middle-act scenes (${lowConflictMid}/${midScenes.length}) lack a filled Conflict field.`,
          "Act II bloat happens when scenes explore without opposing force. Stakes flatline.",
          "For each middle scene, add who or what opposes the POV goal — even internal conflict counts.",
          `Scene "${midScenes[0]?.title || "Midpoint setup"}": conflict = "Her ally refuses to share the map unless she abandons the rescue."`,
          "high",
          midScenes.filter(s => !sceneHasConflict(s)).map(s => s.id)
        )
      );
    }
  }

  const stakesSignals = sorted.filter(
    s => /stake|life|death|lose|cost|deadline|never|must|can't afford|everything/i.test(
      `${s.conflict} ${s.outcome} ${s.notes} ${s.goal}`
    )
  );
  if (sorted.length >= 4 && stakesSignals.length < Math.ceil(sorted.length * 0.25)) {
    dx.push(
      mkDiagnosis(
        "stakes",
        "Low visible stakes",
        `Only ${stakesSignals.length} of ${sorted.length} scenes mention concrete cost, loss, or urgency in goal/conflict/outcome.`,
        "Readers commit when they know what can be lost. Abstract goals feel low-pressure.",
        `In your next two scenes, state what the POV character loses if they fail — relationship, status, life, secret, deadline.`,
        `Goal rewrite: "Get the antidote" → "Get the antidote before the fever breaks at dawn — or bury her sister without knowing who poisoned her."`,
        "medium"
      )
    );
  }

  const mc = story.mainCharacter.trim().toLowerCase();
  const passiveScenes = sorted.filter(s => {
    const pov = (s.povCharacter || "").trim().toLowerCase();
    const isMc = mc && pov === mc;
    return isMc && sceneHasGoal(s) && !sceneHasConflict(s) && /wait|watch|think|remember|hope|wonder/i.test(s.goal);
  });
  if (passiveScenes.length >= 2) {
    dx.push(
      mkDiagnosis(
        "character",
        "Passive protagonist stretches",
        `${story.mainCharacter || "Your protagonist"} drives ${passiveScenes.length} scene(s) with reactive goals (wait, watch, wonder) and no conflict.`,
        "Agency keeps readers aligned with the hero. Passive stretches feel like filler.",
        "Convert observation beats into decisions: what choice does the POV make despite risk?",
        `"Instead of 'Mira waits for news', try 'Mira intercepts the courier — even if it exposes her forgery.'`,
        "medium",
        passiveScenes.map(s => s.id)
      )
    );
  }

  if (!hasText(story.antagonist) && sorted.length >= 3) {
    dx.push(
      mkDiagnosis(
        "character",
        "Unclear antagonist pressure",
        "No antagonist is defined on the dashboard, and few scenes name an opposing force tied to a person or institution.",
        "Antagonist pressure clarifies why scenes matter — opposition shapes pacing and theme.",
        `Fill Antagonist on the dashboard, then tag 2+ scenes where their pressure directly blocks the POV goal.`,
        `Antagonist: "Commander Hale — controls the archives and erased the protagonist's family record."`,
        "high"
      )
    );
  } else if (hasText(story.antagonist)) {
    const ant = story.antagonist.toLowerCase();
    const antPressure = sorted.filter(s =>
      `${s.conflict} ${s.notes} ${s.outcome}`.toLowerCase().includes(ant.split(" ")[0] ?? "")
    );
    if (sorted.length >= 5 && antPressure.length === 0) {
      dx.push(
        mkDiagnosis(
          "character",
          "Antagonist absent from scene pressure",
          `"${story.antagonist}" is defined but not referenced in any scene conflict, outcome, or notes.`,
          "Named villains must exert force on the page — otherwise the middle feels directionless.",
          `Add the antagonist (or their agents) blocking the POV in Act II and again before the climax.`,
          `Conflict: "${story.antagonist}'s clerk rejects the petition — the window for appeal closes at midnight."`,
          "medium"
        )
      );
    }
  }

  const midpointAct = actMid[Math.floor(actMid.length / 2)] ?? actMid[0];
  const midpointScenes = midpointAct ? scenesInAct(scenes, midpointAct) : [];
  const reversalScenes = sorted.filter(s =>
    /midpoint|reversal|twist|turn|false victory|false defeat|all is lost|ordeal/i.test(s.beatTag + s.title) ||
    sceneHasEmotionalShift(s) && /reversal|twist|shift|turn|realiz|discover/i.test(s.emotionalShift)
  );
  if (sorted.length >= 6 && reversalScenes.length === 0 && midpointScenes.length > 0) {
    dx.push(
      mkDiagnosis(
        "structure",
        "Missing midpoint reversal",
        `No scene is tagged or written as a midpoint turn, despite ${midScenes.length} middle-act scene(s).`,
        "The midpoint redefines the story question — victory becomes loss or vice versa.",
        `Mark your central Act II scene with beat tag "midpoint" and flip the protagonist's assumption in the outcome.`,
        `Outcome: "The rescue succeeds — but the hostage is the antagonist's daughter, and now the city wants her dead too."`,
        "high",
        midpointScenes.map(s => s.id)
      )
    );
  }

  const climaxCandidates = lastScenes.filter(s => sceneHasConflict(s) && sceneHasOutcome(s));
  if (lastScenes.length >= 2 && climaxCandidates.length === 0) {
    dx.push(
      mkDiagnosis(
        "structure",
        "Weak climax setup",
        `Final act has ${lastScenes.length} scene(s) but none combine clear conflict + outcome for a climax beat.`,
        "The climax pays off promises from Act I. Without concentrated opposition, endings feel rushed or soft.",
        "Ensure your last or penultimate scene escalates to maximum opposition tied to the logline stakes.",
        `Climax scene: goal = "stop the ritual"; conflict = "protagonist must sacrifice the memory that proves their identity"; outcome = "ritual breaks — but they forget their own name."`,
        "high",
        lastScenes.map(s => s.id)
      )
    );
  }

  if (hasText(story.mainCharacter)) {
    const mcScenes = sorted.filter(s => s.povCharacter.trim().toLowerCase() === mc);
    const arcShifts = mcScenes.filter(sceneHasEmotionalShift);
    if (mcScenes.length >= 3 && arcShifts.length < 2) {
      dx.push(
        mkDiagnosis(
          "character",
          "Character arc gaps",
          `${story.mainCharacter} POV appears in ${mcScenes.length} scenes but only ${arcShifts.length} record an emotional shift.`,
          "Arc is visible through changing emotion under pressure — not just plot events.",
          "Add emotional shift to opening, midpoint, and climax POV scenes (fear→defiance, trust→betrayal).",
          `Emotional shift: "Resigned → furious when she recognizes the seal on the warrant."`,
          "medium",
          mcScenes.map(s => s.id)
        )
      );
    }
  }

  if (sorted.length >= 6) {
    const orders = sorted.map(s => s.order);
    const gaps: number[] = [];
    for (let i = 1; i < orders.length; i++) {
      const gap = orders[i] - orders[i - 1];
      if (gap > 15) gaps.push(gap);
    }
    const emptyGoals = sorted.filter(s => !sceneHasGoal(s)).length;
    if (emptyGoals / sorted.length >= 0.4) {
      dx.push(
        mkDiagnosis(
          "pacing",
          "Pacing blur — scenes lack goals",
          `${emptyGoals} of ${sorted.length} scenes have no POV goal filled in.`,
          "Goal-less scenes read as vignettes. The timeline can't diagnose rhythm without intent per beat.",
          "Fill Goal for every scene in one pass — even if goal is 'hide the truth' or 'survive the hour'.",
          "Goal: 'Extract the confession without revealing she already knows the answer.'",
          "medium"
        )
      );
    }
  }

  const plotlineIds = new Set(state.plotlines.map(p => p.id));
  const openSubplots = state.plotlines
    .filter(pl => pl.id !== "pl-a")
    .filter(pl => {
      const plScenes = sorted.filter(s => s.plotlineId === pl.id);
      if (plScenes.length === 0) return false;
      const last = plScenes.at(-1)!;
      return !/resolv|close|payoff|end|reunite|reveal|solve|complete/i.test(last.outcome + last.notes + last.beatTag);
    });
  if (openSubplots.length > 0 && sorted.length >= 5) {
    for (const pl of openSubplots) {
      const plScenes = sorted.filter(s => s.plotlineId === pl.id);
      dx.push(
        mkDiagnosis(
          "continuity",
          `Unresolved subplot: ${pl.name}`,
          `"${pl.name}" appears in ${plScenes.length} scene(s) but the last beat (${plScenes.at(-1)?.title || "untitled"}) doesn't resolve it.`,
          "Dropped subplots erode trust — readers remember promises.",
          `Add a payoff scene in Act III or merge this thread into the climax outcome.`,
          `Final ${pl.name} beat: outcome = "She returns the locket — the inscription finally makes the theme explicit."`,
          "low",
          plScenes.map(s => s.id)
        )
      );
    }
  }

  const dupLocationNoShift = sorted.filter((s, i, arr) => {
    if (!s.location.trim()) return false;
    const prev = arr[i - 1];
    if (!prev || prev.location.trim().toLowerCase() !== s.location.trim().toLowerCase()) return false;
    return !sceneHasEmotionalShift(s) && !sceneHasOutcome(s);
  });
  if (dupLocationNoShift.length >= 2) {
    dx.push(
      mkDiagnosis(
        "continuity",
        "Stagnant location chain",
        `${dupLocationNoShift.length} consecutive scenes repeat the same location without outcome or emotional shift.`,
        "Same-place sequences need escalation or they feel like one long scene split artificially.",
        "Merge static beats or change location / add a turn in outcome between same-setting scenes.",
        "Insert outcome: 'The conversation ends — she now has the key, but the guard saw her face.'",
        "low",
        dupLocationNoShift.map(s => s.id)
      )
    );
  }

  if (hasText(story.theme) && sorted.length >= 4) {
    const themeWords = story.theme.toLowerCase().split(/\W+/).filter(w => w.length > 4);
    const themeHits = sorted.filter(s =>
      themeWords.some(w => `${s.notes} ${s.outcome} ${s.emotionalShift}`.toLowerCase().includes(w))
    );
    if (themeHits.length === 0) {
      dx.push(
        mkDiagnosis(
          "theme",
          "Theme not visible in scenes",
          `Theme "${story.theme}" isn't echoed in any scene outcome, emotional shift, or notes.`,
          "Theme should emerge from choices under pressure — not just the dashboard.",
          "Add one line in notes or outcome showing the theme tested: mercy vs justice, truth vs loyalty.",
          `Notes: "She could lie to save him — theme: is mercy still mercy if it teaches him to lie too?"`,
          "medium"
        )
      );
    }
  }

  if (hasText(story.endingSummary) && lastScenes.length > 0) {
    const endKeywords = story.endingSummary.toLowerCase().split(/\W+/).filter(w => w.length > 4).slice(0, 5);
    const lastText = lastScenes.map(s => `${s.outcome} ${s.notes}`).join(" ").toLowerCase();
    const aligned = endKeywords.some(w => lastText.includes(w));
    if (!aligned) {
      dx.push(
        mkDiagnosis(
          "structure",
          "Ending summary doesn't match final scenes",
          "Your dashboard ending summary doesn't share key terms with the last act scene outcomes.",
          "Mismatched endings feel accidental — readers sense the author lost the thread.",
          "Revise final scene outcomes or update ending summary so the climax explicitly delivers the promised image.",
          `If ending is "she burns the letters and walks away", final outcome should mention burning, leaving, or the cost of that choice.`,
          "medium",
          lastScenes.map(s => s.id)
        )
      );
    }
  }

  if (!plotlineIds.size) {
    /* noop */
  }

  return dx.sort((a, b) => {
    const rank: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
    return rank[a.severity] - rank[b.severity];
  });
}

export function computeScorecard(state: PlotStudioState, diagnoses: Diagnosis[]): Scorecard {
  const { story, scenes } = state;
  const sorted = [...scenes].sort((a, b) => a.order - b.order);
  const n = sorted.length || 1;
  const high = diagnoses.filter(d => d.severity === "high").length;
  const med = diagnoses.filter(d => d.severity === "medium").length;

  const withGoal = sorted.filter(s => hasText(s.goal)).length;
  const withConflict = sorted.filter(s => hasText(s.conflict)).length;
  const withShift = sorted.filter(s => hasText(s.emotionalShift)).length;

  const structure = clampScore(10 - high * 1.8 - med * 0.6 + (sorted.length >= 5 ? 1 : 0));
  const characterMotivation = clampScore(
    (withGoal / n) * 10 * 0.6 + (hasText(story.mainCharacter) ? 2 : 0) + (withShift / n) * 2
  );
  const stakes = clampScore(
    10 -
      diagnoses.filter(d => d.category === "stakes").length * 2.5 -
      (hasText(story.logline) ? 0 : 2)
  );
  const conflict = clampScore((withConflict / n) * 10);
  const pacing = clampScore(
    10 - diagnoses.filter(d => d.category === "pacing").length * 2 - (sorted.length < 4 ? 2 : 0)
  );
  const emotionalArc = clampScore((withShift / n) * 10);
  const themeIntegration = clampScore(
    hasText(story.theme)
      ? 10 - diagnoses.filter(d => d.category === "theme").length * 3
      : 4
  );
  const endingPayoff = clampScore(
    10 -
      diagnoses.filter(d => d.title.toLowerCase().includes("climax") || d.title.toLowerCase().includes("ending")).length *
        2.5 -
      (hasText(story.endingSummary) ? 0 : 1.5)
  );

  const overall = clampScore(
    (structure + characterMotivation + stakes + conflict + pacing + emotionalArc + themeIntegration + endingPayoff) / 8
  );

  return {
    structure,
    characterMotivation,
    stakes,
    conflict,
    pacing,
    emotionalArc,
    themeIntegration,
    endingPayoff,
    overall,
  };
}
