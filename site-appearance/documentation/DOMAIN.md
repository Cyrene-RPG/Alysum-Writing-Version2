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
- `word_goal_mode` — `track` | `goal` | `pace` (UI: Daily Goal / Writers Challenge / Maintain your pace)
- `daily_writing_enabled` — master on/off; off still records `writing_day_totals`, just hides the tracker
- `writing_checkpoints` — Daily Goal mode day milestones, sorted int array e.g. `[200, 500, 1000]` (1 = a goal, 2+ = checkpoints)
- `writing_goal_hidden` — Daily Goal mode: true hides the Studio bar and pops a celebration on reach; false shows the bar

## Encyclopedia blob

Lore *about* a story, not chapter prose. Stored by `storage_key` in `encyclopedia_blobs` (histories, geography, cultures, magic, wiki links, city/realm builders).

## Not this domain

Plot-studio cards, notes vault, public comments/kudos — those get their own shapes when those apps are rebuilt.
