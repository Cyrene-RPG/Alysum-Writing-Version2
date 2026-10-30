/** Publishing metadata shared by drafts and public listings. */
export function normalizeWorkTags(values) {
    const seen = new Set();
    return (Array.isArray(values) ? values : []).map(value => String(value).trim().slice(0, 250))
        .filter(value => value && !seen.has(value.toLocaleLowerCase()) && seen.add(value.toLocaleLowerCase())).slice(0, 100);
}

export function readWorkTags(value = {}) {
    const workType = ['original', 'fanfiction'].includes(value.workType) ? value.workType
        : [value.genre, ...(Array.isArray(value.genres) ? value.genres : [])].includes('fanfic') ? 'fanfiction' : 'original';
    return { workType, fandoms: normalizeWorkTags(value.fandoms),
        characters: normalizeWorkTags(value.characters), relationships: normalizeWorkTags(value.relationships) };
}

export function publicWorkTags(value) {
    const metadata = readWorkTags(value);
    return metadata.workType === 'fanfiction' ? metadata
        : { workType: 'original', fandoms: [], characters: [], relationships: [] };
}

/** Fan fiction is always free on Alysum, including restored/legacy form data. */
export function freeFanfictionForm(form) {
    if (readWorkTags(form).workType !== 'fanfiction') return form;
    return { ...form, workType: 'fanfiction', purchaseUrl: '', lockedChapterIds: [],
        chapterAccess: { lockedChapterIds: [], chapterProducts: [], mixedProducts: [],
            pricingMode: 'bundle', connectionId: '', productUrl: '', minimum: '', currency: 'USD' } };
}

export const THEME_TAGS = ['Slow Burn', 'Found Family', 'Enemies to Lovers', 'Friends to Lovers',
    'Hurt/Comfort', 'Angst', 'Fluff', 'Alternate Universe', 'Canon Divergence', 'Canon Compliant',
    'Second Chances', 'Fake Dating', 'Mutual Pining', 'Unrequited Love', 'Happy Ending',
    'Bittersweet Ending', 'Tragedy', 'Coming of Age', 'Redemption', 'Healing', 'Grief',
    'Friendship', 'Family', 'Adventure', 'Mystery', 'Political Intrigue', 'Magic', 'Time Travel',
    'Soulmates', 'Forbidden Love', 'Secret Identity', 'Established Relationship', 'Crossover',
    'Worldbuilding', 'Queer Characters', 'LGBTQ+', 'Gay', 'Lesbian', 'Bisexual', 'Transgender',
    'Nonbinary', 'Asexual', 'Aromantic', 'Polyamory', 'Disability', 'Neurodivergence',
    'Mental Health', 'Recovery', 'Humor', 'Domestic Fluff', 'Only One Bed', 'Missing Scene',
    'Fix-It', 'Post-Canon', 'Pre-Canon', 'Reincarnation', 'Survival', 'Betrayal', 'Revenge'];
