/** @typedef {[string, string, string, "input"|"textarea", boolean?]} MagicQuestion */

export const SOFT_MAGIC_INTRO =
    "Soft magic is mysterious, emotional, unpredictable, and often unknowable. These questions help create wonder, mythology, and atmosphere rather than strict rules.";

export const HARD_MAGIC_INTRO =
    "Hard magic systems rely on clear rules, logic, costs, and consistency. These questions help build structure and strategy.";

/** @type {{ id: string, title: string, hint: string, questions: MagicQuestion[] }[]} */
export const SOFT_SECTIONS = [
    {
        id: "origins",
        title: "Origins & Nature",
        hint: "Where magic comes from and how the world understands it.",
        questions: [
            ["magicSource", "Where does the magic come from?", "Gods, bloodlines, ley lines, emotion, dreams, relics, the dead, stars, or something stranger?", "textarea", true],
            ["magicNature", "Divine, natural, cursed, or cosmic?", "How do scholars and common folk classify what magic is?", "textarea"],
            ["alwaysPresent", "Always part of the world?", "Was magic always here, or did it appear suddenly? What changed when it arrived?", "textarea"],
            ["understanding", "True understanding", "Do people truly understand magic, or only fear and worship it?", "textarea", true],
            ["sentient", "Alive or sentient?", "Is magic alive, aware, hungry, or relational in some way?", "textarea"],
            ["creationMyths", "Creation myths", "What stories, religions, or forbidden histories explain where magic began?", "textarea"],
            ["choosesUsers", "Who can touch it?", "Does magic choose users, or can anyone stumble into it?", "textarea"]
        ]
    },
    {
        id: "feel",
        title: "Feel & Atmosphere",
        hint: "How magic feels when witnessed and how it changes the world around it.",
        questions: [
            ["witnessFeel", "What does magic feel like when witnessed?", "Temperature, pressure, grief, euphoria, wrongness, nostalgia, silence?", "textarea", true],
            ["environment", "Environment changes", "Does magic alter weather, light, plants, animals, architecture, or time’s pace nearby?", "textarea"],
            ["sensory", "Strange sensations", "Sounds, lights, smells, tastes, static, bells, singing, rot, ozone?", "textarea"],
            ["beautifulTerrifying", "Beautiful, terrifying, or both?", "How do witnesses describe it in art, prayer, or panic?", "textarea"],
            ["ordinaryReaction", "Ordinary people’s reaction", "Awe, riots, prayer, denial, festivals, executions, indifference?", "textarea", true]
        ]
    },
    {
        id: "users",
        title: "Users & Society",
        hint: "Who uses magic and how culture treats them.",
        questions: [
            ["whoCanUse", "Who is capable of using magic?", "Everyone, a few, bloodlines, the broken-hearted, the condemned, children, the dying?", "textarea", true],
            ["socialStatus", "Status of magic users", "Feared, worshipped, hunted, hidden, licensed, owned, celebrated?", "textarea", true],
            ["ordersBloodlines", "Orders and bloodlines", "Witches, prophets, temples, covens, royal houses, monsters, saints?", "textarea"],
            ["religionCulture", "Religion and culture", "How does magic shape faith, law, art, marriage, burial, and holidays?", "textarea"],
            ["magicalBeings", "Magical beings vs humans", "Are fae, spirits, gods, or monsters treated differently from human casters?", "textarea"]
        ]
    },
    {
        id: "mystery",
        title: "Mystery & Limitations",
        hint: "What stays unknown and what happens when magic goes too far.",
        questions: [
            ["unknown", "What remains unknown?", "What do even masters admit they cannot explain?", "textarea", true],
            ["forbidden", "Forbidden forms", "What magic is taboo, illegal, or whispered about?", "textarea"],
            ["overuseDangers", "Dangers of overuse", "Madness, mutation, hauntings, droughts, curses on bloodlines?", "textarea", true],
            ["corruption", "Corruption", "Can magic corrupt mind, body, soul, or a whole region?", "textarea"],
            ["ancientPowers", "Ancient powers", "What sleeps beneath the world that nobody dares awaken?", "textarea"],
            ["unreliable", "Unreliable or emotional", "When does magic refuse, twist, or answer the wrong question?", "textarea"]
        ]
    },
    {
        id: "story",
        title: "Story & Theme",
        hint: "What your magic means for characters and the emotional arc of the story.",
        questions: [
            ["themes", "Themes represented", "Hope, sacrifice, temptation, chaos, destiny, grief, mercy, pride?", "textarea", true],
            ["emotionalTies", "Emotional ties", "Hope, sacrifice, temptation, chaos, destiny, grief — which dominate your story?", "textarea"],
            ["protagonist", "Effect on protagonist", "How does magic wound, heal, tempt, or define your lead emotionally?", "textarea", true],
            ["moralQuestions", "Moral questions", "What impossible choices does magic force?", "textarea"],
            ["worldDepth", "Older and deeper world", "Does magic make the setting feel ancient, layered, and half-forgotten?", "textarea"]
        ]
    }
];

