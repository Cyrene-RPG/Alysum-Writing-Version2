/**
 * Vercel Web Analytics — optional; failures must not break app pages.
 */

try {
    const { inject } = await import("https://esm.sh/@vercel/analytics@1.4.1");
    inject();
} catch (err) {
    console.debug("Vercel Analytics skipped:", err);
}
