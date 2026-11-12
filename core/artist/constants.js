/** Artist hub focus (users.artist_focus). */
export const ARTIST_FOCUS_OC = "oc_adoptables";
export const ARTIST_FOCUS_WRITER = "writer_artist";
export const ARTIST_FOCUS_BOTH = "both";

export const ARTIST_FOCUS_OPTIONS = [
    {
        id: ARTIST_FOCUS_OC,
        title: "Characters & adoptables",
        description: "OCs, ref sheets, folders, and provenance for trades off-site.",
    },
    {
        id: ARTIST_FOCUS_WRITER,
        title: "Fiction & illustration",
        description: "Cast, comics, and Story Bible links for projects you write.",
    },
    {
        id: ARTIST_FOCUS_BOTH,
        title: "Both",
        description: "Full hub: portfolio plus project-linked characters.",
    },
];

export const CHARACTER_KINDS = [
    { id: "oc", label: "Original character" },
    { id: "adoptable", label: "Adoptable" },
    { id: "cast", label: "Story cast" },
    { id: "sona", label: "Persona / sona" },
];

export const TRADE_POLICIES = [
    { id: "none", label: "Not for trade" },
    { id: "gift", label: "Gift only" },
    { id: "trade", label: "Trade (art / designs)" },
    { id: "resell", label: "Resell (payment off-site)" },
];

export const CHARACTER_VISIBILITY = [
    { id: "private", label: "Private" },
    { id: "unlisted", label: "Unlisted" },
    { id: "public", label: "Public" },
];

export const PROTECTION_DECLARED = [
    { id: "glaze", label: "Glaze" },
    { id: "nightshade", label: "Nightshade" },
    { id: "both", label: "Glaze & Nightshade" },
];

export const GLAZE_PROJECT_URL = "https://glaze.cs.uchicago.edu/whatis.html";
export const NIGHTSHADE_PROJECT_URL = "https://nightshade.cs.uchicago.edu/whatis.html";
