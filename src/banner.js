import { getContext } from "../../../../extensions.js";
import { getUserAvatar } from "../../../../personas.js";
import { getSettings } from "./store.js";
import { resolveBannerImages } from "./collections.js";
import { pickForMessage, bumpBannerSalt, setRotationTimer, clearRotationTimer } from "./rotation.js";
import { FULL_CROP } from "./util.js";

const BANNER_CLASS = "tinyscene-banner";
const WRAP_CLASS = "tinyscene-banner-wrap";
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
 * ST เรนเดอร์ .avatar img ในข้อความด้วย URL ธัมบ์เนล (/thumbnail?type=...&file=...) ที่ตั้งใจให้เล็ก/เบา
 * สำหรับวงกลมอวตาร — เอามาขยายเป็น banner ตรงๆ จะแตก/เบลอเพราะภาพต้นทางความละเอียดต่ำ ต้องแกะพารามิเตอร์
 * แล้วต่อ URL ไฟล์เต็มความละเอียดแทน (แพตเทิร์นเดียวกับที่ importCurrentCharacterAvatar/importCurrentPersonaAvatar
 * ใน library.js ใช้อยู่แล้ว — `characters/<avatar file>` และ `getUserAvatar(<file>)`)
 */
function fullResAvatarUrl(thumbSrc) {
    try {
        const url = new URL(thumbSrc, window.location.origin);
        if (url.pathname !== "/thumbnail") return thumbSrc; // ไม่ใช่ thumbnail (เช่น force_avatar เป็น path เต็มอยู่แล้ว) ใช้ตรงๆ
        const type = url.searchParams.get("type");
        const file = url.searchParams.get("file");
        if (!file) return thumbSrc;
        if (type === "avatar") return `characters/${file}`;
        if (type === "persona") return getUserAvatar(file);
        return thumbSrc;
    } catch {
        return thumbSrc;
    }
}

/**
 * รูปอวตารที่ ST เรนเดอร์ไว้ในข้อความนี้อยู่แล้ว — ใช้เป็น banner สำรองเมื่อยังไม่มีคอลเลกชันผูกไว้
 * ทำงานได้กับทุกตัวละคร/persona/สมาชิกแชทกลุ่มทันทีโดยไม่ต้องอัปโหลดหรือผูกอะไรเพิ่มเลย
 */
function resolveAutoAvatarImage(messageEl) {
    const img = messageEl.querySelector(".mesAvatarWrapper .avatar img") || messageEl.querySelector(".avatar img");
    const src = img?.getAttribute("src");
    if (!src) return null;
    const url = fullResAvatarUrl(src);
    return { id: "auto_" + url, url, crop: FULL_CROP, source: "auto" };
}

/** ทรง side/side-alt ที่ position below-name ต้องการให้ข้อความไหลอ้อมรูปจริง — ใช้ได้เฉพาะ 2 เงื่อนไขนี้เท่านั้น
 * (above-name/footer ยังใช้ float แบบเดิมล้วนๆ ไม่คุ้มความซับซ้อนของการย้าย DOM) */
function wantsTextWrap(settings) {
    const style = settings.banner.style;
    return (style === "side" || style === "side-alt") && settings.banner.position === "below-name";
}

/**
 * รวม .tinyscene-banner + .mes_text ไว้ใน wrapper เดียวกัน แล้วให้ wrapper (ไม่ใช่ .mes_text ตรงๆ) เป็นลูก
 * ของ .mes_block แทน — จำเป็นเพื่อให้ข้อความไหลอ้อมรูปได้แม้ TinyMobile "เต็มบับเบิ้ล" เปิดอยู่ (โหมดนั้นทำให้
 * .mes เป็น CSS Grid และ .mes_block เป็น display:contents ซึ่งดึงลูกทุกตัวของ .mes_block ขึ้นเป็น grid item
 * ของ .mes ตรงๆ — สเปก CSS Grid ระบุชัดว่า float ไม่มีผลกับ grid item เลย) พอ banner+ข้อความอยู่ใน wrapper
 * เดียวกัน wrapper เองต่างหากที่กลายเป็น grid item (เต็มแถวตามที่ TinyMobile ต้องการอยู่แล้ว) ส่วนข้างใน
 * wrapper เป็น block flow ปกติของเราเอง float เลยทำงานได้เสมอไม่ว่าข้างนอกจะเป็น grid หรือไม่ก็ตาม
 * ปลอดภัยเพราะ core ST เข้าถึง .mes_text ผ่าน .find()/.querySelector() (descendant, ไม่สนความลึก) เสมอ —
 * ไม่มีจุดไหนใน script.js/style.css ใช้ direct-child selector ".mes_block > .mes_text" เลย (เช็คแล้ว)
 * @returns {HTMLElement | null} wrapper element หรือ null ถ้ายังไม่มี .mes_text ให้ห่อ (เช่น render รอบแรกสุด)
 */
