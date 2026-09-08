import { getContext } from "../../../../extensions.js";
import { getSettings } from "./store.js";
import { resolveBackgroundImages } from "./collections.js";
import { pickForBackground, bumpBackgroundSalt, setRotationTimer, clearRotationTimer } from "./rotation.js";

const WRAP_ID = "tinyscene-bg";
const TIMER_KEY = "tinyscene-bg-timer";

function isChatLocked() {
    const ctx = getContext();
    return Boolean(ctx.chatMetadata?.["custom_background"]);
}

function ensureLayers() {
    if (document.getElementById(WRAP_ID)) return;
    const bg1 = document.getElementById("bg1");
    if (!bg1) return;
    const wrap = document.createElement("div");
    wrap.id = WRAP_ID;
    wrap.innerHTML = `
        <div class="tinyscene-bg-layer tinyscene-bg-on"></div>
        <div class="tinyscene-bg-layer"></div>
        <div class="tinyscene-bg-dim"></div>`;
    bg1.after(wrap);
}

export function teardownBackground() {
    clearRotationTimer(TIMER_KEY);
    document.getElementById(WRAP_ID)?.remove();
}

function applyFitAndDim() {
    const wrap = document.getElementById(WRAP_ID);
    if (!wrap) return;
    const settings = getSettings().background;
    const sizeMap = { cover: "cover", contain: "contain", stretch: "100% 100%" };
    wrap.querySelectorAll(".tinyscene-bg-layer").forEach((el) => {
        el.style.backgroundSize = sizeMap[settings.fit] || "cover";
        el.style.transitionDuration = `${settings.crossfadeMs}ms`;
    });
    const dim = wrap.querySelector(".tinyscene-bg-dim");
    if (dim) dim.style.opacity = String(Math.max(0, Math.min(80, settings.dim)) / 100);
}

function applyImageUrl(url) {
    ensureLayers();
    applyFitAndDim();
    const wrap = document.getElementById(WRAP_ID);
    if (!wrap) return;
    const layers = [...wrap.querySelectorAll(".tinyscene-bg-layer")];
    const onEl = layers.find((l) => l.classList.contains("tinyscene-bg-on")) || layers[0];
    const offEl = layers.find((l) => l !== onEl) || layers[1];
    if (!onEl || !offEl) return;
    if (onEl.dataset.url === url) return; // ภาพเดิม ไม่ต้อง crossfade ซ้ำ

    offEl.style.backgroundImage = `url("${url}")`;
    offEl.dataset.url = url;
    // บังคับ reflow ก่อนสลับ opacity ไม่งั้น transition จะไม่ทำงาน (คลาสเปลี่ยนพร้อมกันในเฟรมเดียว)
    void offEl.offsetWidth;
    offEl.classList.add("tinyscene-bg-on");
    onEl.classList.remove("tinyscene-bg-on");
}

/** วาดพื้นหลังใหม่ตามสถานะปัจจุบัน (บริบท/คอลเลกชัน/ล็อกแชท) — เรียกได้บ่อยเท่าที่ต้องการ ปลอดภัยไม่กระพริบถ้าภาพไม่เปลี่ยน */
export function refreshBackground({ bumpRotation = false } = {}) {
    const settings = getSettings();
    if (!settings.enabled || !settings.background.enabled) {
        teardownBackground();
        return;
    }
    if (settings.background.respectChatLock && isChatLocked()) {
        teardownBackground();
        return;
    }

    const ctx = getContext();
    const chatId = ctx.getCurrentChatId?.() || "no-chat";
    const images = resolveBackgroundImages();
    if (!images.length) {
        teardownBackground();
        return;
    }

    if (bumpRotation) bumpBackgroundSalt(chatId);
    const image = pickForBackground(images, chatId);
    if (image) applyImageUrl(image.url);

    setRotationTimer(TIMER_KEY, settings.background.rotateSeconds, () => refreshBackground({ bumpRotation: true }));
}

export function rotateBackgroundNow() {
    refreshBackground({ bumpRotation: true });
}

export function onNewMessageForBackground() {
    const settings = getSettings();
    if (settings.background.rotateOnMessage) {
        refreshBackground({ bumpRotation: true });
    } else {
        refreshBackground({});
    }
}
