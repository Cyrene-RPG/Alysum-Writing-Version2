import { ACCOUNT_BOTH } from "@alysum/account/mode.js";

export const state = {
    oauthSignupHandled: false,
    emailSignupResumeHandled: false,
    profileSetupHandled: false,
    pendingConfirmEmail: "",
    onboardingUser: null,
    onboardingAccountType: ACCOUNT_BOTH,
    lockedUsername: "",
    selectedThemeId: "",
    selectedFontId: "",
    activePfpObjectUrl: "",
    signupInFlight: false,
};
