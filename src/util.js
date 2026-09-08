/** หนี HTML พื้นฐานกันเนื้อหาชื่อไฟล์/คอลเลกชันหลุดออกมาเป็นแท็ก */
export function escapeHtml(text) {
    return String(text ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
}

/** hash string -> uint32 แบบ deterministic (FNV-1a) ใช้เลือกรูปให้ตรงกันทุกครั้งจาก key เดียวกัน */
export function hash32(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

/** เลือกสมาชิกจาก array แบบ deterministic ตาม key (เช่น "chatId|mesid|swipeId|salt") */
export function pickDeterministic(list, key) {
    if (!list.length) return null;
    return list[hash32(key) % list.length];
}

export function formatFileSize(bytes) {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** ครอปเต็มรูป (ไม่ครอปอะไรเลย) */
export const FULL_CROP = { x: 0, y: 0, w: 1, h: 1 };

/**
 * แปลงข้อมูลจาก cropper.js (getData ที่เป็นพิกเซลจริงของภาพต้นฉบับ) เป็น rect นอร์มัลไลซ์ 0-1
 * @param {{x:number,y:number,width:number,height:number}} data
 * @param {number} naturalWidth
 * @param {number} naturalHeight
 */
export function cropperDataToRect(data, naturalWidth, naturalHeight) {
    if (!naturalWidth || !naturalHeight) return { ...FULL_CROP };
    return {
        x: Math.max(0, data.x / naturalWidth),
        y: Math.max(0, data.y / naturalHeight),
        w: Math.min(1, data.width / naturalWidth),
        h: Math.min(1, data.height / naturalHeight),
    };
}

/** อ่านสัดส่วน aspect string เช่น "4 / 1" -> 4 */
export function parseAspect(aspectStr) {
    const m = String(aspectStr).match(/([\d.]+)\s*\/\s*([\d.]+)/);
    if (!m) return 4;
    return parseFloat(m[1]) / parseFloat(m[2]);
}

let debounceTimers = new Map();
/** debounce แบบมี key แยก เพื่อกันหลาย instance ชนกัน (เช่น banner หลายข้อความพร้อมกัน) */
export function debounceKeyed(key, fn, delayMs) {
    clearTimeout(debounceTimers.get(key));
    const t = setTimeout(() => { debounceTimers.delete(key); fn(); }, delayMs);
    debounceTimers.set(key, t);
}
