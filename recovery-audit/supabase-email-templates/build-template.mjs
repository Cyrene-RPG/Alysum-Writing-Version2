/**
 * Branded Alysum auth email HTML for Supabase GoTrue templates.
 * Uses {{ .ConfirmationURL }}, {{ .Token }}, {{ .Email }}, etc.
 */

const SITE = "https://www.alysumwriting.com";
const LOGO = `${SITE}/Alysum-3.png`;
const SUPPORT = "alysum.support@gmail.com";

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {{ preheader: string, title: string, bodyHtml: string, cta?: { label: string, href: string }, footnote?: string }} opts
 */
export function buildAlysumEmail(opts) {
  const { preheader, title, bodyHtml, cta, footnote } = opts;

  const ctaBlock = cta
    ? `<tr>
        <td align="center" style="padding:8px 0 28px;">
          <a href="${cta.href}" target="_blank" rel="noopener"
            style="display:inline-block;background:#6d28d9;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:16px;font-weight:700;line-height:1;text-decoration:none;padding:16px 32px;border-radius:14px;box-shadow:0 8px 24px rgba(109,40,217,0.35);">
            ${esc(cta.label)}
          </a>
        </td>
      </tr>
      <tr>
        <td style="padding:0 0 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;line-height:1.5;color:#64748b;word-break:break-all;">
          Or copy this link:<br>
          <a href="${cta.href}" style="color:#6d28d9;text-decoration:underline;">${cta.href}</a>
        </td>
      </tr>`
    : "";

  const footnoteBlock = footnote
    ? `<tr>
        <td style="padding:0 0 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.55;color:#64748b;">
          ${footnote}
        </td>
      </tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:#ede9fe;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:linear-gradient(160deg,#5b21b6 0%,#7c3aed 45%,#a78bfa 100%);min-height:120px;">
    <tr>
      <td align="center" style="padding:36px 20px 28px;">
        <img src="${LOGO}" width="56" height="56" alt="Alysum" style="display:block;border:0;border-radius:14px;">
        <p style="margin:14px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:0.02em;">Alysum</p>
        <p style="margin:4px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;color:rgba(255,255,255,0.85);">Write. Publish. Read.</p>
      </td>
    </tr>
  </table>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#ede9fe;">
    <tr>
      <td align="center" style="padding:0 16px 40px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;background:#ffffff;border-radius:20px;box-shadow:0 12px 40px rgba(76,29,149,0.12);margin-top:-18px;">
          <tr>
            <td style="padding:32px 28px 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
              <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;color:#4c1d95;font-weight:700;">${esc(title)}</h1>
              <div style="font-size:15px;line-height:1.6;color:#334155;">${bodyHtml}</div>
            </td>
          </tr>
          ${ctaBlock}
          ${footnoteBlock}
          <tr>
            <td style="padding:8px 28px 28px;border-top:1px solid #f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;line-height:1.5;color:#94a3b8;">
              Questions? <a href="mailto:${SUPPORT}" style="color:#6d28d9;text-decoration:none;font-weight:600;">${SUPPORT}</a><br>
              <a href="${SITE}" style="color:#6d28d9;text-decoration:none;">alysumwriting.com</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function otpBlock() {
  return `<p style="margin:20px 0 8px;font-size:14px;color:#64748b;">Your one-time code:</p>
<p style="margin:0;font-size:32px;font-weight:700;letter-spacing:0.25em;color:#4c1d95;font-family:ui-monospace,Consolas,monospace;">{{ .Token }}</p>
<p style="margin:12px 0 0;font-size:13px;color:#94a3b8;">This code expires shortly.</p>`;
}

export const ALYSUM_EMAIL_TEMPLATES = {
  recovery: {
    subject: "Reset your Alysum password",
    content: buildAlysumEmail({
      preheader: "Choose a new password for your Alysum account.",
      title: "Reset your password",
      bodyHtml: `<p style="margin:0 0 12px;">We received a request to reset the password for <strong>{{ .Email }}</strong>.</p>
<p style="margin:0;">Tap the button below to choose a new password. This link works once and expires soon.</p>`,
      cta: { label: "Choose new password", href: "{{ .ConfirmationURL }}" },
      footnote:
        "If you didn't ask for this, you can ignore this email — your password won't change.",
    }),
  },
  confirmation: {
    subject: "Confirm your Alysum account",
    content: buildAlysumEmail({
      preheader: "One click to finish creating your Alysum account.",
      title: "Welcome to Alysum",
      bodyHtml: `<p style="margin:0 0 12px;">Thanks for signing up with <strong>{{ .Email }}</strong>.</p>
<p style="margin:0;">Confirm your email to enter the studio, save your work, and publish to the library.</p>`,
      cta: { label: "Confirm email & enter studio", href: "{{ .ConfirmationURL }}" },
      footnote: "If you didn't create an Alysum account, you can safely ignore this message.",
    }),
  },
  magic_link: {
    subject: "Your Alysum sign-in link",
    content: buildAlysumEmail({
      preheader: "Sign in to Alysum with this secure link.",
      title: "Sign in to Alysum",
      bodyHtml: `<p style="margin:0 0 12px;">Use the button below to sign in as <strong>{{ .Email }}</strong>.</p>
<p style="margin:0;">The link expires shortly and can only be used once.</p>`,
      cta: { label: "Sign in to Alysum", href: "{{ .ConfirmationURL }}" },
      footnote: "If you didn't request this link, you can ignore this email.",
    }),
  },
  invite: {
    subject: "You're invited to Alysum",
    content: buildAlysumEmail({
      preheader: "Accept your invitation to join Alysum.",
      title: "You're invited",
      bodyHtml: `<p style="margin:0 0 12px;">You've been invited to join Alysum — a home for writers and readers.</p>
<p style="margin:0;">Accept the invitation to create your account and open your studio.</p>`,
      cta: { label: "Accept invitation", href: "{{ .ConfirmationURL }}" },
    }),
  },
  email_change: {
    subject: "Confirm your new Alysum email",
    content: buildAlysumEmail({
      preheader: "Confirm the email change for your Alysum account.",
      title: "Confirm new email",
      bodyHtml: `<p style="margin:0 0 12px;">You asked to change your Alysum login email to <strong>{{ .NewEmail }}</strong>.</p>
<p style="margin:0;">Confirm this change to finish updating your account.</p>`,
      cta: { label: "Confirm new email", href: "{{ .ConfirmationURL }}" },
      footnote: "If you didn't request this change, contact us immediately.",
    }),
  },
  reauthentication: {
    subject: "{{ .Token }} — your Alysum verification code",
    content: buildAlysumEmail({
      preheader: "Your Alysum verification code.",
      title: "Verification code",
      bodyHtml: `<p style="margin:0 0 8px;">Enter this code to continue with a sensitive account action for <strong>{{ .Email }}</strong>.</p>${otpBlock()}`,
      footnote: "If you didn't start this action, reset your password and contact support.",
    }),
  },
  password_changed_notification: {
    subject: "Your Alysum password was changed",
    content: buildAlysumEmail({
      preheader: "Your Alysum account password was updated.",
      title: "Password changed",
      bodyHtml: `<p style="margin:0 0 12px;">The password for <strong>{{ .Email }}</strong> was just changed.</p>
<p style="margin:0;">If this was you, no action is needed. If not, reset your password right away and email us.</p>`,
      cta: { label: "Reset password", href: `${SITE}/login.html` },
    }),
  },
};
