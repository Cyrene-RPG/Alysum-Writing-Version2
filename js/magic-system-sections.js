/** @typedef {[string, string]} CodexQuestion */

export const SOFT_MAGIC_INTRO =
    "Soft magic is mysterious, emotional, unpredictable, and often unknowable. These questions help create wonder, mythology, and atmosphere rather than strict rules.";

export const HARD_MAGIC_INTRO =
    "Hard magic systems rely on clear rules, logic, costs, and consistency. These questions help build structure and strategy.";

/** @type {{ id: string, title: string, glyph: string, questions: CodexQuestion[] }[]} */
export const SOFT_SECTIONS = [
    {
        id: "origins",
        title: "Origins & Nature",
        glyph: "☽",
        questions: [
            ["magicSource", "Where does the magic come from?"],
            ["magicNature", "Is magic considered divine, natural, cursed, or cosmic?"],
            ["alwaysPresent", "Was magic always part of the world, or did it appear suddenly?"],
            ["understanding", "Do people truly understand magic, or only fear and worship it?"],
            ["sentient", "Is magic alive or sentient in some way?"],
            ["creationMyths", "Are there myths surrounding its creation?"],
            ["choosesUsers", "Does magic choose users, or can anyone touch it?"]
        ]
    },
    {
        id: "feel",
        title: "Feel & Atmosphere",
        glyph: "✦",
        questions: [
            ["witnessFeel", "What does magic feel like when witnessed?"],
            ["environment", "Does magic change the environment around it?"],
            ["sensory", "Are there strange sounds, lights, weather, or sensations tied to it?"],
            ["beautifulTerrifying", "Is magic beautiful, terrifying, or both?"],
            ["ordinaryReaction", "How do ordinary people react when they see it?"]
        ]
    },
    {
        id: "users",
        title: "Users & Society",
        glyph: "◎",
        questions: [
            ["whoCanUse", "Who is capable of using magic?"],
            ["socialStatus", "Are magic users feared, worshipped, hunted, or hidden?"],
            ["ordersBloodlines", "Are there ancient orders, witches, prophets, or bloodlines?"],
            ["religionCulture", "How does magic shape religion and culture?"],
            ["magicalBeings", "Are magical beings viewed differently than human users?"]
        ]
    },
    {
        id: "mystery",
        title: "Mystery & Limitations",
        glyph: "◇",
        questions: [
            ["unknown", "What parts of magic remain unknown?"],
            ["forbidden", "Are there forbidden forms of magic?"],
            ["overuseDangers", "What dangers come from using too much magic?"],
            ["corruption", "Can magic corrupt the mind, body, or soul?"],
            ["ancientPowers", "Are there ancient powers nobody dares awaken?"],
            ["unreliable", "Is magic unreliable or emotionally driven?"]
        ]
    },
    {
        id: "story",
        title: "Story & Theme",
        glyph: "❧",
        questions: [
            ["themes", "What themes does your magic represent?"],
            ["emotionalTies", "Is magic tied to hope, sacrifice, temptation, chaos, destiny, or grief?"],
            ["protagonist", "How does magic affect your protagonist emotionally?"],
            ["moralQuestions", "What moral questions does magic create?"],
            ["worldDepth", "Does magic make the world feel older and deeper?"]
        ]
    }
];

/** @type {{ id: string, title: string, glyph: string, questions: CodexQuestion[] }[]} */
export const HARD_SECTIONS = [
    {
        id: "rules",
        title: "Core Rules",
        glyph: "⬡",
        questions: [
            ["canDo", "What exactly can magic do?"],
            ["cannotDo", "What can magic NOT do?"],
            ["activation", "How is magic activated?"],
            ["basis", "Is magic based on elements, energy, language, symbols, science, or something else?"],
            ["schools", "Are there categories or schools of magic?"],
            ["measurable", "Can abilities be measured or ranked?"]
        ]
    },
    {
        id: "costs",
        title: "Costs & Consequences",
        glyph: "△",
        questions: [
            ["usageCost", "What does using magic cost?"],
            ["consumes", "Does magic consume stamina, memories, lifespan, emotions, or resources?"],
            ["overuse", "What happens if someone overuses magic?"],
            ["sideEffects", "Are there physical side effects?"],
            ["permanentDamage", "Can magic permanently damage the user?"],
            ["recovery", "Is there a recovery period?"]
        ]
    },
    {
        id: "mechanics",
        title: "Mechanics",
        glyph: "⊞",
        questions: [
            ["learning", "How do people learn magic?"],
            ["trainingRequired", "Is training required?"],
            ["practice", "Can magic be improved through practice?"],
            ["formulas", "Are there formulas, rituals, or equations involved?"],
            ["failure", "Can magic fail? Why?"],
            ["counters", "Are there counters or defenses against magic?"]
        ]
    },
    {
        id: "limitations",
        title: "Limitations",
        glyph: "⊘",
        questions: [
            ["absoluteLimits", "What are the absolute limits of the system?"],
            ["impossiblePowers", "Are some powers impossible?"],
            ["conservation", "Does magic obey conservation laws?"],
            ["creationLimits", "Can magic create matter, resurrect the dead, or alter time?"],
            ["environment", "What environmental conditions weaken or strengthen magic?"],
            ["userLimits", "Are users limited by intelligence, creativity, or biology?"]
        ]
    },
    {
        id: "society",
        title: "Society & Technology",
        glyph: "⌂",
        questions: [
            ["warfare", "How has magic changed warfare?"],
            ["civilSystems", "How has magic changed medicine, travel, architecture, or communication?"],
            ["regulation", "Is magic regulated by governments?"],
            ["weapons", "Are magical weapons common?"],
            ["vsTechnology", "Does magic replace technology or coexist with it?"],
            ["industries", "What industries depend on magic?"]
        ]
    },
    {
        id: "conflict",
        title: "Conflict & Strategy",
        glyph: "⚔",
        questions: [
            ["fightStrategy", "How do magical fights work strategically?"],
            ["masters", "What separates beginners from masters?"],
            ["synergies", "Are there combinations or synergies between abilities?"],
            ["situational", "What makes one type of magic superior in certain situations?"],
            ["nonMagicSurvival", "How do non-magical people survive against magic users?"],
            ["loopholes", "What loopholes or clever uses exist within the rules?"]
        ]
    },
    {
        id: "balance",
        title: "Balance & Story",
        glyph: "⚖",
        questions: [
            ["preventSolveAll", "How do you prevent magic from solving every problem?"],
            ["tensionWeaknesses", "What weaknesses create tension?"],
            ["meaningfulSacrifice", "What sacrifices make power meaningful?"],
            ["storyThemes", "How does the system reinforce your story’s themes?"],
            ["unique", "What makes your magic system unique compared to others?"]
        ]
    }
];
