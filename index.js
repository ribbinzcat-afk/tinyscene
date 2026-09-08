import { eventSource, event_types } from "../../../events.js";
import { extensionName, extensionFolderPath, getSettings, renameBindingKey, deleteBindingKey } from "./src/store.js";
import { refreshAllBanners, teardownBanners, bindBannerEvents } from "./src/banner.js";
import { refreshBackground, teardownBackground, onNewMessageForBackground } from "./src/background.js";
import { applyBannerVars } from "./src/banner-css.js";
import { togglePanel } from "./src/ui/panel.js";
import { loadSettingsUi, bindSettingsHandlers, syncWandButtonVisibility, WAND_BUTTON_ID } from "./src/ui/settings.js";

/** เพิ่มปุ่มลัดในเมนูไม้กายสิทธิ์ (#extensionsMenu) — extension third-party ไม่มี container จองไว้ให้ */
function mountWandButton() {
    if ($(`#${WAND_BUTTON_ID}`).length) return;
    const button = $(`
        <div id="${WAND_BUTTON_ID}" class="list-group-item flex-container flexGap5 interactable" tabindex="0">
            <div class="fa-solid fa-images extensionsMenuExtensionButton"></div>
            <span>TinyScene</span>
        </div>`);
    button.on("click", () => togglePanel());
    $("#extensionsMenu").append(button);
    syncWandButtonVisibility();
}

function teardownAll() {
    teardownBanners();
    teardownBackground();
}

/** ข้อความใหม่/สลับ swipe/regenerate — banner หมุนเองตามธรรมชาติ (คำนวณจาก mesid/swipeId) พื้นหลังหมุนถ้าตั้งค่าไว้ */
function onMessageEvent() {
    const settings = getSettings();
    if (!settings.enabled) { teardownAll(); return; }
    refreshAllBanners();
    onNewMessageForBackground();
}

/** เหตุการณ์ทั่วไปที่ต้องวาดใหม่แต่ไม่นับเป็น "ข้อความใหม่" (ไม่เวียนพื้นหลังเพิ่ม) */
function onGenericRefresh() {
    const settings = getSettings();
    if (!settings.enabled) { teardownAll(); return; }
    refreshAllBanners();
    refreshBackground();
}

let chatObserverTimer = null;
function setupChatObserver() {
    const chatEl = document.getElementById("chat");
    if (!chatEl) return;
    const observer = new MutationObserver(() => {
        // redisplayChat() สร้าง element ใหม่ทั้งหมดโดยไม่ยิง event ใดๆ — ต้องมี fallback นี้
        clearTimeout(chatObserverTimer);
        chatObserverTimer = setTimeout(() => onGenericRefresh(), 60);
    });
    observer.observe(chatEl, { childList: true });
}

jQuery(async () => {
    console.log(`[${extensionName}] Loading...`);
    try {
        getSettings(); // เติมคีย์ที่ขาดหายก่อนวาด UI ใดๆ

        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
        $("#extensions_settings2").append(settingsHtml);
        bindSettingsHandlers();
        loadSettingsUi();
        mountWandButton();
        bindBannerEvents();
        applyBannerVars();
        setupChatObserver();
        onGenericRefresh();

        eventSource.on(event_types.CHAT_CHANGED, onGenericRefresh);
        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, onMessageEvent);
        eventSource.on(event_types.USER_MESSAGE_RENDERED, onMessageEvent);
        eventSource.on(event_types.MESSAGE_SWIPED, onMessageEvent);
        eventSource.on(event_types.MORE_MESSAGES_LOADED, onGenericRefresh);
        eventSource.on(event_types.MESSAGE_UPDATED, onGenericRefresh);
        eventSource.on(event_types.PERSONA_CHANGED, onGenericRefresh);
        eventSource.on(event_types.GROUP_UPDATED, onGenericRefresh);
        eventSource.on(event_types.SETTINGS_UPDATED, () => { applyBannerVars(); onGenericRefresh(); });

        eventSource.on(event_types.CHARACTER_RENAMED, (oldAvatar, newAvatar) => {
            renameBindingKey("character", oldAvatar, newAvatar);
        });
        eventSource.on(event_types.CHARACTER_DELETED, (payload) => {
            const avatar = payload?.character?.avatar;
            if (avatar) deleteBindingKey("character", avatar);
        });

        console.log(`[${extensionName}] ✅ Loaded successfully`);
    } catch (error) {
        console.error(`[${extensionName}] ❌ Failed to load:`, error);
        toastr.error("โหลด TinyScene ไม่สำเร็จ (ดู console)", "TinyScene");
    }
});
