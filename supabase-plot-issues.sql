-- Plot Doctor: per-book plot issue findings.
-- Run once in the Supabase SQL editor on the same project as the rest of the Alysum tables.
-- Follows the same RLS pattern as story_bible_characters (auth.uid() = user_id).

CREATE TABLE IF NOT EXISTS public.plot_issues (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    book_id text NOT NULL,
    chapter_id text NOT NULL DEFAULT '',
    chapter_section text NOT NULL DEFAULT '',
    category text NOT NULL,
    severity text NOT NULL DEFAULT 'warn',
    confidence numeric(3, 2) NOT NULL DEFAULT 0.80,
    claim_text text NOT NULL DEFAULT '',
    claim_range_start integer,
    claim_range_end integer,
    evidence_kind text NOT NULL DEFAULT '',
    evidence_ref text NOT NULL DEFAULT '',
    evidence_summary text NOT NULL DEFAULT '',
    engine text NOT NULL DEFAULT '',
    dedupe_key text NOT NULL,
    status text NOT NULL DEFAULT 'open',
    user_note text NOT NULL DEFAULT '',
    first_seen_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT plot_issues_category_check CHECK (
        category IN (
            'attribute_contradiction',
            'name_drift',
            'dead_character_speaks'
        )
    ),
    CONSTRAINT plot_issues_severity_check CHECK (
        severity IN ('info', 'warn', 'contradiction')
    ),
    CONSTRAINT plot_issues_status_check CHECK (
        status IN ('open', 'acknowledged', 'dismissed', 'fixed', 'stale')
    ),
    CONSTRAINT plot_issues_confidence_range CHECK (
        confidence >= 0 AND confidence <= 1
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS plot_issues_book_dedupe_uidx
    ON public.plot_issues (book_id, dedupe_key);

CREATE INDEX IF NOT EXISTS plot_issues_book_status_category_idx
    ON public.plot_issues (book_id, status, category);

CREATE INDEX IF NOT EXISTS plot_issues_book_chapter_status_idx
    ON public.plot_issues (book_id, chapter_id, status);

CREATE INDEX IF NOT EXISTS plot_issues_book_last_seen_idx
    ON public.plot_issues (book_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS plot_issues_user_book_idx
    ON public.plot_issues (user_id, book_id);

ALTER TABLE public.plot_issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plot_issues_own" ON public.plot_issues;
CREATE POLICY "plot_issues_own" ON public.plot_issues
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.plot_issues TO authenticated;