/** @type {{ id: string, title: string, hint: string, questions: MagicQuestion[] }[]} */
export const HARD_SECTIONS = [
    {
        id: "rules",
        title: "Core Rules",
        hint: "What magic can and cannot do, and how it is invoked.",
        questions: [
            ["canDo", "What exactly can magic do?", "List capabilities clearly enough that readers can predict outcomes.", "textarea", true],
            ["cannotDo", "What can magic NOT do?", "Hard limits that create plot obstacles.", "textarea", true],
            ["activation", "How is magic activated?", "Gestures, words, focus, tools, contracts, blood, circuits, emotion?", "textarea", true],
            ["basis", "Basis of the system", "Elements, energy, language, symbols, science, divine channels, or hybrid?", "textarea"],
            ["schools", "Schools or categories", "Named traditions, ranks, licenses, or forbidden branches?", "textarea"],
            ["measurable", "Measurable or ranked?", "Can power levels, mana, or skill tiers be tested and compared?", "textarea"]
        ]
    },
    {
        id: "costs",
        title: "Costs & Consequences",
        hint: "What using magic takes from the user and the world.",
        questions: [
            ["usageCost", "What does using magic cost?", "Stamina, memories, lifespan, emotion, rare materials, money, souls?", "textarea", true],
            ["consumes", "What is consumed?", "Stamina, memories, lifespan, emotions, resources — be specific.", "textarea"],
            ["overuse", "Overuse consequences", "What happens when someone pushes past safe limits?", "textarea", true],
            ["sideEffects", "Physical side effects", "Scars, blindness, tremors, aging, mutation, addiction?", "textarea"],
            ["permanentDamage", "Permanent damage", "Can magic irreversibly harm the user or others?", "textarea"],
            ["recovery", "Recovery period", "How long until a caster is ready again? What aids recovery?", "textarea"]
        ]
    },
    {
        id: "mechanics",
        title: "Mechanics",
        hint: "How people learn, improve, and counter magic.",
        questions: [
            ["learning", "How do people learn magic?", "Schools, apprenticeships, books, genetics, military academies, self-taught?", "textarea", true],
            ["trainingRequired", "Training required?", "Can raw talent skip training, or does everyone need structure?", "textarea"],
            ["practice", "Improvement through practice", "What drills, rituals, or study paths advance skill?", "textarea"],
            ["formulas", "Formulas and rituals", "Spells as equations, recipes, music, geometry, or code?", "textarea"],
            ["failure", "Can magic fail?", "Why does it fail — distraction, wrong materials, anti-magic, broken rules?", "textarea", true],
            ["counters", "Counters and defenses", "Wards, null-fields, grounding, sacrifice, specialized weapons?", "textarea"]
        ]
    },
    {
        id: "limitations",
        title: "Limitations",
        hint: "Absolute caps on what the system allows.",
        questions: [
            ["absoluteLimits", "Absolute limits", "What can never happen no matter how skilled the caster?", "textarea", true],
            ["impossiblePowers", "Impossible powers", "Resurrection, time travel, infinite creation, mind control — which are off the table?", "textarea"],
            ["conservation", "Conservation laws", "Does magic obey equivalent exchange, entropy, or mass-energy rules?", "textarea"],
            ["creationLimits", "Matter, death, time", "Can magic create matter, resurrect the dead, or alter time? Under what strict conditions?", "textarea", true],
            ["environment", "Environmental factors", "What strengthens or weakens magic by location, season, or celestial events?", "textarea"],
            ["userLimits", "User limits", "Intelligence, creativity, biology, faith, or emotional state as caps?", "textarea"]
        ]
    },
    {
        id: "society",
        title: "Society & Technology",
        hint: "How magic reshapes civilization and industry.",
        questions: [
            ["warfare", "Warfare", "How has magic changed armies, sieges, assassinations, and deterrence?", "textarea", true],
            ["civilSystems", "Medicine, travel, architecture, communication", "Which everyday systems depend on magic?", "textarea", true],
            ["regulation", "Government regulation", "Licenses, bans, state casters, magical police, treaties?", "textarea"],
            ["weapons", "Magical weapons", "How common, regulated, and decisive are they?", "textarea"],
            ["vsTechnology", "Magic vs technology", "Replacement, coexistence, hybrid, or class divide?", "textarea"],
            ["industries", "Magic-dependent industries", "What economies would collapse if magic vanished tomorrow?", "textarea"]
        ]
    },
    {
        id: "conflict",
        title: "Conflict & Strategy",
        hint: "How fights work and how non-magic users survive.",
        questions: [
            ["fightStrategy", "Magical fight strategy", "Open duels, ambushes, layered wards, team combos, attrition?", "textarea", true],
            ["masters", "Beginners vs masters", "What separates a novice from a legend?", "textarea"],
            ["synergies", "Combinations and synergies", "Pairings of schools, elements, or roles that multiply power?", "textarea"],
            ["situational", "Situational superiority", "When is one type of magic clearly better than another?", "textarea"],
            ["nonMagicSurvival", "Non-magic survival", "Tactics, tools, alliances, and terrain that level the field?", "textarea", true],
            ["loopholes", "Loopholes and clever uses", "Famous exploits within the rules that changed history?", "textarea"]
        ]
    },
    {
        id: "balance",
        title: "Balance & Story",
        hint: "Keeping magic from solving every problem while reinforcing theme.",
        questions: [
            ["preventSolveAll", "Prevent solve-everything magic", "What stops casters from fixing the plot in one scene?", "textarea", true],
            ["tensionWeaknesses", "Weaknesses for tension", "Costs, counters, taboos, and timing limits that create stakes?", "textarea"],
            ["meaningfulSacrifice", "Meaningful sacrifice", "What must characters give up to win with magic?", "textarea"],
            ["storyThemes", "Reinforcing themes", "How do rules echo your story’s central ideas?", "textarea"],
            ["unique", "What makes it unique?", "Compared to other magic systems readers know, what is distinctly yours?", "textarea", true]
        ]
    }
];
