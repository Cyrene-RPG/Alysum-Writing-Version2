/** Versioned formatting snapshots. Never writes to source books. */
export const DEFAULT_SETTINGS = Object.freeze({ trim: '6x9', font: 'Georgia', size: 11, leading: 1.5, margin: 0.65, gutter: 0.15, indent: 1.2, theme: 'classic', dropCap: false, recto: false, numbers: true });
export const THEMES = Object.freeze({ classic: { font: 'Georgia', ornament: '⁂' }, botanical: { font: 'Palatino Linotype', ornament: '❧' }, minimal: { font: 'Arial', ornament: '—' }, gothic: { font: 'Times New Roman', ornament: '◆' } });
export function validateProject(input) {
  if (!input || input.version !== 1 || !Array.isArray(input.chapters) || !input.chapters.length || input.chapters.length > 1000) throw new Error('This is not a supported Book Studio project.');
  const settings = { ...DEFAULT_SETTINGS, ...input.settings };
  if (!['5x8','5.5x8.5','6x9'].includes(settings.trim) || !Object.hasOwn(THEMES, settings.theme) || !['Georgia','Palatino Linotype','Arial','Times New Roman'].includes(settings.font)) throw new Error('Unsupported page style.');
  for (const [key, min, max] of [['size',9,18],['leading',1.1,2],['margin',0.4,1],['gutter',0,0.5],['indent',0,2]]) {
    settings[key] = Number(settings[key]);
    if (!Number.isFinite(settings[key]) || settings[key] < min || settings[key] > max) throw new Error(`Invalid ${key} setting.`);
  }
  for (const key of ['dropCap','recto','numbers']) settings[key] = settings[key] === true;
  const chapters = input.chapters.map((c, index) => {
    if (typeof c.html !== 'string' || c.html.length > 2_000_000) throw new Error('Invalid chapter content.');
    return { id: String(c.id || index), title: String(c.title || 'Untitled').slice(0,200), html: c.html, kind: ['front','body','back'].includes(c.kind) ? c.kind : 'body' };
  });
  if (new Set(chapters.map(c => c.id)).size !== chapters.length) throw new Error('Duplicate chapter identifiers.');
  return { version: 1, title: String(input.title || 'Untitled book').slice(0,200), author: String(input.author || '').slice(0,200), settings, chapters };
}
export function createProject(title, chapters) {
  return validateProject({ version: 1, title, author: '', settings: DEFAULT_SETTINGS, chapters });
}
export function moveChapter(project, index, offset) {
  const destination = index + offset;
  if (index < 0 || index >= project.chapters.length || destination < 0 || destination >= project.chapters.length) return project;
  const copy = structuredClone(project);
  const [chapter] = copy.chapters.splice(index, 1);
  copy.chapters.splice(destination, 0, chapter);
  return copy;
}
