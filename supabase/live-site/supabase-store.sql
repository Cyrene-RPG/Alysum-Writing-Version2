-- Alysum Store: profile-picture decorations, inventory, and equip.
-- Safe to re-run. Depends on public.users (supabase-base-schema.sql).
--
-- Paid checkout is not live yet. claim_store_item() only works for the founder
-- account (Pheonixstreem). Everyone else has to buy when Stripe is wired.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS equipped_pfp_decoration text;

COMMENT ON COLUMN public.users.equipped_pfp_decoration IS
  'store_items.id of the equipped profile-picture overlay, or null.';

CREATE TABLE IF NOT EXISTS public.store_items (
  id text PRIMARY KEY,
  kind text NOT NULL DEFAULT 'pfp_decoration',
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd',
  image_path text NOT NULL,
  overlay_scale numeric NOT NULL DEFAULT 1.58,
  is_published boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.store_inventory (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  item_id text NOT NULL REFERENCES public.store_items (id) ON DELETE CASCADE,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'purchase',
  PRIMARY KEY (user_id, item_id)
);

CREATE INDEX IF NOT EXISTS store_inventory_user_idx ON public.store_inventory (user_id);
CREATE INDEX IF NOT EXISTS store_items_kind_published_idx
  ON public.store_items (kind, is_published, sort_order);

ALTER TABLE public.store_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "store_items_public_read" ON public.store_items;
CREATE POLICY "store_items_public_read" ON public.store_items
  FOR SELECT TO anon, authenticated
  USING (is_published = true);

DROP POLICY IF EXISTS "store_inventory_own_read" ON public.store_inventory;
CREATE POLICY "store_inventory_own_read" ON public.store_inventory
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT ON public.store_items TO anon, authenticated;
GRANT SELECT ON public.store_inventory TO authenticated;

INSERT INTO public.store_items (
  id, kind, name, description, price_cents, image_path, overlay_scale, sort_order
) VALUES (
  'sakura-wreath',
  'pfp_decoration',
  'Sakura Wreath',
  'A painterly cherry-blossom ring that sits over your profile picture.',
  299,
  'assets/store/pfp-decorations/sakura-wreath.png',
  1.58,
  10
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_cents = EXCLUDED.price_cents,
  image_path = EXCLUDED.image_path,
  overlay_scale = EXCLUDED.overlay_scale,
  sort_order = EXCLUDED.sort_order,
  is_published = true;

CREATE OR REPLACE FUNCTION public.claim_store_item(p_item_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.store_items%ROWTYPE;
  v_is_founder boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be logged in.';
  END IF;

  SELECT * INTO v_item
  FROM public.store_items
  WHERE id = btrim(p_item_id)
    AND is_published = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That item is not available.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND lower(username) = lower('Pheonixstreem')
  ) INTO v_is_founder;

  IF NOT v_is_founder THEN
    RAISE EXCEPTION 'Checkout is not open yet.';
  END IF;

  INSERT INTO public.store_inventory (user_id, item_id, source)
  VALUES (auth.uid(), v_item.id, 'founder')
  ON CONFLICT (user_id, item_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'itemId', v_item.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.equip_pfp_decoration(p_item_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be logged in.';
  END IF;

  v_id := nullif(btrim(coalesce(p_item_id, '')), '');

  IF v_id IS NULL THEN
    UPDATE public.users
    SET equipped_pfp_decoration = NULL
    WHERE id = auth.uid();
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.store_inventory
    WHERE user_id = auth.uid()
      AND item_id = v_id
  ) THEN
    RAISE EXCEPTION 'You do not own that decoration.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.store_items
    WHERE id = v_id
      AND kind = 'pfp_decoration'
      AND is_published = true
  ) THEN
    RAISE EXCEPTION 'That decoration is not available.';
  END IF;

  UPDATE public.users
  SET equipped_pfp_decoration = v_id
  WHERE id = auth.uid();

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_store_item(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.equip_pfp_decoration(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_store_item(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.equip_pfp_decoration(text) TO authenticated;

-- Founder keeps the wreath; revoke any free test grants from everyone else.
DELETE FROM public.store_inventory si
WHERE si.item_id = 'sakura-wreath'
  AND NOT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = si.user_id
      AND lower(u.username) = lower('Pheonixstreem')
  );

UPDATE public.users
SET equipped_pfp_decoration = NULL
WHERE coalesce(equipped_pfp_decoration, '') = 'sakura-wreath'
  AND lower(coalesce(username, '')) <> lower('Pheonixstreem');

INSERT INTO public.store_inventory (user_id, item_id, source)
SELECT u.id, 'sakura-wreath', 'founder'
FROM public.users u
WHERE lower(u.username) = lower('Pheonixstreem')
ON CONFLICT (user_id, item_id) DO NOTHING;

UPDATE public.users
SET equipped_pfp_decoration = 'sakura-wreath'
WHERE lower(username) = lower('Pheonixstreem');
