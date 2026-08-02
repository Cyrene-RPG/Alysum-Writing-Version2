/**
 * Shared content warning categories and helpers for book/chapter publish + reader.
 */

export const CONTENT_WARNING_GROUPS = [
    { key: "violence", title: "Violence & Physical Harm", subtitle: "Required: choose one or more, including None if not applicable.", options: ["None", "Mild Violence", "Moderate Violence", "Graphic Violence", "Gore", "Torture", "Mutilation", "Disfigurement", "War Violence", "Gun Violence", "Knife Violence", "Physical Assault", "Kidnapping", "Hostage Situations", "Human Experimentation"] },
    { key: "abuse", title: "Abuse & Power Dynamics", subtitle: "Required.", options: ["None", "Physical Abuse", "Emotional Abuse", "Psychological Abuse", "Verbal Abuse", "Domestic Abuse", "Child Abuse", "Neglect", "Gaslighting", "Bullying", "Workplace Abuse", "Institutional Abuse", "Cult / Coercive Control"] },
    { key: "sexual_content", title: "Sexual Content & Consent", subtitle: "Required.", options: ["None", "Consensual Sexual Content", "Non-Graphic Sexual Content", "Explicit Sexual Content", "Sexual Tension", "Dubious Consent", "Non-Consensual (Rape)", "Sexual Assault", "Sexual Harassment", "Exploitation"] },
    { key: "mental_health", title: "Mental Health", subtitle: "Required.", options: ["None", "Anxiety", "Panic Attacks", "Depression", "Trauma / PTSD", "Dissociation", "Psychosis", "Paranoia", "Obsessive Behavior", "Suicidal Ideation"] },
    { key: "self_harm", title: "Self-Harm & Suicide", subtitle: "Required.", options: ["None", "Self-Harm", "Attempted Suicide", "Suicide", "Graphic Self-Harm"] },
    { key: "substance_use", title: "Substance Use", subtitle: "Required.", options: ["None", "Alcohol Use", "Alcohol Abuse", "Drug Use", "Drug Abuse", "Addiction", "Withdrawal", "Overdose"] },
    { key: "eating_body", title: "Eating & Body", subtitle: "Required.", options: ["None", "Eating Disorder", "Starvation", "Binge Eating", "Body Dysmorphia", "Extreme Dieting"] },
    { key: "moral_dark", title: "Moral / Dark Themes", subtitle: "Required.", options: ["None", "Crime", "Murder", "Serial Killing", "Corruption", "Betrayal", "Revenge", "Moral Ambiguity", "Villain Protagonist", "Anti-Hero"] },
    { key: "fear_disturbing", title: "Fear & Disturbing Content", subtitle: "Required.", options: ["None", "Jump Scares", "Psychological Distress", "Disturbing Imagery", "Nightmares", "Claustrophobia", "Isolation", "Existential Dread"] },
    { key: "body_medical", title: "Body & Medical", subtitle: "Required.", options: ["None", "Illness", "Terminal Illness", "Injury", "Surgery", "Medical Trauma", "Body Horror", "Mutation", "Parasites", "Infestation"] },
    { key: "identity_social", title: "Identity & Social Issues", subtitle: "Required.", options: ["None", "Racism", "Sexism", "Homophobia", "Transphobia", "Discrimination", "Slavery", "Oppression", "Xenophobia"] },
    { key: "sensitive_life_events", title: "Sensitive Life Events", subtitle: "Required.", options: ["None", "Major Character Death", "Minor Character Death", "Pregnancy", "Miscarriage", "Infertility", "Child Loss", "Grief / Mourning"] },
];

export const CONTENT_WARNING_KEYS = CONTENT_WARNING_GROUPS.map((group) => group.key);

/**
 * @param {unknown} rawWarnings
 * @returns {Record<string, string[]>}
 */
export function normalizeWarningData(rawWarnings) {
    const source = rawWarnings && typeof rawWarnings === "object" && !Array.isArray(rawWarnings) ? rawWarnings : {};
    const out = {};
    CONTENT_WARNING_GROUPS.forEach((group) => {
        out[group.key] = Array.isArray(source[group.key])
            ? source[group.key].filter((item) => typeof item === "string")
            : [];
    });
    return out;
}

/**
 * @param {Record<string, string[]>} warnings
 * @returns {Record<string, string[]>}
 */
export function cloneWarningData(warnings) {
    const normalized = normalizeWarningData(warnings);
    return CONTENT_WARNING_GROUPS.reduce((acc, group) => {
        acc[group.key] = [...(normalized[group.key] || [])];
        return acc;
    }, {});
}

/**
 * @param {unknown} warningsObj
 * @returns {string[]}
 */
export function flattenWarnings(warningsObj) {
    if (Array.isArray(warningsObj)) {
        return warningsObj.filter((v) => typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "none");
    }
    const source = normalizeWarningData(warningsObj);
    const warnings = [];
    Object.values(source).forEach((group) => {
        group.forEach((item) => {
            if (typeof item === "string" && item.trim() && item.trim().toLowerCase() !== "none") {
                warnings.push(item.trim());
            }
        });
    });
    return [...new Set(warnings)];
}

/**
 * @param {Record<string, string[]>} warnings
 * @returns {boolean}
 */
export function everyWarningCategoryHasAChoice(warnings) {
    const normalized = normalizeWarningData(warnings);
    return CONTENT_WARNING_GROUPS.every((group) => (normalized[group.key] || []).length > 0);
}

/**
 * @param {Record<string, string[]>} warnings
 * @returns {number}
 */
export function countNonNoneWarnings(warnings) {
    let total = 0;
    const normalized = normalizeWarningData(warnings);
    CONTENT_WARNING_GROUPS.forEach((group) => {
        (normalized[group.key] || []).forEach((value) => {
            if (value !== "None") total += 1;
        });
    });
    return total;
}

/**
 * Merge chapter warning sets into one structured object (union per category).
 * @param {Array<{ warnings?: unknown }>} chapters
 * @returns {Record<string, string[]>}
 */
export function aggregateWarningsFromChapters(chapters) {
    const merged = CONTENT_WARNING_GROUPS.reduce((acc, group) => {
        acc[group.key] = new Set();
        return acc;
    }, /** @type {Record<string, Set<string>>} */ ({}));

    (chapters || []).forEach((chapter) => {
        const normalized = normalizeWarningData(chapter?.warnings);
        CONTENT_WARNING_GROUPS.forEach((group) => {
            (normalized[group.key] || []).forEach((value) => {
                if (value && value !== "None") merged[group.key].add(value);
            });
        });
    });

    return CONTENT_WARNING_GROUPS.reduce((acc, group) => {
        const values = [...merged[group.key]];
        acc[group.key] = values.length ? values.sort((a, b) => a.localeCompare(b)) : ["None"];
        return acc;
    }, /** @type {Record<string, string[]>} */ ({}));
}

/**
 * @param {Record<string, string[]>} selections
 * @param {string} groupKey
 * @param {string} value
 * @returns {Record<string, string[]>}
 */
export function toggleWarningChoice(selections, groupKey, value) {
    const next = cloneWarningData(selections);
    const current = new Set(next[groupKey] || []);
    if (value === "None") {
        current.clear();
        current.add("None");
    } else {
        current.delete("None");
        if (current.has(value)) current.delete(value);
        else current.add(value);
    }
    next[groupKey] = current.size ? [...current] : [];
    return next;
}
