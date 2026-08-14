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

## Encyclopedia blob

Lore *about* a story, not chapter prose. Stored by `storage_key` in `encyclopedia_blobs` (histories, geography, cultures, magic, wiki links, city/realm builders).

## Not this domain

Plot-studio cards, notes vault, public comments/kudos — those get their own shapes when those apps are rebuilt.
