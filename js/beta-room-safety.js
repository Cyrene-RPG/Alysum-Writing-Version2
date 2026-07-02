/**
 * Beta room messaging safety — session 18+ gate + server attestation helpers.
 */

export const BETA_AGE_SESSION_KEY = "alysum-beta-18-verified";

export function isBetaAgeVerifiedLocally() {
    try {
        return sessionStorage.getItem(BETA_AGE_SESSION_KEY) === "1";
    } catch {
        return false;
    }
}

export function setBetaAgeVerifiedLocally() {
    try {
        sessionStorage.setItem(BETA_AGE_SESSION_KEY, "1");
    } catch {
        /* ignore */
    }
}

export function clearBetaAgeVerifiedLocally() {
    try {
        sessionStorage.removeItem(BETA_AGE_SESSION_KEY);
    } catch {
        /* ignore */
    }
}

const DOB_MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

export function isValidBirthDate(month, day, year) {
    const m = Number(month);
    const d = Number(day);
    const y = Number(year);
    if (!m || !d || !y) return false;
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function isAtLeast18(month, day, year) {
    if (!isValidBirthDate(month, day, year)) return false;
    const m = Number(month);
    const d = Number(day);
    const y = Number(year);
    const birth = new Date(y, m - 1, d);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age -= 1;
    }
    return age >= 18;
}

export function birthDateIso(month, day, year) {
    const m = Number(month);
    const d = Number(day);
    const y = Number(year);
    if (!isValidBirthDate(m, d, y)) return "";
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function populateDobMonthSelect(selectEl) {
    if (!selectEl) return;
    selectEl.innerHTML = '<option value="">Month</option>';
    DOB_MONTHS.forEach((name, idx) => {
        const opt = document.createElement("option");
        opt.value = String(idx + 1);
        opt.textContent = name;
        selectEl.appendChild(opt);
    });
}

export function populateDobYearSelect(selectEl, { maxYear = new Date().getFullYear(), span = 100 } = {}) {
    if (!selectEl) return;
    selectEl.innerHTML = '<option value="">Year</option>';
    const minYear = maxYear - span;
    for (let y = maxYear; y >= minYear; y -= 1) {
        const opt = document.createElement("option");
        opt.value = String(y);
        opt.textContent = String(y);
        selectEl.appendChild(opt);
    }
}

export function populateDobDaySelect(selectEl, month, year) {
    if (!selectEl) return;
    const prev = selectEl.value;
    selectEl.innerHTML = '<option value="">Day</option>';
    const m = Number(month);
    const y = Number(year);
    if (!m || !y) return;
    const daysInMonth = new Date(y, m, 0).getDate();
    for (let d = 1; d <= daysInMonth; d += 1) {
        const opt = document.createElement("option");
        opt.value = String(d);
        opt.textContent = String(d);
        selectEl.appendChild(opt);
    }
    if (prev && Number(prev) <= daysInMonth) {
        selectEl.value = prev;
    }
}

export function evaluateAgeGateDob(month, day, year) {
    if (!month || !day || !year) {
        return { complete: false, valid: false, adult: false, message: "" };
    }
    if (!isValidBirthDate(month, day, year)) {
        return {
            complete: true,
            valid: false,
            adult: false,
            message: "Enter a valid date of birth."
        };
    }
    if (!isAtLeast18(month, day, year)) {
        return {
            complete: true,
            valid: true,
            adult: false,
            message: "You must be 18 or older to use beta texting."
        };
    }
    return { complete: true, valid: true, adult: true, message: "" };
}

export function friendlyBetaSafetyError(err) {
    const msg = String(err?.message || err || "");
    if (/underage|birth_date_required|invalid_birth_date/i.test(msg)) {
        return "You must be 18 or older to use beta texting.";
    }
    if (/age_attestation_required/i.test(msg)) {
        return "Confirm you are 18 or older before sending beta texts.";
    }
    if (/user_blocked/i.test(msg)) {
        return "Messaging is unavailable because someone in this conversation is blocked.";
    }
    if (/rate_limit_exceeded/i.test(msg)) {
        return "You are sending messages too quickly. Please wait a bit and try again.";
    }
    if (/reader_must_message_first/i.test(msg)) {
        return "You can reply after the beta reader sends the first message.";
    }
    if (/text_only_messages/i.test(msg)) {
        return "Beta texts must be plain text only — no HTML or attachments.";
    }
    if (/invalid_message_body/i.test(msg)) {
        return "Enter a message between 1 and 8,000 characters.";
    }
    if (/reason_required/i.test(msg)) {
        return "Choose a reason for your report.";
    }
    return msg || "Could not complete that safety action.";
}
