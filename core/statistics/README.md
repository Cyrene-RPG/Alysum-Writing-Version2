# Statistics

XP, reputation, writing XP (Word Wars only), and engagement windows.

No HTML, CSS, or `document`. Applications import these modules.

| File | Purpose |
| --- | --- |
| awards.js | **Only place to change XP amounts** |
| xp-levels.js | User levels 1–30 and border bands |
| rep-levels.js | Rep levels 1–50, give caps, gem color/cut |
| gem-look.js | Rep level → CSS class names |
| writing-xp.js | Word Wars sentence states, paste rules, 2k/10k milestones |
| sentence-split.js | Dialogue-aware sentence extract from chapter HTML |
| grammar-hints.js | Cheap verb / word-list hints for Layer 2 |
| grammar-check.js | LanguageTool (free) request + match scoring — war-finish job only |
| review-marks.js | Already-checked spans in chapter HTML; skip on the next Word Wars scan |
| eligibility.js | Layers 0–3: paste, uniqueness, grammar, LanguageTool queue, AI-score hook |
| engagement-xp.js | Comment 24h window, review 15→5 after 7 days |

Daily typed word totals stay in `writing-engine/day-stats.js`. This folder does not own the manuscript.

Print spec: `/statistics-spec.html` (applications/main-site/pages).
