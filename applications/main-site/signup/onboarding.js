import { els } from "/js/signup/elements.js";
import { state } from "/js/signup/state.js";
import { supabase } from "@alysum/authentication/client.js";
import { ACCOUNT_BOTH } from "@alysum/account/mode.js";
import { DEFAULT_DAILY_WORD_GOAL } from "@alysum/writing-engine/day-stats.js";
import { formatUsernameError, usernameAlreadyTaken as accountUsernameTaken } from "@alysum/account/username.js";
import {
    GRADIENT_THEMES,
    applyChromeGradient,
    applyGradientTheme,
    getStoredGradientThemeId,
    getThemePreview
} from "@alysum/site-appearance/js-runtime/gradient-theme.js";
import {
    DISPLAY_TEXT_STYLES,
    DISPLAY_TEXT_STYLE_META,
    applyDisplayTextStyle,
    getStoredDisplayTextStyleId
} from "@alysum/site-appearance/js-runtime/display-text-style.js";
import {
    showError,
    clearError,
    saveSignupFlowState,
    sanitizeUsername,
    validateLockedUsername,
    oauthUsernameFromUser,
    isValidAccountType,
    redirectAfterSignup,
} from "/js/signup/helpers.js";
import { hideConfirmEmailStep, clearPendingConfirmEmail } from "/js/signup/confirm.js";

const ONBOARDING_THEME_IDS = GRADIENT_THEMES.map((theme) => theme.id);
const ONBOARDING_FONT_IDS = DISPLAY_TEXT_STYLES.map((style) => style.id);

state.selectedThemeId = getStoredGradientThemeId();
state.selectedFontId = getStoredDisplayTextStyleId();

export function showOnboardingStep(step) {
    const usernameOn = step === "username";
    const appearanceOn = step === "appearance";
    const pfpOn = step === "pfp";
    els.usernameStep.classList.toggle("is-hidden", !usernameOn);
    els.appearanceStep.classList.toggle("is-hidden", !appearanceOn);
    els.pfpStep.classList.toggle("is-hidden", !pfpOn);
    els.usernameStepDot.classList.toggle("active", usernameOn);
    els.appearanceStepDot.classList.toggle("active", appearanceOn);
    els.pfpStepDot.classList.toggle("active", pfpOn);
    clearError();
}

export function beginOnboarding(user, accountType, usernameCandidate = "") {
    state.onboardingUser = user;
    state.onboardingAccountType = isValidAccountType(accountType) ? accountType : ACCOUNT_BOTH;
    state.lockedUsername = "";
    const fallback = usernameCandidate || oauthUsernameFromUser(user);
    els.finalUsernameInput.value = sanitizeUsername(fallback);
    els.pfpPreviewInitial.textContent = sanitizeUsername(fallback).slice(0, 1).toUpperCase() || "A";
    saveSignupFlowState({
        userId: user.id,
        accountType: state.onboardingAccountType,
        step: "onboarding"
    });
    hideConfirmEmailStep();
    clearPendingConfirmEmail();
    els.signupCard.classList.add("is-hidden");
    els.onboardingCard.classList.remove("is-hidden");
    showOnboardingStep("username");
    els.finalUsernameInput.focus();
}

export function selectedProfilePictureFile() {
    return els.profilePictureInput?.files?.[0] || null;
}

export function validateProfilePictureFile(file) {
    if (!file) return "Upload a profile picture before entering Studio.";
    if (!file.type.startsWith("image/")) return "Please upload an image file.";
    if (file.size > 3 * 1024 * 1024) return "Image must be under 3MB.";
    return "";
}

export function updatePfpPreview(file) {
    if (state.activePfpObjectUrl) {
        URL.revokeObjectURL(state.activePfpObjectUrl);
        state.activePfpObjectUrl = "";
    }

    els.pfpPreview.innerHTML = "";

    if (!file) {
        const span = document.createElement("span");
        span.id = "pfp-preview-initial";
        span.textContent = (state.lockedUsername || els.finalUsernameInput.value || "A").slice(0, 1).toUpperCase();
        els.pfpPreview.appendChild(span);
        return;
    }

    state.activePfpObjectUrl = URL.createObjectURL(file);
    const img = document.createElement("img");
    img.src = state.activePfpObjectUrl;
    img.alt = "";
    els.pfpPreview.appendChild(img);
}

