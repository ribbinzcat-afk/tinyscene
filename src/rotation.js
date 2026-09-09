import { hash32, pickDeterministic } from "./util.js";

/** ตัวนับ "เวียนรอบ" แยกต่อแชท แยกกันระหว่างพื้นหลังกับ banner — อยู่ใน memory เท่านั้น (รีเฟรชหน้าแล้วรีเซ็ต) */
const bannerSalt = new Map();
const backgroundSalt = new Map();

function bump(map, chatId) {
    map.set(chatId, (map.get(chatId) || 0) + 1);
    return map.get(chatId);
}
function get(map, chatId) {
    return map.get(chatId) || 0;
}

export const getBannerSalt = (chatId) => get(bannerSalt, chatId);
export const bumpBannerSalt = (chatId) => bump(bannerSalt, chatId);
export const getBackgroundSalt = (chatId) => get(backgroundSalt, chatId);
export const bumpBackgroundSalt = (chatId) => bump(backgroundSalt, chatId);

/**
 * เลือกรูป banner สำหรับข้อความหนึ่ง — ถ้าผู้ใช้เคยเลือกรูปเองไว้ (override ใน mes.extra) จะยึดตามนั้นก่อน
 * ไม่งั้นเวียนแบบ round-robin จริงตาม "ลำดับข้อความของเจ้าของฝั่งนี้" (ownerTurnIndex) — คำนวณแยกกันระหว่าง
 * user กับ char เพราะแต่ละฝั่งมีคลังรูปคนละชุด ถ้าใช้ mesid รวม (นับรวมทั้งสองฝั่ง) แล้วแฮชแทน จะเจอบั๊กที่
 * user มีแค่ 2 รูป แต่ mesid ของ user เป็นเลขคู่ล้วน (0,2,4,...) โอกาสสูงที่แฮชจะตกช่องเดิมซ้ำๆ ทำให้ banner
 * ของ user ดูเหมือนไม่เวียนเลย ทั้งที่ตั้งไว้ 2 รูป — round-robin แก้ตรงนี้เพราะรับประกันว่า ownerTurnIndex ที่
 * ต่างกัน 1 (ข้อความถัดไปของเจ้าของเดิม) จะได้ index ต่างกันเสมอเมื่อ images.length > 1
 * swipeId ยังมีผลเป็น offset เพิ่มเติม (deterministic ต่อ swipe เดียวกัน สลับไปมาก็ได้รูปเดิม)
 * @param {TscImage[]} images
 * @param {{chatId:string, ownerTurnIndex:number, swipeId:number, overrideImageId?:string}} ctx
 */
export function pickForMessage(images, { chatId, ownerTurnIndex, swipeId, overrideImageId }) {
    if (!images.length) return null;
    if (overrideImageId) {
        const found = images.find((i) => i.id === overrideImageId);
        if (found) return found;
    }
    const n = images.length;
    const salt = getBannerSalt(chatId);
    const swipeOffset = hash32(`banner-swipe|${chatId}|${swipeId ?? 0}`) % n;
    const idx = (((ownerTurnIndex ?? 0) + swipeOffset + salt) % n + n) % n;
    return images[idx];
}

/**
 * เลือกรูปพื้นหลังของแชทตอนนี้ — deterministic จาก (chatId, salt) เพื่อไม่กระพริบตอน re-render ซ้ำ
 * @param {TscImage[]} images
 * @param {string} chatId
 */
export function pickForBackground(images, chatId) {
    if (!images.length) return null;
    const salt = getBackgroundSalt(chatId);
    return pickDeterministic(images, `bg|${chatId}|${salt}`);
}

const timers = new Map();

/** ตั้ง/ล้าง interval แบบมี key เดียว (เรียกซ้ำแล้วรีเซ็ตให้เอง) — ใช้กับ "เวียนตามเวลา" ทั้ง bg และ banner */
export function setRotationTimer(key, seconds, callback) {
    clearRotationTimer(key);
    if (!seconds || seconds <= 0) return;
    const id = setInterval(callback, seconds * 1000);
    timers.set(key, id);
}

export function clearRotationTimer(key) {
    if (timers.has(key)) {
        clearInterval(timers.get(key));
        timers.delete(key);
    }
}

export function clearAllRotationTimers() {
    for (const id of timers.values()) clearInterval(id);
    timers.clear();
}
