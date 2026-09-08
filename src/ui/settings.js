import { getSettings, saveSettings } from "../store.js";
import { refreshAllBanners, teardownBanners, rotateBannerNow } from "../banner.js";
import { refreshBackground, teardownBackground, rotateBackgroundNow } from "../background.js";
import { applyBannerVars } from "../banner-css.js";
import { togglePanel } from "./panel.js";

export const WAND_BUTTON_ID = "tinyscene-menu-button";

function refreshLive() {
    const settings = getSettings();
    applyBannerVars();
    if (!settings.enabled) {
        teardownBanners();
        teardownBackground();
        return;
    }
    refreshAllBanners();
    refreshBackground();
}

export function syncWandButtonVisibility() {
    const settings = getSettings();
    $(`#${WAND_BUTTON_ID}`).toggle(Boolean(settings.enabled));
}

/** เติมค่าปัจจุบันลงในฟอร์มตั้งค่าตอนโหลดครั้งแรก / เปิดแท็บใหม่ */
export function loadSettingsUi() {
    const s = getSettings();
    $("#tsc-enabled").prop("checked", s.enabled);

    $("#tsc-bg-enabled").prop("checked", s.background.enabled);
    $("#tsc-bg-fit").val(s.background.fit);
    $("#tsc-bg-dim").val(s.background.dim);
    $("#tsc-bg-dim-val").text(`${s.background.dim}%`);
    $("#tsc-bg-order").val(s.background.order);
    $("#tsc-bg-rotate-on-message").prop("checked", s.background.rotateOnMessage);
    $("#tsc-bg-rotate-seconds").val(s.background.rotateSeconds);
    $("#tsc-bg-respect-lock").prop("checked", s.background.respectChatLock);

    $("#tsc-banner-enabled").prop("checked", s.banner.enabled);
    $("#tsc-banner-position").val(s.banner.position);
    $("#tsc-banner-scope").val(s.banner.scope);
    $("#tsc-banner-depth").val(s.banner.depth);
    $("#tsc-banner-aspect").val(s.banner.aspect);
    $("#tsc-banner-max-h").val(s.banner.maxHeightVh);
    $("#tsc-banner-max-h-vn").val(s.banner.maxHeightVhVN);
    $("#tsc-banner-for-character").prop("checked", s.banner.forCharacter);
    $("#tsc-banner-for-persona").prop("checked", s.banner.forPersona);
    $("#tsc-banner-rotate-on-message").prop("checked", s.banner.rotateOnMessage);
    $("#tsc-banner-rotate-seconds").val(s.banner.rotateSeconds);
    $("#tsc-banner-show-controls").prop("checked", s.banner.showControls);

    syncWandButtonVisibility();
}

function bindCheckbox(id, apply) {
    $(document).on("input", id, function () {
        apply(Boolean($(this).prop("checked")));
        saveSettings();
        refreshLive();
        syncWandButtonVisibility();
    });
}
function bindValue(id, apply, { number = false } = {}) {
    $(document).on("input change", id, function () {
        const raw = $(this).val();
        apply(number ? Number(raw) : raw);
        saveSettings();
        refreshLive();
    });
}

export function bindSettingsHandlers() {
    bindCheckbox("#tsc-enabled", (v) => { getSettings().enabled = v; });

    bindCheckbox("#tsc-bg-enabled", (v) => { getSettings().background.enabled = v; });
    bindValue("#tsc-bg-fit", (v) => { getSettings().background.fit = v; });
    bindValue("#tsc-bg-dim", (v) => {
        getSettings().background.dim = v;
        $("#tsc-bg-dim-val").text(`${v}%`);
    }, { number: true });
    bindValue("#tsc-bg-order", (v) => { getSettings().background.order = v; });
    bindCheckbox("#tsc-bg-rotate-on-message", (v) => { getSettings().background.rotateOnMessage = v; });
    bindValue("#tsc-bg-rotate-seconds", (v) => { getSettings().background.rotateSeconds = Math.max(0, v); }, { number: true });
    bindCheckbox("#tsc-bg-respect-lock", (v) => { getSettings().background.respectChatLock = v; });

    bindCheckbox("#tsc-banner-enabled", (v) => { getSettings().banner.enabled = v; });
    bindValue("#tsc-banner-position", (v) => { getSettings().banner.position = v; });
    bindValue("#tsc-banner-scope", (v) => { getSettings().banner.scope = v; });
    bindValue("#tsc-banner-depth", (v) => { getSettings().banner.depth = Math.max(0, v); }, { number: true });
    bindValue("#tsc-banner-aspect", (v) => { getSettings().banner.aspect = v; });
    bindValue("#tsc-banner-max-h", (v) => { getSettings().banner.maxHeightVh = Math.max(4, v); }, { number: true });
    bindValue("#tsc-banner-max-h-vn", (v) => { getSettings().banner.maxHeightVhVN = Math.max(4, v); }, { number: true });
    bindCheckbox("#tsc-banner-for-character", (v) => { getSettings().banner.forCharacter = v; });
    bindCheckbox("#tsc-banner-for-persona", (v) => { getSettings().banner.forPersona = v; });
    bindCheckbox("#tsc-banner-rotate-on-message", (v) => { getSettings().banner.rotateOnMessage = v; });
    bindValue("#tsc-banner-rotate-seconds", (v) => { getSettings().banner.rotateSeconds = Math.max(0, v); }, { number: true });
    bindCheckbox("#tsc-banner-show-controls", (v) => { getSettings().banner.showControls = v; });

    $(document).on("click", "#tsc-open-panel", () => togglePanel());
    $(document).on("click", "#tsc-rotate-bg-now", () => rotateBackgroundNow());
    $(document).on("click", "#tsc-rotate-banner-now", () => rotateBannerNow());
}
