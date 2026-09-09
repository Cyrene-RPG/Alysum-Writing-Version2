# Domain

Shapes the products share. If editor and library disagree, data corrupts. Current modules still mix snake_case from Supabase; convert at the data-access layer on the rewrite pass.

## Book

A manuscript.

- `id`
- `title`
- `words`
- `media_format` — novel, screenplay, comic, and related
- `sections` — `{ front, body, back }`, each an array of chapters
- `publish_meta` / library fields when published

## Chapter

An entry in a section.

- `id` — `ch_…`
- `title`
- `content`
- `order`
- `words`

## Version

A snapshot of a book.

- `title`, `media_format`, `sections`, `words`, `content_hash`
- `source` — `manual` | `auto` | `checkpoint` | `structural`

## User

Account plus studio stats.

- `id`, `username`, `display_name`
- `account_type` — `author` | `reader` | `both`
- `daily_word_goal`, `writing_day_totals`, `streak`
- `word_goal_mode` — `track` (UI: Writer Goals) | `pace` (Maintain your pace). Legacy `goal` normalizes to `track`.
- `daily_writing_enabled` — master on/off; off still records `writing_day_totals`, just hides the tracker
- `writing_goal` — Writer Goals daily goal, its own int (`0` = no goal). Separate from legacy `daily_word_goal`.
- `writing_checkpoints` — Writer Goals checkpoint marks below the goal, sorted int array e.g. `[200, 500]`
- `writing_goal_hidden` — Writer Goals mode: true hides the Studio bar and pops a celebration on reach; false shows the bar
- `writing_weekday_goals` — Writer Goals recurring per-weekday overrides, `{ "<getDay()>": { goal, checkpoints } }` (0=Sun..6=Sat); weekday absent = base goal + checkpoints, `goal: 0` = no goal that day. Legacy bare-number values are read as `{ goal: n, checkpoints: [] }`.

## Encyclopedia blob

Lore *about* a story, not chapter prose. Stored by `storage_key` in `encyclopedia_blobs` (histories, geography, cultures, magic, wiki links, city/realm builders).

## Not this domain

Plot-studio cards, notes vault, public comments/kudos — those get their own shapes when those apps are rebuilt.
