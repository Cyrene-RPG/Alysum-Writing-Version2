-- ONE-TIME MANUAL RECOVERY OF A VERIFIED KO-FI SHOP ORDER
--
-- Run in Supabase SQL Editor ONLY after independently verifying the transaction
-- in your own Ko-fi payment/order history. Never accept a receipt number alone
-- as proof of payment. This script cannot query Ko-fi and does not itself verify payment.
--
-- Use the *Ko-fi webhook transaction ID*, which may differ from a receipt reference.
-- Verify the exact product, currency, total, buyer email, and quantity in Ko-fi.
-- The register_kofi_order function enforces owner, active product mapping, price,
-- currency, and idempotency. The existing delivery worker handles email.
--
-- 1. Replace each REPLACE_... placeholder with verified Ko-fi data.
-- 2. Change payment_independently_verified to true ONLY after verification.
-- 3. Run the script once. Re-running the identical transaction is idempotent.
-- 4. Check kofi_orders / kofi_deliveries; the delivery worker sends the email.
--
-- For the existing Archangel Chapters 4-6 order, expected mapping is
-- product ID 1a349f46cb, price USD 4.99, quantity 1.
-- Do not assume the receipt reference S-G8K229WZIF is the webhook transaction ID.

begin;
do $$
declare
  payment_independently_verified boolean := false;
  v_transaction text := 'REPLACE_WITH_VERIFIED_KOFI_TRANSACTION_ID';
  v_email text := 'REPLACE_WITH_VERIFIED_BUYER_EMAIL';
  v_product text := '1a349f46cb';
  v_currency text := 'USD';
  v_total text := '4.99';
  v_quantity integer := 1;
  v_owner uuid;
  v_pass record;
  v_result boolean;
begin
  if not payment_independently_verified then
    raise exception 'STOP: Independently verify this paid order in Ko-fi before recovery';
  end if;
  if v_transaction like 'REPLACE_%' or v_email like 'REPLACE_%' then
    raise exception 'STOP: Supply verified Ko-fi transaction details';
  end if;
  if v_quantity <> 1 then
    raise exception 'STOP: Review quantity and expected payment total manually';
  end if;

  select p.owner_id, p.id as pass_id, p.amount, p.currency, p.sale_enabled,
         m.enabled as mapping_enabled
    into v_pass
    from public.kofi_pass_products m
    join public.purchase_passes p on p.id=m.pass_id
   where m.product_id=v_product;
  if not found or not v_pass.mapping_enabled or not v_pass.sale_enabled
     or v_pass.currency<>v_currency or v_pass.amount<>round(v_total::numeric*100)::integer then
    raise exception 'STOP: Product mapping, sale status, currency, or price does not match';
  end if;
  v_owner:=v_pass.owner_id;
  if not exists (select 1 from public.kofi_author_accounts where owner_id=v_owner) then
    raise exception 'STOP: Ko-fi account is not connected for the product owner';
  end if;

  select public.register_kofi_order(
    v_transaction,
    lower(v_email),
    jsonb_build_array(jsonb_build_object('product_id',v_product,'quantity',v_quantity)),
    v_currency,
    v_total,
    v_owner
  ) into v_result;
  if not v_result then raise exception 'STOP: Order registration did not succeed'; end if;
  raise notice 'Verified order registered (or already present). Check deliveries and worker status.';
end $$;
commit;

-- Read-only verification (replace the transaction ID):
-- select o.transaction_id, o.created_at, d.line_number, d.copy_number,
--        d.pass_id, d.status
-- from public.kofi_orders o
-- join public.kofi_deliveries d on d.transaction_id=o.transaction_id
-- where o.transaction_id='REPLACE_WITH_VERIFIED_KOFI_TRANSACTION_ID';
