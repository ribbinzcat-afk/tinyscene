import { getContext } from "../../../../extensions.js";
import { getSettings } from "./store.js";
import { resolveBannerImages } from "./collections.js";
import { pickForMessage, bumpBannerSalt, setRotationTimer, clearRotationTimer } from "./rotation.js";
import { FULL_CROP } from "./util.js";

const BANNER_CLASS = "tinyscene-banner";
const THUMB_CLASS = "tinyscene-banner-thumbs";
const TIMER_KEY = "tinyscene-banner-timer";

function currentChatId() {
    return getContext().getCurrentChatId?.() || "no-chat";
}

/** นับว่าข้อความนี้เป็น "ข้อความที่กี่" ของเจ้าของฝั่งนี้ (user หรือ char แยกกัน) — ใช้เวียน banner แบบ round-robin จริง */
function getOwnerTurnIndex(chat, mesid, isUser) {
    let count = 0;
    for (let i = 0; i < mesid && i < (chat?.length || 0); i++) {
        if (!!chat[i]?.is_user === isUser) count++;
    }
    return count;
}

/** ข้อความก่อนหน้า (ข้าม system message เล็กๆ) เพื่อดูว่านี่คือ "ข้อความแรกของช่วงพูด" หรือไม่ */
function isTurnStart(mesEl) {
    let prev = mesEl.previousElementSibling;
    while (prev && !prev.classList.contains("mes")) prev = prev.previousElementSibling;
    if (!prev || prev.classList.contains("smallSysMes")) return true;
    return prev.getAttribute("is_user") !== mesEl.getAttribute("is_user") ||
        prev.getAttribute("ch_name") !== mesEl.getAttribute("ch_name");
}

function shouldShowBanner(mesEl, settings) {
    if (mesEl.classList.contains("smallSysMes")) return false;
    const isUser = mesEl.getAttribute("is_user") === "true";
    if (isUser && !settings.banner.forPersona) return false;
    if (!isUser && !settings.banner.forCharacter) return false;
    if (settings.banner.scope === "turn-start" && !isTurnStart(mesEl)) return false;
    if (settings.banner.depth > 0) {
        const total = getContext().chat?.length || 0;
        const mesid = Number(mesEl.getAttribute("mesid"));
        if (total - 1 - mesid >= settings.banner.depth) return false;
    }
    return true;
}

function controlsHtml() {
    return '<div class="tinyscene-banner-controls">'
        + '<div class="tinyscene-banner-nav tinyscene-banner-prev" title="รูปก่อนหน้า"><i class="fa-solid fa-chevron-left"></i></div>'
        + '<div class="tinyscene-banner-nav tinyscene-banner-next" title="รูปถัดไป"><i class="fa-solid fa-chevron-right"></i></div>'
        + '</div>';
}

/** style "side" ชิดข้างเดียวกันทุกข้อความตาม sideDirection, style "side-alt" สลับข้างตามฝั่งผู้พูด (ตัวละครซ้าย/ผู้เล่นขวา) */
function resolveSide(style, isUser, settings) {
    if (style === "side-alt") return isUser ? "right" : "left";
    if (style === "side") return settings.banner.sideDirection === "left" ? "left" : "right";
    return null;
}

/**
 * รูปอวตารที่ ST เรนเดอร์ไว้ในข้อความนี้อยู่แล้ว — ใช้เป็น banner สำรองเมื่อยังไม่มีคอลเลกชันผูกไว้
 * ทำงานได้กับทุกตัวละคร/persona/สมาชิกแชทกลุ่มทันทีโดยไม่ต้องอัปโหลดหรือผูกอะไรเพิ่มเลย
 */
function resolveAutoAvatarImage(messageEl) {
    const img = messageEl.querySelector(".mesAvatarWrapper .avatar img") || messageEl.querySelector(".avatar img");
    const src = img?.getAttribute("src");
    if (!src) return null;
    return { id: "auto_" + src, url: src, crop: FULL_CROP, source: "auto" };
}

