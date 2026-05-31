import type { Story, StructureTemplate } from "../types";
import { STRUCTURE_TEMPLATES } from "../lib/templates";

interface Props {
  story: Story;
  onChange: (patch: Partial<Story>) => void;
  onTemplateChange: (t: StructureTemplate) => void;
}

function Field({
  label,
  value,
  onChange,
  multiline = false,
  placeholder = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const cls =
    "mt-1 w-full rounded-lg border border-slate-600/80 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50";
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      {multiline ? (
        <textarea
          className={`${cls} min-h-[88px] resize-y`}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
        />
      ) : (
        <input
          className={cls}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}
    </label>
  );
}

export function StoryDashboard({ story, onChange, onTemplateChange }: Props) {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <h2 className="font-display text-2xl font-semibold text-white">Story dashboard</h2>
        <p className="mt-1 text-slate-400">Foundation metadata Plot Doctor uses for specific diagnoses.</p>
      </header>

      <section className="rounded-xl border border-slate-700/60 bg-surface-raised/60 p-6 shadow-card">
        <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-accent-glow">Structure template</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {STRUCTURE_TEMPLATES.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => onTemplateChange(t.id)}
              className={`rounded-lg border p-4 text-left transition ${
                story.structureTemplate === t.id
                  ? "border-accent bg-accent/15 ring-1 ring-accent/40"
                  : "border-slate-600/60 bg-slate-900/40 hover:border-slate-500"
              }`}
            >
              <p className="font-semibold text-white">{t.label}</p>
              <p className="mt-1 text-xs text-slate-400">{t.description}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-5 rounded-xl border border-slate-700/60 bg-surface-raised/60 p-6 shadow-card md:grid-cols-2">
        <Field label="Title" value={story.title} onChange={v => onChange({ title: v })} />
        <Field label="Genre" value={story.genre} onChange={v => onChange({ genre: v })} placeholder="Fantasy, thriller…" />
        <Field
          label="Target audience"
          value={story.targetAudience}
          onChange={v => onChange({ targetAudience: v })}
          placeholder="Adult, YA…"
        />
        <Field
          label="Main character"
          value={story.mainCharacter}
          onChange={v => onChange({ mainCharacter: v })}
          placeholder="Protagonist name"
        />
        <Field
          label="Antagonist"
          value={story.antagonist}
          onChange={v => onChange({ antagonist: v })}
          placeholder="Person or force of opposition"
        />
        <Field label="Theme" value={story.theme} onChange={v => onChange({ theme: v })} placeholder="Mercy vs justice…" />
        <div className="md:col-span-2">
          <Field
            label="Logline"
            value={story.logline}
            onChange={v => onChange({ logline: v })}
            multiline
            placeholder="One sentence: who wants what, why they can't, what's at stake"
          />
        </div>
        <div className="md:col-span-2">
          <Field
            label="Story world"
            value={story.storyWorld}
            onChange={v => onChange({ storyWorld: v })}
            multiline
            placeholder="Setting, rules, tone, time period"
          />
        </div>
        <div className="md:col-span-2">
          <Field
            label="Ending summary"
            value={story.endingSummary}
            onChange={v => onChange({ endingSummary: v })}
            multiline
            placeholder="How the story resolves — image, choice, cost"
          />
        </div>
      </section>
    </div>
  );
}
