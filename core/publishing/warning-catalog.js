/**
 * Canonical content labels and search aliases. Adult sexual descriptors refer
 * to adults. A label does not override Alysum's content rules.
 */
export const CORE_WARNINGS = Object.freeze([
  {
    "id": "graphic-violence",
    "label": "Graphic Violence",
    "category": "Core warnings",
    "kind": "core",
    "aliases": [
      "Graphic Depictions of Violence"
    ]
  },
  {
    "id": "major-character-death",
    "label": "Major Character Death",
    "category": "Core warnings",
    "kind": "core",
    "aliases": [
      "MCD"
    ]
  },
  {
    "id": "sexual-assault-non-consensual-sex",
    "label": "Sexual assault / non-consensual sexual activity",
    "category": "Core warnings",
    "kind": "core",
    "aliases": [
      "Rape",
      "Sexual assault",
      "Non-con",
      "Noncon",
      "Non-consensual sex"
    ]
  },
  {
    "id": "sexual-content-involving-minors",
    "label": "Sexual content involving minors",
    "category": "Core warnings",
    "kind": "core",
    "aliases": [
      "Underage sexual activity",
      "Underage sex"
    ]
  }
]);
const GROUPS = [
  [
    "Violence and injury",
    "warning",
    "Physical assault\nGraphic injuries\nBlood\nGore\nTorture\nMutilation\nDismemberment\nAmputation\nDecapitation\nStabbing\nGun violence|shooting,firearms\nStrangulation\nSuffocation\nDrowning\nBurns\nElectrocution\nCrushing injuries\nBroken bones\nEye injuries\nDental injuries\nFacial injuries\nAcid attacks\nPoisoning\nForced fighting\nPublic execution\nMob violence\nHate-motivated violence\nViolence against children\nViolence against elderly people\nViolence against disabled people\nProlonged violent assaults\nSadistic violence\nViolence used as entertainment\nViolence used as punishment\nViolence during interrogation\nViolence against restrained people\nViolence against unconscious people\nForced witnessing of violence\nForced participation in violence\nThreatened execution\nMock execution\nExecution of hostages\nExecution of prisoners\nExecution of civilians\nExtrajudicial killing\nVigilante violence\nContract killing\nAssassination\nRevenge killing\nHonor-based violence\nGang violence\nOrganized-crime violence\nRitualized violence\nViolence during a robbery\nViolence during a home invasion\nThreats of physical violence"
  ],
  [
    "Injury aftermath and recovery",
    "warning",
    "Untreated wounds\nWound infection\nWound cleaning\nWound stitching\nRemoval of embedded objects\nSevere scarring\nVisible disfigurement\nPermanent injury\nLoss of mobility following injury\nLoss of speech following injury\nMemory loss following injury\nLoss of sight following injury\nLoss of hearing following injury\nPhantom limb pain\nRehabilitation after injury\nPainful physical therapy\nDependence on others after injury\nAbandonment after injury\nInjury-related body distress\nPressure to hide pain\nPressure to work while injured\nPressure to fight while injured\nUntreated chronic pain\nPainful wound dressing changes\nMedical complications after injury\nTraumatic brain injury\nSpinal injuries\nInternal injuries\nSevere blood loss\nShock following injury"
  ],
  [
    "Death and grief",
    "warning",
    "Minor character death\nChild death\nInfant death\nParental death\nSibling death\nDeath of a partner\nDeath of a friend\nMass death\nSudden death\nAccidental death\nMurder\nTerminal illness\nProlonged dying\nFinding a body\nCorpses\nDecomposition\nFunerals\nBurial\nCremation\nBereavement\nComplicated grief\nSurvivor guilt\nNear-death experiences\nPresumed death\nFaked death\nAnticipatory grief\nRepeated bereavement\nGrief after estrangement\nGrief after an abusive relationship\nGrief following suicide\nGrief following overdose\nGrief following homicide\nGrief involving a missing person\nAmbiguous loss\nLoss without a recovered body\nIrreversible separation\nFailed rescue\nInability to save a loved one\nForced choice between loved ones\nGuilt over another person's death\nBlame for another person's death\nBleak ending\nTragic ending"
  ],
  [
    "Sexual violence and consent violations",
    "warning",
    "Attempted sexual assault\nSexual harassment|unwanted sexual advances,SH (sexual harassment)\nUnwanted sexual contact\nSexual coercion|coerced sex,pressured sexual activity\nSexual exploitation\nSexual abuse|SA,SA (sexual abuse)\nChild sexual abuse|CSA\nGrooming\nSexual blackmail\nSexual trafficking\nSexual contact with an incapacitated person\nDrug-facilitated sexual assault\nReproductive coercion|reproductive control\nSexual violence within a relationship\nSexual violence by an authority figure\nVoyeurism without consent\nNon-consensual intimate imagery|revenge porn,leaked intimate images\nNon-consensual sexual recording\nNon-consensual sexual broadcasting\nThreats of sexual violence\nAmbiguous consent|dubious consent,dubcon\nSexual boundaries ignored\nPersistent sexual demands\nConsent obtained through deception\nSexual contact while asleep|sexual contact with a sleeping person\nSexual contact while unconscious\nSexual contact during severe intoxication\nSexual activity under threat\nSexual activity under financial pressure\nSexual activity under institutional pressure\nSexual activity exchanged for protection\nUnwanted sexual observation\nSexual boundary violations within a relationship\nSexual coercion presented as romance\nSexual coercion presented as obligation\nSexual coercion presented as repayment\nConcealed information affecting consent\nConsent withdrawn during an encounter\nPressure to agree to sexual activity\nSexual activity involving unconsenting witnesses\nSexual violence|SV,SV (sexual violence)\nIncest|incestuous relationships\nPedophilia|Paedophilia,pedophilic themes,paedophilic themes"
  ],
  [
    "Domestic and psychological abuse",
    "warning",
    "Domestic violence|domestic assault\nIntimate partner violence|partner violence\nEmotional abuse|emotional mistreatment\nPsychological abuse\nVerbal abuse\nCoercive control|controlling relationship\nGaslighting\nFinancial abuse\nIsolation from friends or family\nPartner monitoring and surveillance\nThreats against loved ones\nThreats against pets\nIntimidating property destruction\nThreats of abandonment\nHumiliation\nDegradation\nVictim blaming\nAbuse justified as love\nCaregiver abuse\nAbuse by a trusted authority\nReligious abuse\nSpiritual abuse\nInstitutional abuse\nAbuse disguised as discipline\nPunishment for setting boundaries\nLove bombing used to manipulate\nThreats to disclose private information\nForced dependency\nManufactured dependency\nDeliberate psychological destabilization\nManipulation through guilt\nManipulation through grief\nManipulation through religion\nManipulation through perceived debt\nThreats of institutionalization\nThreats of deportation\nThreats of losing custody\nThreats of losing employment\nThreats of homelessness\nCoerced apologies\nCoerced public statements\nForced disclosure of trauma"
  ],
  [
    "Childhood and family trauma",
    "warning",
    "Child physical abuse\nChild emotional abuse\nChild neglect\nChildhood abandonment\nUnsafe home environment\nChildren witnessing violence\nChildren witnessing abuse\nParentification\nExploitation of children\nChild labor\nChild marriage\nForced marriage\nAbusive parenting\nFamily rejection\nFamily estrangement\nCustody disputes\nForced family separation\nRemoval from parental care\nFoster care abuse\nAdoption-related trauma\nThreats to children\nMissing children\nChild abduction\nSibling abuse\nAbuse concealed by relatives\nFamily interference with medical treatment\nFamily interference with relationships\nFamily interference with reproductive decisions\nDisinheritance used as a threat\nInheritance-related abuse\nAbuse of a dependent adult\nElder abuse\nCaregiver neglect\nCaregiver abandonment\nCaregiver burnout\nForced caregiving responsibilities\nExploitative guardianship\nInvoluntary placement in care\nAbuse in residential care\nAbuse in assisted living\nAbuse in a group home\nLoss of legal autonomy"
  ],
  [
    "Suicide and self-harm",
    "warning",
    "Suicidal thoughts|suicidal ideation\nSuicide attempt\nDeath by suicide\nDiscussion of suicide\nThreats of suicide\nSuicide bereavement\nSelf-harm|self injury,self-injury\nSelf-destructive behavior\nCompulsive skin picking\nCompulsive hair pulling\nDeliberate self-neglect\nSurviving a suicide attempt\nDiscovery of self-harm\nScars from self-harm\nPressure to conceal self-harm\nSuicide-related guilt"
  ],
  [
    "Mental health and trauma depictions",
    "warning",
    "Panic attacks\nSevere anxiety\nDepressive episodes\nTrauma flashbacks\nNightmares\nDissociation\nDepersonalization\nDerealization\nMemory loss\nIntrusive thoughts\nObsessions and compulsions\nParanoia\nHallucinations\nDelusions\nManic episodes\nPsychiatric hospitalization\nInvoluntary psychiatric treatment\nRestraint in a care setting\nSeclusion in a care setting\nMedical dismissal of mental distress\nTrauma responses\nEmotional breakdowns\nIntense hopelessness\nProlonged isolation\nFear of physical touch\nTouch aversion\nPanic during intimacy\nDissociation during intimacy\nTrauma flashbacks during intimacy\nTraumatic memory recovery\nDistress caused by memory gaps\nFear of losing control\nSevere insomnia\nSensory overload\nBurnout-related distress\nCompulsive checking\nIntense shame\nDistress involving identity loss\nReligious trauma\nPost-traumatic stress disorder|PTSD,General PTSD\nComplex post-traumatic stress disorder|C-PTSD,CPTSD,Complex PTSD\nCombat and wartime trauma|Veteran trauma,Wartime trauma,Veteran PTSD,Combat PTSD,Wartime PTSD,Veteran/Wartime trauma/PTSD"
  ],
  [
    "Eating disorders and body distress",
    "warning",
    "Eating disorder depictions\nFood restriction\nBinge eating\nPurging\nCompulsive exercise\nStarvation\nMalnutrition\nForced feeding\nFood deprivation\nWeight-based bullying\nBody shaming\nBody dysmorphia\nDistressing weight discussions\nCalorie counting\nDisordered eating encouraged by others\nFear of eating\nFood-related coercion\nDistress around weighing\nWeight-loss pressure\nEating disorder recovery\nEating disorder relapse\nCoercive dieting\nHumiliation involving body size\nCompulsive body checking"
  ],
  [
    "Medical content and illness",
    "warning",
    "Medical trauma\nMedical neglect\nMedical malpractice\nInvasive medical procedures\nSurgery\nNeedles and injections\nBlood draws\nHospitals\nIntensive care\nEmergency resuscitation\nLife support\nWithdrawal of life support\nCancer\nSerious infectious illness\nEpidemics and pandemics\nChronic pain\nSeizures\nDementia-related distress\nLoss of bodily autonomy\nUnwanted medical treatment\nUnethical medical experimentation|human experimentation\nInadequate pain treatment\nMedication withdrawal\nDistressing medication side effects\nVomiting\nChoking\nBreathing difficulties\nMedical emergencies\nForced medical examinations\nMedical restraint\nMedical gaslighting\nMisdiagnosis\nDelayed diagnosis\nOrgan transplantation\nOrgan failure\nIntubation\nVentilation\nCatheterization\nConsciousness during a procedure\nDistress involving medical equipment\nTerminal diagnosis\nCare denied because of discrimination\nGraphic depictions of illness or disease|Graphic depiction of illness/disease,Graphic illness,Graphic disease"
  ],
  [
    "Pregnancy and reproductive loss",
    "warning",
    "Difficult pregnancy\nPregnancy complications\nUnwanted pregnancy\nPregnancy after sexual assault\nMiscarriage\nEctopic pregnancy\nStillbirth\nBirth trauma\nDifficult childbirth\nDeath during childbirth\nPremature birth\nNeonatal intensive care\nInfant illness\nInfertility\nFertility treatment\nAbortion\nForced abortion\nForced pregnancy\nForced sterilization\nPostpartum depression\nPostpartum psychosis\nReproductive medical procedures\nPregnancy loss discussed\nPregnancy loss concealed\nSeparation after childbirth\nCoercion during childbirth\nReproductive healthcare denied\nPressure to become pregnant\nPressure to continue a pregnancy"
  ],
  [
    "Discrimination and hate",
    "warning",
    "Racism\nRacial slurs\nAnti-Black racism\nAntisemitism\nIslamophobia\nAnti-Asian racism\nAnti-Indigenous racism\nXenophobia\nEthnic persecution\nReligious persecution\nCaste discrimination\nColorism\nSexism\nMisogyny\nHomophobia\nLesbophobia\nBiphobia\nTransphobia\nMisgendering\nDeadnaming\nForced outing|outing without consent\nConversion practices|conversion therapy\nDiscrimination against asexual people\nIntersex discrimination\nAbleism\nDisability-related slurs\nClassism\nFatphobia\nAgeism\nHate speech\nHate crimes\nDehumanizing language\nDiscrimination against sex workers\nDiscrimination against people with addictions\nDiscrimination against refugees\nDiscrimination against homeless people\nReligious justification of discrimination\nHarassment involving gender expression\nHarassment involving sexual orientation\nColonial violence|Colonialism-related violence"
  ],
  [
    "Substance use and addiction",
    "warning",
    "Alcohol use\nAlcohol misuse\nAlcohol dependency|alcohol addiction\nDrug use\nDrug dependency|drug addiction\nPrescription medication misuse\nSmoking\nVaping\nSubstance withdrawal\nOverdose\nOverdose death\nRelapse\nGambling addiction\nIntoxicated driving\nSubstance use during pregnancy\nChildren exposed to substance misuse\nForced intoxication\nDrugging without consent\nBlackout intoxication\nMemory loss after substance use\nSubstance-related hallucinations\nSubstance-induced paranoia\nSubstance-related aggression\nSubstance-related sexual vulnerability\nSubstance use as coercion\nSubstance use as self-medication\nSubstance use to cope with trauma\nSubstance use while caring for dependents\nDangerous intoxication\nContaminated substances\nUnknown substances\nCoerced relapse\nSabotage of recovery\nExploitation during recovery\nRehabilitation-related trauma\nForced withdrawal\nDenial of addiction treatment\nDeath during withdrawal\nAddiction recovery\nAddiction-related family conflict"
  ],
  [
    "Captivity and stalking",
    "warning",
    "Kidnapping\nHostage situations\nCaptivity\nFalse imprisonment\nIncarceration\nSolitary confinement\nPrison abuse\nHuman trafficking\nEnslavement\nForced labor\nStalking|persistent unwanted pursuit\nCyberstalking\nObsessive pursuit\nDoxxing\nBlackmail\nExtortion\nHome invasion\nRestriction of movement\nForced interrogation\nThreats of confinement\nSleep deprivation\nSensory deprivation\nDenial of food or water\nDenial of medical care\nForced medication\nDeprivation of essential medication\nCaptivity involving restraint\nCaptivity involving humiliation\nCaptivity involving surveillance\nThreats of permanent captivity\nEscape attempts\nRecapture after escape\nPunishment for escape attempts\nCaptivity-related dependency\nAttachment to an abuser or captor\nThreats against family during interrogation\nForced confessions\nFalse confessions"
  ],
  [
    "War and political violence",
    "warning",
    "War\nCombat\nBombing\nTerrorism\nGenocide\nEthnic cleansing\nMassacres\nCivilian casualties\nChild soldiers\nForced conscription\nMilitary abuse\nWar crimes\nPolitical persecution\nPolitical imprisonment\nState violence\nPolice brutality\nViolent suppression of protests\nForced displacement\nRefugee experiences\nDeportation\nDetention centers\nBorder violence\nOccupation\nNuclear warfare\nChemical warfare\nBiological warfare\nForced ideological reeducation\nPolitical assassination\nViolence against journalists\nViolence against humanitarian workers\nDestruction of cultural sites\nDestruction of places of worship"
  ],
  [
    "Disasters and survival",
    "warning",
    "House fires\nWildfires\nFlooding\nEarthquakes\nTsunamis\nSevere storms\nAvalanches\nBuilding collapse\nExplosions\nPlane crashes\nTrain crashes\nVehicle crashes\nShipwrecks\nBeing stranded\nBeing lost in the wilderness\nExposure to extreme cold\nExposure to extreme heat\nDehydration\nFamine\nFood insecurity\nDisaster aftermath\nSearch-and-rescue emergencies\nLoss of a home\nLoss of a community\nEntrapment after a disaster\nMass evacuation\nDestruction of essential supplies\nLoss of essential services"
  ],
  [
    "Animal harm",
    "warning",
    "Animal abuse\nAnimal neglect\nAnimal abandonment\nAnimal injury\nAnimal death\nPet death|pet loss,death of a pet\nPet euthanasia\nAnimal experimentation\nAnimal fighting\nAnimal hunting\nAnimal slaughter\nAnimals in distress\nPredation involving animals\nThreats against animals\nSeparation from a pet\nLoss of a service animal\nAnimals trapped in a disaster\nAnimal poisoning\nAnimal captivity\nAnimal cruelty discussed\nAnimal harm|harm to animals\nBestiality|Beastiality,sexual abuse of animals"
  ],
  [
    "Horror and body horror",
    "warning",
    "Body horror|bodily horror\nGraphic bodily transformation\nParasitic infestation\nBodily infestation\nDisease-related body horror\nCannibalism\nPossession\nMind control\nMemory manipulation\nIdentity erasure\nReanimation of the dead\nLiving burial\nDesecration of remains\nHuman sacrifice\nReligious horror\nUncanny human-like figures\nDisturbing dream sequences\nReality distortion\nExistential horror\nForced transformation|involuntary transformation\nPainful transformation\nLoss of human form\nLoss of bodily identity\nUncontrolled bodily changes\nAltered anatomy\nFused bodies\nInvasive biological growth\nObjects beneath the skin\nOrgan damage\nOrgan removal\nOrgan harvesting\nUnwanted implants\nForced biological experimentation\nForced genetic modification\nForced cybernetic modification\nLoss of control over bodily movement\nA body used by another consciousness\nConsciousness trapped in an altered body\nTransformation-related reproductive horror"
  ],
  [
    "Phobia-specific depictions",
    "warning",
    "Spiders|Arachnophobia\nSnakes\nInsects\nSwarms\nRodents\nAggressive dogs\nDeep water\nOpen ocean\nHeights\nFalling\nEnclosed spaces|claustrophobic settings\nTight passages\nBeing trapped underground\nDarkness\nClowns\nDolls\nMasks\nClusters of holes|trypophobia imagery\nContamination\nGerms\nDental procedures\nBeing watched or followed\nUnstable bridges\nTrapped elevators\nBuried spaces\nBeing unable to move\nOther phobia-related content|Uncommon phobia,Uncommon phobias,Uncommon phobia/s"
  ],
  [
    "Sexual content and explicitness — adults",
    "adult",
    "Explicit Sexual Content|graphic sexual content,explicit sex\nNon-explicit sexual content|nongraphic sexual content\nSexual references\nFrequent sexual references\nExplicit sexual language\nSexual jokes\nSexual innuendo\nSexual fantasies\nSexual dreams\nSexual discussion\nDiscussion of sexual history\nDiscussion of sexual preferences\nSexual attraction described in detail\nArousal described\nSexual tension\nSexual propositions\nSexual negotiation\nSexual initiation\nSexual experimentation\nFirst sexual experience\nInexperienced adult sexual partners\nSexual encounters between strangers\nCasual sexual encounters\nOne-night stands\nRepeated sexual encounters\nExtended sexual scenes\nFrequent sexual scenes\nPredominantly sexual content\nFade-to-black sexual scenes\nImplied sexual activity|implied sex\nOff-page sexual activity\nSexual aftermath\nInterrupted sexual activity\nAwkward sexual encounters\nUncomfortable sexual encounters\nDisappointing sexual encounters\nSexual rejection\nSexual frustration\nSexual incompatibility\nSexual performance anxiety"
  ],
  [
    "Nudity and exposure",
    "content",
    "Nonsexual nudity\nSexualized nudity\nFull nudity\nPartial nudity\nDescriptions of genitals\nDetailed anatomical descriptions\nCommunal nudity\nCommunal bathing\nCommunal changing rooms\nAccidental exposure\nDeliberate exposure\nIndecent exposure\nPublic nudity\nNudity in a medical setting\nNudity during captivity\nForced undressing\nClothing removal without permission\nExposure used as humiliation\nIntimate photographs\nExplicit photographs\nExplicit artwork within the story\nSexual recordings within the story"
  ],
  [
    "Sexual activities — adults",
    "adult",
    "Masturbation\nMutual masturbation\nOral sex\nVaginal sex\nAnal sex\nManual sexual stimulation\nNon-penetrative sexual activity\nSexual touching\nSexual activity involving toys\nSexual activity involving prosthetics\nGroup sexual activity|group sex\nThreesomes\nSexual activity between established partners\nSexual activity outside an established relationship\nSexual activity in shared accommodation\nSexual activity in a workplace\nSexual activity in a public setting\nSexual activity where discovery is possible\nSexual activity observed by consenting adults\nSexual activity recorded with consent\nSexual activity broadcast with consent\nSexual activity during grief\nSexual activity after trauma\nSexual activity during recovery"
  ],
  [
    "Consensual BDSM and power exchange — adults",
    "adult",
    "BDSM themes\nBDSM relationships\nNegotiated power exchange\nDominance and submission|D/s\nSwitching dominant and submissive roles\nLong-term power-exchange relationships\nTemporary power-exchange scenes\nFormal agreements between partners\nRules and protocols between partners\nConsensual discipline\nConsensual restraint|consensual bondage,bondage\nBlindfolds\nGags\nSensory restriction\nSensory stimulation\nConsensual roleplay\nConsensual authority roleplay\nConsensual humiliation\nConsensual degradation\nConsensual objectification\nConsensual service roles\nConsensual ownership language\nConsensual pain\nImpact play\nConsensual non-consent roleplay|CNC,negotiated non-consent roleplay\nSafeword use\nSafeword discussions\nA scene stopped for safety\nAftercare\nEmotional distress following a consensual scene\nPhysical injury during a consensual scene\nNegotiation of sexual boundaries\nExplicit consent discussions"
  ],
  [
    "Abuse within sexual or power-exchange relationships",
    "warning",
    "Ignored safewords|safeword violation\nPunishment for using a safeword\nRefusal to stop sexual activity\nCoerced participation in kink\nUnnegotiated sexual acts\nUnnegotiated restraint\nUnnegotiated pain\nUnnegotiated humiliation\nUnnegotiated recording\nViolations of negotiated limits\nPressure to abandon limits\nAbuse disguised as dominance\nIsolation justified through a relationship agreement\nFinancial control within a power-exchange relationship\nWithholding essential care as punishment\nWithholding medication as punishment\nWithholding food or water as punishment\nSexual punishment without consent"
  ],
  [
    "Higher-risk sexual content — adults",
    "adult",
    "Sexual activity involving breathing restriction\nSexual activity involving weapons\nSexual activity involving blood\nSexual activity involving needles\nSexual activity involving electricity\nSexual activity involving fire\nSexual activity involving extreme temperatures\nSexual activity involving injury\nSexual activity involving intoxication\nSexual activity involving altered consciousness\nSexual activity involving medical equipment\nSexual activity involving prolonged restraint\nSexual activity involving restricted movement\nSexual activity involving confined spaces\nSexual activity involving physical exhaustion\nSexual activity involving deliberate fear"
  ],
  [
    "Bodily functions and intimate medical content",
    "content",
    "Semen\nVaginal fluids\nMenstrual blood\nSexual bleeding\nBlood during intimate contact\nUrine\nFeces\nVomit\nSaliva\nSpitting\nIncontinence\nLoss of bowel control\nLoss of bladder control\nIntimate hygiene descriptions\nIntimate medical examinations\nGenital injuries\nGenital surgery\nGenital pain\nPainful sexual activity\nSexual activity involving bodily waste\nSexual activity involving vomit\nSexual activity involving menstrual blood\nBodily fluids|Body fluids"
  ],
  [
    "Fetish and roleplay descriptors — adults",
    "adult",
    "Fetish themes|Fetish\nClothing-related fetish content\nUniform-related fetish content\nFoot-related fetish content\nBody-part-focused sexual content\nScent-focused sexual content\nVoice-focused sexual content\nVoyeurism with consent\nExhibitionism with consent\nAdult authority-role roleplay\nAdult caregiver-role roleplay\nConsensual pet roleplay\nConsensual animal-persona roleplay\nConsensual interrogation roleplay\nConsensual captivity roleplay\nConsensual punishment roleplay\nConsensual ritualized sexual activity\nSexualized worship\nSexualized praise\nSexualized humiliation\nSexualized objectification\nSexualized competition\nSexualized performance\nKink themes|Kink,Kink/Fetish\nVore themes|Vore,Vorarephilia"
  ],
  [
    "Relationships and interpersonal distress",
    "content",
    "Consensual non-monogamy|ethical non-monogamy,ENM\nOpen relationships\nPolyamorous relationships\nSwinging\nPartners sharing a sexual partner\nRelationship agreements discussed\nRelationship agreements broken\nHidden relationships\nSecret sexual relationships\nExtramarital relationships\nEmotional infidelity\nSexual infidelity|cheating,unfaithfulness\nSerial infidelity\nInfidelity discovered\nInfidelity concealed\nPartners pressured into non-monogamy\nJealousy involving multiple partners\nSexual rivalry\nRelationship sabotage\nSexual relationships between ex-partners\nSexual relationships during separation\nDeception about relationship status\nBetrayal\nRelationship breakdown\nDivorce\nAbandonment\nRejection\nBullying\nCyberbullying\nHazing\nPublic humiliation\nHarassment\nThreats\nIntimidation\nSocial exclusion\nRumor spreading\nRevenge\nObsessive jealousy\nUnrequited fixation\nExploitative friendships"
  ],
  [
    "Adult relationships involving unequal power",
    "adult",
    "Employer and employee relationships\nSupervisor and subordinate relationships\nAdult teacher and student relationships\nAdult mentor and mentee relationships\nAdult coach and athlete relationships\nTherapist and client relationships\nDoctor and patient relationships\nCaregiver and dependent-adult relationships\nReligious-leader and follower relationships\nOfficer and detainee relationships\nGuard and prisoner relationships\nMilitary superior and subordinate relationships\nPolitician and staff relationships\nLandlord and tenant relationships\nFinancial benefactor and dependent relationships\nCelebrity and fan relationships\nProfessional favoritism within a relationship\nThreatened career consequences within a relationship\nControl of housing within a relationship\nControl of treatment within a relationship\nControl of immigration status within a relationship\nAdult age-gap relationships"
  ],
  [
    "Familial and taboo sexual content — adults",
    "adult",
    "Sexual relationships between adult relatives|adult incest\nAdult sibling incest\nAdult parent and offspring incest\nSexual relationships between adult cousins\nSexual relationships between adult step-relatives\nSexual relationships between adult adoptive relatives\nSexual relationships between adults raised as family\nAdults discovering a sexual partner is related\nSexual contact with corpses|necrophilic content\nSexual contact with animals\nSexual activity involving desecration of remains\nSexual exploitation connected to familial authority"
  ],
  [
    "Sexual health and reproduction — adults",
    "adult",
    "Sexually transmitted infections|STIs,STDs\nSTI testing\nSTI diagnosis\nDisclosure of an STI\nConcealed STI status\nFear of infection\nSexual health stigma\nContraception discussions\nContraceptive failure\nContraceptive sabotage|birth-control sabotage\nSex without contraception\nSex without barrier protection\nPregnancy risk\nPregnancy anxiety\nPregnancy testing\nPaternity uncertainty\nPaternity deception\nSexual dysfunction\nErectile difficulties\nDifficulty reaching orgasm\nPain during sex\nChanges in libido\nSexual side effects of medication\nSexual side effects of illness\nSexual health misinformation"
  ],
  [
    "Sex work and sexual commerce — adults",
    "adult",
    "Consensual adult sex work\nExploitation within sex work\nCoercion into sex work\nLeaving sex work\nSurvival sex\nSexual services exchanged for necessities\nPornography production\nExploitation in pornography production\nAdult sexual performances\nAdult webcam performances\nSexualized workplace expectations\nSexual harassment by clients\nViolence against sex workers\nFinancial control by an intermediary\nBlackmail involving sex work\nThreats to disclose someone's sex work\nForced pornography production\nDistribution of sexual material without consent"
  ],
  [
    "Intimacy-related distress — adults",
    "content",
    "Sexual activity used as emotional avoidance\nSexual activity used as self-punishment\nCompulsive sexual behavior\nSexual shame\nReligious guilt surrounding sexuality\nSexual disgust\nShame after a consensual encounter\nDistress after a sexual encounter\nUnwanted sexual fantasies\nConflict between desire and personal beliefs\nPressure to disclose sexual experiences\nRidicule of sexual inexperience\nSexual reputation shaming\nVirginity shaming\nSexual performance shaming\nPublic disclosure of private sexual information\nSexual rumors\nThreats to expose intimate relationships\nHumiliation involving nudity\nHumiliation involving sexual history\nHumiliation involving sexual orientation\nHumiliation involving gender expression"
  ],
  [
    "Supernatural and speculative adult content",
    "adult",
    "Sexual content involving supernatural beings\nSexual content involving nonhuman humanoids\nSexual content involving artificial beings\nSexual content involving shapeshifters\nSexual content involving transformed adults\nSexual content involving possession\nSexual content involving mind control\nSexual content involving magical compulsion\nSexual content involving supernatural influence\nSexual content involving altered identity\nSexual content involving impersonation\nSexual content involving concealed nonhuman identity\nSupernatural pregnancy\nUnwanted supernatural pregnancy\nForced supernatural bonding\nUnwanted magical marriage\nInvoluntary supernatural attraction\nInvoluntary bodily responses caused by magic\nMagical interference with contraception\nMagical interference with reproduction"
  ],
  [
    "Crime, institutions and cults",
    "warning",
    "Forced criminal activity\nExploitation of vulnerable adults\nExploitation of undocumented people\nWorkplace coercion\nForced unpaid labor\nDebt bondage\nConfiscation of identity documents\nCorrupt law enforcement\nCorrupt medical institutions\nCorrupt care institutions\nCorrupt religious institutions\nFalse accusations\nWrongful conviction\nEvidence fabrication\nRetaliation against witnesses\nWitness intimidation\nRetaliation against whistleblowers\nAbuse of legal authority\nAbuse of immigration authority\nAbuse of guardianship\nReligious coercion\nForced religious participation\nForced conversion\nPunishment for leaving a religion\nReligious justification of abuse\nReligious justification of sexual abuse\nThreats of spiritual punishment\nThreats of damnation\nCult recruitment\nCult indoctrination\nCult captivity\nCult-related family separation\nForced separation from outsiders\nForced confession\nPublic confession used as humiliation\nForced renunciation of identity\nExtremist recruitment\nRadicalization\nApocalyptic coercion"
  ],
  [
    "Financial and housing distress",
    "warning",
    "Homelessness\nEviction\nHousing insecurity\nSevere poverty\nDebt\nFinancial ruin\nFinancial exploitation\nEmployment loss\nWorkplace exploitation\nWorkplace harassment\nInability to access medical care\nScams and fraud\nTheft of essential belongings\nLoss of cultural connection\nLoss of religious community\nThreats of financial abandonment\nFinancial exploitation by relatives\nLoss of personal identity"
  ],
  [
    "Online and reputational abuse",
    "warning",
    "Coordinated harassment\nTargeted harassment campaigns\nSexual harassment online\nThreats of sexual violence online\nThreats of physical violence online\nImpersonation online\nIdentity theft\nPublication of private messages\nPublication of medical information\nPublication of workplace information\nThreats to expose someone's identity\nFalse allegations circulated publicly\nSexual deepfakes\nIntimate-image blackmail\nLive-streamed abuse\nRecording someone in distress\nPublic shaming campaigns\nHarassment of someone's relatives\nHarassment of someone's employer\nDeliberate reputational destruction"
  ],
  [
    "Audio and visual content",
    "media",
    "Sudden loud sounds\nScreaming\nGunshot sounds\nExplosion sounds\nDistressing breathing sounds\nVomiting sounds\nMedical procedure sounds\nAnimal distress sounds\nJump scares\nFlashing lights\nStrobing effects\nRapid visual movement\nDisorienting visual effects\nDistorted or unsettling audio"
  ],
  [
    "Legacy broad labels",
    "warning",
    "Death\nAbuse\nExplicit\nMental Health Issue\nSubstance Abuse\nChild Abuse"
  ]
];
export function warningKey(value) {
    return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[’']/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}
const extra = GROUPS.flatMap(([category,kind,source]) => source.trim().split('\n').map(line => {
    const [label,aliases=''] = line.trim().split('|');
    return {id:warningKey(label),label,category,kind:category==='Legacy broad labels'?'legacy':kind,aliases:aliases.split(',').map(value=>value.trim()).filter(Boolean)};
}));
const DESCRIPTIONS = {
  "bestiality": "Sexual abuse of animals. Separate from consensual adult sexual-content descriptors.",
  "sexual-violence": "Sexual violence or its aftermath. Review whether the core non-consent warning also applies.",
  "incest": "Sexual content or abuse involving relatives. Apply relevant consent and minor-related core warnings as appropriate.",
  "pedophilia": "Themes involving sexual interest in prepubescent children. Review the core warning for sexual content involving minors where applicable.",
  "other-phobia-related-content": "Phobia-related depictions not covered by a more specific label. Use the warning note to identify the subject.",
  "vore-themes": "Sexualized fantasy themes involving swallowing or being swallowed, with adult characters. Add graphic violence warnings if graphic bodily harm is depicted.",
  "post-traumatic-stress-disorder": "Depictions or discussion of PTSD.",
  "complex-post-traumatic-stress-disorder": "Depictions or discussion of complex PTSD.",
  "combat-and-wartime-trauma": "Trauma associated with military service, combat or war; not all such trauma is PTSD.",

  "graphic-violence": "Detailed or graphic depictions of physical violence.",
  "major-character-death": "A major character dies in the work.",
  "sexual-assault-non-consensual-sex": "Sexual activity imposed without consent. Consensual adult roleplay alone is not this warning.",
  "sexual-content-involving-minors": "Sexual content involving characters who are minors. The label does not override site content rules.",
  "ambiguous-consent": "Consent is uncertain or unclear. Review whether the core non-consent warning also applies.",
  "consensual-non-consent-roleplay": "Negotiated roleplay between consenting adults. Actual violations of consent require the relevant warning.",
  "consensual-restraint": "Restraint agreed to by the adult participants.",
  "ignored-safewords": "A request or agreed signal to stop is ignored.",
  "non-consensual-intimate-imagery": "Intimate images are made or shared without the depicted person's consent.",
  "contraceptive-sabotage": "Someone interferes with contraception without the other person's agreement.",
  "sexual-infidelity": "Sexual activity breaks an established relationship agreement.",
  "body-horror": "Disturbing depictions of bodily damage, invasion or transformation.",
  "forced-outing": "Someone's private identity is disclosed without consent."
};
export const WARNING_CATALOG = Object.freeze([...CORE_WARNINGS,...extra].map(item=>Object.freeze({...item,description:DESCRIPTIONS[item.id]||''})));
export const WARNING_CATEGORIES = Object.freeze([...new Set(extra.filter(item=>item.kind!=='legacy').map(item=>item.category))]);
const byId = new Map(WARNING_CATALOG.map(item=>[item.id,item]));
const byName = new Map();
for(const item of WARNING_CATALOG)for(const term of [item.label,...item.aliases])if(!byName.has(warningKey(term)))byName.set(warningKey(term),item);
export function warningDefinition(value) {return byId.get(String(value)) || byName.get(warningKey(value)) || null;}
export function searchWarnings(query='',{category='',limit=30,offset=0}={}) {
    const words=String(query).trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').split(/\s+/).filter(Boolean);
    const matches=WARNING_CATALOG.filter(item=>item.kind!=='legacy'&&(!category||item.category===category)&&words.every(word=>[item.label,...item.aliases].join(' ').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').includes(word)));
    const key=warningKey(query);
    matches.sort((a,b)=>(warningKey(b.label)===key?1:0)-(warningKey(a.label)===key?1:0)||a.label.localeCompare(b.label));
    return {total:matches.length,items:matches.slice(offset,offset+Math.max(1,Math.min(100,limit)))};
}