function insertAt(messageEl, el, position) {
    const block = messageEl.querySelector(".mes_block");
    if (!block) return;
    if (position === "above-name") {
        block.insertBefore(el, block.firstChild);
        return;
    }
    if (position === "footer") {
        const mesText = block.querySelector(".mes_text");
        if (mesText) mesText.after(el); else block.appendChild(el);
        return;
    }
    // below-name / thumbs — วางไว้ใต้แถวชื่อ+เวลา+ปุ่ม
    const chName = block.querySelector(".ch_name");
    if (chName) chName.after(el); else block.insertBefore(el, block.firstChild);
}

function setMessageOverride(mesid, imageId) {
    const ctx = getContext();
    const mes = ctx.chat?.[mesid];
    if (!mes) return;
    if (!mes.extra) mes.extra = {};
    mes.extra.tinyscene = { imageId };
    ctx.saveChat?.();
}

function renderSingleBanner(messageEl, image, settings, { side, showControls } = {}) {
    let el = messageEl.querySelector("." + BANNER_CLASS);
    const style = settings.banner.style || "full";
    const sideAttr = side || "";
    if (el && el.dataset.imgId === image.id && el.dataset.tscStyle === style && (el.dataset.tscSide || "") === sideAttr) return; // เดิมทุกอย่าง ไม่ต้องสร้างใหม่ (กันกระพริบ/รีเซ็ต scroll)

    const isNew = !el;
    if (!el) {
        el = document.createElement("div");
        el.className = BANNER_CLASS;
    }
    el.dataset.imgId = image.id;
    el.dataset.tscStyle = style;
    // data-tsc-side ต้องไม่มี attribute เลยเมื่อไม่ใช่ทรงด้านข้าง (setAttribute ค่า "" ก็ยังนับว่า
    // attribute "มีอยู่" ทำให้ selector CSS [data-tsc-side] ของทรง side ดันจับ full ไปด้วย — ต้อง removeAttribute จริงๆ)
    if (sideAttr) el.setAttribute("data-tsc-side", sideAttr); else el.removeAttribute("data-tsc-side");
    const c = image.crop || FULL_CROP;
    el.style.setProperty("--tsc-ar", settings.banner.aspect);
    el.style.setProperty("--tsc-cx", String(c.x));
    el.style.setProperty("--tsc-cy", String(c.y));
    el.style.setProperty("--tsc-cw", String(c.w || 1));
    el.style.setProperty("--tsc-ch", String(c.h || 1));
    el.innerHTML = '<img src="' + encodeURI(image.url) + '" alt="">'
        + (showControls ? controlsHtml() : "");

    if (isNew) insertAt(messageEl, el, settings.banner.position);
}

function renderThumbStrip(messageEl, images, currentImage, settings) {
    let el = messageEl.querySelector("." + THUMB_CLASS);
    const isNew = !el;
    if (!el) {
        el = document.createElement("div");
        el.className = THUMB_CLASS;
    }
    const chips = images.slice(0, 8).map((img) => {
        const active = img.id === currentImage?.id ? " tinyscene-thumb-active" : "";
        return '<div class="tinyscene-thumb' + active + '" data-img-id="' + img.id + '"><img src="' + encodeURI(img.url) + '" alt=""></div>';
    }).join("");
    el.innerHTML = chips;
    if (isNew) insertAt(messageEl, el, "below-name");
}

/**
 * วาด/อัปเดต banner ของข้อความเดียว ตามการตั้งค่าปัจจุบัน
 * @param {HTMLElement} messageEl  .mes
 * @param {boolean} [force] บังคับสร้างใหม่ (ใช้หลังผู้ใช้กดเปลี่ยนรูปเอง)
 */
