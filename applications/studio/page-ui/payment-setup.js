import { paymentRequest } from '/core/publishing/payments-client.js';
const $ = id => document.getElementById(id);
$('stripeReturn').value = `${window.location.origin}/api/paid-access?action=stripe-callback`;
$('stripeWebhook').value = `${window.location.origin}/api/paid-access?action=stripe-webhook`;
const settings = [
    ['PAID_ACCESS_ENABLED', 'true'],
    ['PAID_ACCESS_MODE', 'live'],
    ['PAID_ACCESS_ORIGIN', window.location.origin],
    ['STRIPE_SECRET_KEY', 'Your Stripe platform live secret key (sk_live_…)'],
    ['STRIPE_CONNECT_CLIENT_ID', 'Your Stripe Connect live client ID (ca_…)'],
    ['STRIPE_CONNECT_WEBHOOK_SECRET', 'The live connected-account webhook signing secret (whsec_…)'],
    ['SUPABASE_SERVICE_ROLE_KEY', 'Your Supabase service role key, if not already configured'],
];
for (const [name, value] of settings) {
    const row = document.createElement('div'); row.className = 'payment-setting';
    const title = document.createElement('strong'); title.textContent = name;
    const detail = document.createElement('p'); detail.textContent = value;
    const state = document.createElement('small'); state.dataset.setting = name;
    row.append(title, detail, state); $('environmentSettings').append(row);
}
async function check() {
    $('checkPaymentSetup').disabled = true;
    try {
        const status = await paymentRequest('status');
        const ready = status.configured && status.storageReady;
        $('setupStatus').textContent = ready ? status.livemode ? 'Payments are ready. Authors can connect Stripe now.' : 'Sandbox is configured. Switch to live settings before accepting real purchases.' : 'Setup is incomplete. Finish the three steps below, then check again.';
        document.querySelectorAll('[data-setting]').forEach(el => {
            el.textContent = status.missing.some(name => name.startsWith(el.dataset.setting)) ? 'Still needed' : 'Configured';
        });
        if (status.configured && !status.storageReady) $('setupStatus').textContent = 'Server settings are saved. Complete the Supabase step before connecting authors.';
    } catch (error) { $('setupStatus').textContent = error.message; }
    finally { $('checkPaymentSetup').disabled = false; }
}
$('checkPaymentSetup').addEventListener('click', () => { void check(); });
$('copyPaymentSql').addEventListener('click', async () => {
    try {
        const response = await fetch('/supabase/live-site/supabase-paid-access.sql', { cache: 'no-store' });
        if (!response.ok) throw Error('Could not load the SQL. Please try again.');
        const sql = await response.text();
        if (!sql.includes('create table if not exists public.paid_access_connections')) throw Error('The SQL did not load correctly.');
        $('paymentSql').value = sql;
        try { await navigator.clipboard.writeText(sql); $('sqlCopyStatus').textContent = 'Copied. Paste it into Supabase SQL Editor and select Run.'; }
        catch { $('paymentSql').hidden = false; $('paymentSql').focus(); $('paymentSql').select(); $('sqlCopyStatus').textContent = 'Select and copy the script below, then paste it into Supabase SQL Editor.'; }
    } catch (error) { $('sqlCopyStatus').textContent = error.message; }
});
void check();