export async function uploadProfilePicture(user, file) {
    const validationMessage = validateProfilePictureFile(file);
    if (validationMessage) throw new Error(validationMessage);

    const rawExt = file.name.split(".").pop() || "png";
    const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
    const path = `${user.id}/profile-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
        .from("profile-pictures")
        .upload(path, file, {
            cacheControl: "3600",
            upsert: true,
            contentType: file.type
        });

    if (uploadError) throw uploadError;

    const { data: publicData } = supabase.storage
        .from("profile-pictures")
        .getPublicUrl(path);

    const imageUrl = publicData?.publicUrl || "";
    if (!imageUrl) throw new Error("Could not create profile image URL.");
    return imageUrl;
}

export function themeById(id) {
    return GRADIENT_THEMES.find((theme) => theme.id === id);
}

export function paintThemeChoices() {
    els.themeChoiceGrid.innerHTML = "";
    ONBOARDING_THEME_IDS.forEach((id) => {
        const theme = themeById(id);
        if (!theme) return;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "theme-choice" + (id === state.selectedThemeId ? " active" : "");
        button.textContent = theme.label;
        button.style.background = theme.preview || getThemePreview(id);
        button.addEventListener("click", () => {
            state.selectedThemeId = id;
            applyGradientTheme(id);
            applyChromeGradient(theme.preview || getThemePreview(id));
            paintThemeChoices();
        });
        els.themeChoiceGrid.appendChild(button);
    });
}

export function paintFontChoices() {
    els.fontChoiceGrid.innerHTML = "";
    ONBOARDING_FONT_IDS.forEach((id) => {
        const style = DISPLAY_TEXT_STYLES.find((item) => item.id === id);
        const meta = DISPLAY_TEXT_STYLE_META[id] || {};
        if (!style) return;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "font-choice" + (id === state.selectedFontId ? " active" : "");

        const preview = document.createElement("span");
        preview.className = "font-preview";
        preview.textContent = "Aa";
        if (meta.fontFamily) {
            preview.style.fontFamily = meta.fontFamily;
            preview.style.fontWeight = String(meta.weight || 700);
            if (meta.caps) preview.style.textTransform = "uppercase";
        }

        const label = document.createElement("span");
        label.textContent = style.label;
        button.append(preview, label);
        button.addEventListener("click", () => {
            state.selectedFontId = id;
            applyDisplayTextStyle(id);
            paintFontChoices();
        });
        els.fontChoiceGrid.appendChild(button);
    });
}

export async function usernameAlreadyTaken(username, userId) {
    return accountUsernameTaken(supabase, username, userId);
}

export async function createProfileAndEnterStudio() {
    if (!state.onboardingUser) {
        showError("Sign-up session was lost. Try logging in.");
        return;
    }

    const username = state.lockedUsername || sanitizeUsername(els.finalUsernameInput.value);
    const validationMessage = validateLockedUsername(username);
    if (validationMessage) {
        showOnboardingStep("username");
        showError(validationMessage);
        return;
    }

    els.finishOnboardingBtn.disabled = true;
    els.pfpBackBtn.disabled = true;
    clearError();

    try {
        const file = selectedProfilePictureFile();
        const pictureValidation = validateProfilePictureFile(file);
        if (pictureValidation) {
            showError(pictureValidation);
            return;
        }

        if (await usernameAlreadyTaken(username, state.onboardingUser.id)) {
            showOnboardingStep("username");
            showError("That username is already taken. Choose another before locking it in.");
            return;
        }

        applyGradientTheme(state.selectedThemeId);
        applyChromeGradient(getThemePreview(state.selectedThemeId));
        applyDisplayTextStyle(state.selectedFontId);

        const profileImageUrl = await uploadProfilePicture(state.onboardingUser, file);

        const { error: profileError } = await supabase.from("users").insert({
            id: state.onboardingUser.id,
            username,
            display_name: username,
            account_type: state.onboardingAccountType,
            profile_image_url: profileImageUrl,
            words: 0,
            streak: 0,
            daily_word_goal: DEFAULT_DAILY_WORD_GOAL,
            writing_day_totals: {}
        });

        if (profileError) {
            showError(formatUsernameError(profileError));
            return;
        }

        await supabase.auth.updateUser({
            data: {
                username,
                displayName: username,
                accountType: state.onboardingAccountType,
                profile_image_url: profileImageUrl
            }
        });

        if (state.activePfpObjectUrl) {
            URL.revokeObjectURL(state.activePfpObjectUrl);
            state.activePfpObjectUrl = "";
        }

        redirectAfterSignup();
    } catch (err) {
        showError((err && err.message) || "Could not finish setup.");
    } finally {
        els.finishOnboardingBtn.disabled = false;
        els.pfpBackBtn.disabled = false;
    }
}

export function wireOnboarding() {
    els.usernameNextBtn.addEventListener("click", async () => {
        const username = sanitizeUsername(els.finalUsernameInput.value);
        els.finalUsernameInput.value = username;
        const validationMessage = validateLockedUsername(username);

        if (validationMessage) {
            showError(validationMessage);
            return;
        }

        els.usernameNextBtn.disabled = true;
        clearError();

        try {
            if (await usernameAlreadyTaken(username, state.onboardingUser?.id)) {
                showError("That username is already taken. Choose another before locking it in.");
                return;
            }
            state.lockedUsername = username;
            updatePfpPreview(null);
            paintThemeChoices();
            paintFontChoices();
            showOnboardingStep("appearance");
        } catch (err) {
            showError((err && err.message) || "Could not check username.");
        } finally {
            els.usernameNextBtn.disabled = false;
        }
    });

    els.finalUsernameInput.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
            ev.preventDefault();
            els.usernameNextBtn.click();
        }
    });

    els.appearanceBackBtn.addEventListener("click", () => {
        state.lockedUsername = "";
        showOnboardingStep("username");
    });

    els.appearanceNextBtn.addEventListener("click", () => {
        showOnboardingStep("pfp");
    });

    els.pfpBackBtn.addEventListener("click", () => {
        showOnboardingStep("appearance");
    });

    els.profilePictureInput.addEventListener("change", () => {
        clearError();
        const file = selectedProfilePictureFile();
        const validationMessage = validateProfilePictureFile(file);
        if (validationMessage) {
            els.profilePictureInput.value = "";
            updatePfpPreview(null);
            showError(validationMessage);
            return;
        }
        updatePfpPreview(file);
    });

    els.finishOnboardingBtn.addEventListener("click", createProfileAndEnterStudio);
}
