# Writing engine

Manuscript model: chapters, versions, word count, media format.

Must not talk to storage or the network after the rewrite pass. Today's files still mix I/O; that is legacy.

| File | Was |
| --- | --- |
| media-format.js | book-media-format.js |
| version-api.js | book-version-api.js |
| day-stats.js | writing-day-stats.js |
