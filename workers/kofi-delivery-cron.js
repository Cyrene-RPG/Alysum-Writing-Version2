// Deploy as a separate Cloudflare Worker with a Cron Trigger (e.g. */5 * * * *).
// Set DELIVERY_URL to https://alysumwriting.com/api/kofi-delivery and
// KOFI_DELIVERY_SECRET to the same secret stored in Cloudflare Pages.
export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil((async () => {
      const url = new URL(env.DELIVERY_URL || '');
      if (url.protocol !== 'https:' || url.hostname !== 'alysumwriting.com' || url.pathname !== '/api/kofi-delivery') {
        throw new Error('Invalid delivery URL');
      }
      if (!env.KOFI_DELIVERY_SECRET) throw new Error('Missing delivery secret');
      const result = await fetch(url, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + env.KOFI_DELIVERY_SECRET }
      });
      if (!result.ok) throw new Error('Delivery failed with status ' + result.status);
    })());
  }
};