export function renderBannerForMessage(messageEl, force = false) {
    const settings = getSettings();
    const clearBoth = () => {
        messageEl.querySelector("." + BANNER_CLASS)?.remove();
        messageEl.querySelector("." + THUMB_CLASS)?.remove();
    };

    if (!settings.enabled || !settings.banner.enabled || !shouldShowBanner(messageEl, settings)) {
        clearBoth();
        return;
    }

    const isUser = messageEl.getAttribute("is_user") === "true";
    let images = resolveBannerImages(isUser);
    let autoMode = false;
    if (!images.length && settings.banner.autoFallback) {
        const auto = resolveAutoAvatarImage(messageEl);
        if (auto) { images = [auto]; autoMode = true; }
    }
    if (!images.length) { clearBoth(); return; }

    const ctx = getContext();
    const mesid = Number(messageEl.getAttribute("mesid"));
    const mes = ctx.chat?.[mesid];
    const swipeId = mes?.swipe_id ?? 0;
    const overrideImageId = autoMode ? undefined : mes?.extra?.tinyscene?.imageId;
    const ownerTurnIndex = getOwnerTurnIndex(ctx.chat, mesid, isUser);
    const image = pickForMessage(images, { chatId: currentChatId(), ownerTurnIndex, swipeId, overrideImageId });
    if (!image) { clearBoth(); return; }

    if (force) messageEl.querySelector("." + BANNER_CLASS)?.removeAttribute("data-img-id");

    // เวียนรูปเอง/thumbs strip ไม่มีความหมายเมื่อเหลือรูปเดียวจาก fallback — ไม่โชว์ปุ่ม/แถบให้กดเปล่าๆ
    if (settings.banner.position === "thumbs" && !autoMode) {
        messageEl.querySelector("." + BANNER_CLASS)?.remove();
        renderThumbStrip(messageEl, images, image, settings);
    } else {
        messageEl.querySelector("." + THUMB_CLASS)?.remove();
        renderSingleBanner(messageEl, image, settings, {
            side: resolveSide(settings.banner.style, isUser, settings),
            showControls: settings.banner.showControls && images.length > 1,
        });
    }
}

export function refreshAllBanners() {
    document.querySelectorAll("#chat .mes").forEach((el) => renderBannerForMessage(el));
    const settings = getSettings();
    setRotationTimer(TIMER_KEY, settings.banner.rotateSeconds, () => {
        bumpBannerSalt(currentChatId());
        document.querySelectorAll("#chat .mes").forEach((el) => renderBannerForMessage(el));
    });
}

export function refreshBannerForMesId(mesid) {
    const el = document.querySelector('#chat .mes[mesid="' + mesid + '"]');
    if (el) renderBannerForMessage(el, true);
}

export function rotateBannerNow() {
    bumpBannerSalt(currentChatId());
    document.querySelectorAll("#chat .mes").forEach((el) => renderBannerForMessage(el, true));
}

export function teardownBanners() {
    clearRotationTimer(TIMER_KEY);
    document.querySelectorAll("." + BANNER_CLASS + ", ." + THUMB_CLASS).forEach((el) => el.remove());
}

function cycleOverride(messageEl, direction) {
    const isUser = messageEl.getAttribute("is_user") === "true";
    const images = resolveBannerImages(isUser);
    if (!images.length) return;
    const bannerEl = messageEl.querySelector("." + BANNER_CLASS);
    const currentId = bannerEl?.dataset.imgId;
    const idx = Math.max(0, images.findIndex((i) => i.id === currentId));
    const next = images[(idx + direction + images.length) % images.length];
    const mesid = Number(messageEl.getAttribute("mesid"));
    setMessageOverride(mesid, next.id);
    renderBannerForMessage(messageEl, true);
}

let eventsBound = false;
/** ผูก event handler ของปุ่มควบคุม banner (delegate บน document เพื่อให้ทำงานกับข้อความที่ยังไม่เกิดตอนผูกด้วย) */
export function bindBannerEvents() {
    if (eventsBound) return;
    eventsBound = true;
    $(document).on("click", "." + BANNER_CLASS + " .tinyscene-banner-prev", function (e) {
        e.stopPropagation();
        cycleOverride($(this).closest(".mes")[0], -1);
    });
    $(document).on("click", "." + BANNER_CLASS + " .tinyscene-banner-next", function (e) {
        e.stopPropagation();
        cycleOverride($(this).closest(".mes")[0], 1);
    });
    $(document).on("click", "." + THUMB_CLASS + " .tinyscene-thumb", function (e) {
        e.stopPropagation();
        const messageEl = $(this).closest(".mes")[0];
        const mesid = Number(messageEl.getAttribute("mesid"));
        setMessageOverride(mesid, $(this).data("img-id"));
        renderBannerForMessage(messageEl, true);
    });
}
