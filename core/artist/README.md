# Artist (core)

Character roster, provenance (phase 3a), and hub profile fields. No DOM.

SQL: `supabase/remake/migrations/supabase-artist-foundation.sql` (staging / remake only).

Public images require `protection_declared` on `artist_artworks` when `visibility = public` (Glaze / Nightshade BYO).

The public gallery (`/artist-shop?u=`) lists only opted-in adopts, sales, and open commissions for that artist. Checkout links leave Alysum. There is no site-wide image directory.