function wrapTextWithBanner(messageEl) {
    const existing = messageEl.querySelector("." + WRAP_CLASS);
    if (existing) return existing;
    const block = messageEl.querySelector(".mes_block");
    const mesText = block ? block.querySelector(":scope > .mes_text") : null;
    if (!mesText) return null;
    const wrap = document.createElement("div");
    wrap.className = WRAP_CLASS;
    mesText.replaceWith(wrap);
    wrap.appendChild(mesText);
    return wrap;
}

/** คืน .mes_text ให้เป็นลูกตรงของ .mes_block เหมือนเดิม + ย้าย banner (ถ้ามี) ออกมาด้วยกันไม่ให้หายไปกับ
 * wrapper ที่ถูกลบ (ตำแหน่งจริงของ banner จะถูกจัดใหม่โดย renderSingleBanner ทันทีหลังเรียกฟังก์ชันนี้) —
 * ต้องเรียกก่อนเสมอเมื่อไม่ต้องการโครงสร้างไหลอ้อมแล้ว (ปิด banner / เปลี่ยน style-position ออกจากเงื่อนไข
 * wantsTextWrap / ปิด extension) */
function unwrapText(messageEl) {
    const wrap = messageEl.querySelector("." + WRAP_CLASS);
    if (!wrap) return;
    const mesText = wrap.querySelector(".mes_text");
    const banner = wrap.querySelector("." + BANNER_CLASS);
    if (mesText) wrap.replaceWith(mesText); else wrap.remove();
    if (banner) insertAt(messageEl, banner, "below-name");
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

function renderSingleBanner(messageEl, image, settings, { side, showControls, wrap } = {}) {
    let el = messageEl.querySelector("." + BANNER_CLASS);
    const style = settings.banner.style || "full";
    const sideAttr = side || "";

    // จัดโครง wrap ให้ถูกต้องก่อนเสมอ (คนละเงื่อนไขกับ sameImage ด้านล่าง — สลับ position/style โดยรูปที่
    // เลือกได้บังเอิญเป็นรูปเดิมก็ต้องย้ายโครงสร้างอยู่ดี) ไม่ต้องการ wrap แล้วต้องคืนโครงสร้างเดิมก่อนเสมอ
    // เผื่อ wrap ค้างมาจาก render รอบก่อน (เช่น เพิ่งสลับออกจาก style side)
    let wrapEl = null;
    if (wrap) wrapEl = wrapTextWithBanner(messageEl);
    else unwrapText(messageEl);
    const desiredParent = wrapEl || messageEl.querySelector(".mes_block");

    const sameImage = el && el.dataset.imgId === image.id && el.dataset.tscStyle === style && (el.dataset.tscSide || "") === sideAttr;
    const needsMove = el && desiredParent && el.parentElement !== desiredParent;
    if (sameImage && !needsMove) return; // เดิมทุกอย่าง ไม่ต้องสร้างใหม่ (กันกระพริบ/รีเซ็ต scroll)

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

    if (isNew || needsMove) {
        if (wrapEl) wrapEl.insertBefore(el, wrapEl.firstChild); // banner ต้องมาก่อน .mes_text เสมอถึงจะ float ให้ข้อความไหลอ้อมได้
        else insertAt(messageEl, el, settings.banner.position);
    }
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
        unwrapText(messageEl);
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
        unwrapText(messageEl);
        messageEl.querySelector("." + BANNER_CLASS)?.remove();
        renderThumbStrip(messageEl, images, image, settings);
    } else {
        messageEl.querySelector("." + THUMB_CLASS)?.remove();
        renderSingleBanner(messageEl, image, settings, {
            side: resolveSide(settings.banner.style, isUser, settings),
            showControls: settings.banner.showControls && images.length > 1,
            wrap: wantsTextWrap(settings),
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
    // คืน .mes_text ออกจาก wrapper ก่อนเสมอ ไม่งั้น .mes_text จะหายไปพร้อม wrapper ที่ถูกลบ (ข้อความหาย!)
    document.querySelectorAll("." + WRAP_CLASS).forEach((wrap) => {
        const mesText = wrap.querySelector(".mes_text");
        const banner = wrap.querySelector("." + BANNER_CLASS);
        if (mesText) wrap.replaceWith(mesText); else wrap.remove();
        banner?.remove();
    });
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
