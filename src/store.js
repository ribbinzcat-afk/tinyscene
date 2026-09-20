import { extension_settings } from "../../../../extensions.js";
import { saveSettingsDebounced } from "../../../../../script.js";

export const extensionName = "tinyscene";
export const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

/**
 * รูปแบบข้อมูลหนึ่งรูปในคลัง
 * @typedef {object} TscImage
 * @property {string} id
 * @property {"upload"|"character"|"persona"|"background"} source
 * @property {string} url          path/URL ที่ใช้แสดงผลได้ตรงๆ (เช่น "/user/images/Seraphina/tsc_xxx.png")
 * @property {string} name         ชื่อที่ผู้ใช้เห็น
 * @property {{x:number,y:number,w:number,h:number}} crop  ครอปสำหรับ banner (นอร์มัลไลซ์ 0-1)
 * @property {number} addedAt
 */

/**
 * @typedef {object} TscCollection
 * @property {string} id
 * @property {string} name
 * @property {string[]} imageIds
 */

/**
 * @typedef {object} TscBinding
 * @property {string} [bgId]      collection id ที่ใช้เป็นพื้นหลัง
 * @property {string} [bannerId]  collection id ที่ใช้เป็น banner
 */

export const defaultSettings = {
    version: 1,
    enabled: true,

    /** @type {Record<string, TscImage>} */
    images: {},
    /** @type {Record<string, TscCollection>} */
    collections: {},
    /** @type {{character: Record<string, TscBinding>, persona: Record<string, TscBinding>, group: Record<string, TscBinding>}} */
    bindings: { character: {}, persona: {}, group: {} },

    background: {
        enabled: true,
        fit: "cover",              // cover | contain | stretch
        dim: 0,                    // 0-80 (%)
        order: "sequential",       // sequential | random
        rotateOnMessage: true,
        rotateSeconds: 0,          // 0 = ปิดการเวียนตามเวลา
        respectChatLock: true,
        crossfadeMs: 900,
    },

    banner: {
        enabled: true,
        position: "below-name",    // below-name | above-name | footer | thumbs
        scope: "turn-start",       // turn-start | every
        depth: 0,                  // 0 = ทุกข้อความที่เข้าเงื่อนไข scope, N = เฉพาะ N ข้อความล่าสุด
        aspect: "4 / 1",
        maxHeightVh: 22,
        maxHeightVhVN: 14,
        forCharacter: true,
        forPersona: true,
        rotateOnMessage: true,
        rotateSeconds: 0,
        showControls: true,

        // โหมด "ไม่ต้องอัปโหลดรูปก่อน" — ถ้าตัวละคร/persona นี้ยังไม่เคยผูกคอลเลกชัน banner ไว้เลย
        // ใช้รูปอวตารที่ ST เรนเดอร์ไว้ในข้อความนั้นอยู่แล้วแทนอัตโนมัติ (การ์ดตัวละคร/รูป persona ที่มีอยู่แล้ว
        // ทุกตัว) — ทำงานได้ทันทีกับทุกตัวละครและทุกสมาชิกในแชทกลุ่มโดยไม่ต้องตั้งค่าอะไรเพิ่ม
        autoFallback: true,
        // ทรงการวาง banner ในข้อความ — ไม่มีข้อความ/ชื่อทับรูปเลย แค่เปลี่ยนสัดส่วน+ตำแหน่งของกล่องรูป
        // full = แถบกว้างเต็มข้อความ (ของเดิม) · side = การ์ดตั้งชิดด้านเดียวกันทุกข้อความ (ตาม sideDirection)
        // side-alt = การ์ดตั้งสลับข้าง ตัวละครชิดซ้าย/ผู้เล่นชิดขวา เหมือนสองฝั่งเวทีคุยกัน
        style: "full",
        // ใช้กับ style "side" เท่านั้น — ฝั่งที่การ์ดจะชิด
        sideDirection: "right",
        // ใช้กับ style "hero" เท่านั้น — ชื่อ/เวลาลอยทับบนรูปโดยตรง เปิดไว้ = มีเงามืดรองพื้นกันชื่ออ่านไม่ออก
        // เมื่อรูปสว่าง/ลายเยอะ ปิด = โปร่งใสเต็มที่ไม่มีเงาเลย (เสี่ยงอ่านชื่อไม่ออกถ้ารูปตรงจุดนั้นสว่าง)
        heroNameScrim: true,
    },

    // ท่อรับรูปจาก extension อื่น (เช่น scene-captured) ผ่าน event bus "scap:*" — ดู src/bridge.js
    bridge: {
        acceptExternalImages: true,     // เปิด = ประกาศตัวเป็นปลายทางให้ extension อื่นเลือกส่งรูปได้
        externalCollectionName: "AI สร้าง", // คอลเลกชันที่รูปจากภายนอกจะถูกจัดเก็บ (สร้างอัตโนมัติถ้ายังไม่มี)
        externalAutoBind: true,         // เปิด = ผูก collection นี้เป็น banner ให้อัตโนมัติ (เฉพาะตัวละคร/กลุ่มที่ยังไม่เคยผูก banner ไว้เลย)
    },
};

function deepMerge(target, defaults) {
    for (const key of Object.keys(defaults)) {
        const defVal = defaults[key];
        if (target[key] === undefined) {
            target[key] = structuredClone(defVal);
        } else if (defVal && typeof defVal === "object" && !Array.isArray(defVal) &&
            target[key] && typeof target[key] === "object" && !Array.isArray(target[key])) {
            deepMerge(target[key], defVal);
        }
    }
    return target;
}

/**
 * อ่าน (และเติมคีย์ที่ขาดหาย) การตั้งค่าของ extension แล้วคืนกลับมาให้ใช้งาน
 * @returns {typeof defaultSettings}
 */
export function getSettings() {
    let current = extension_settings[extensionName];
    if (!current || Object.keys(current).length === 0) {
        extension_settings[extensionName] = structuredClone(defaultSettings);
        return extension_settings[extensionName];
    }
    deepMerge(current, defaultSettings);
    return current;
}

export const saveSettings = () => saveSettingsDebounced();

function makeId(prefix) {
    return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}
export const makeImageId = () => makeId("img");
export const makeCollectionId = () => makeId("col");

// ---------------- images ----------------

export function addImage({ source, url, name, w = 0, h = 0, crop = null }) {
    const settings = getSettings();
    const id = makeImageId();
    settings.images[id] = {
        id, source, url, name: name || url.split("/").pop(),
        crop: crop || { x: 0, y: 0, w: 1, h: 1 },
        w, h,
        addedAt: Date.now(),
    };
    saveSettings();
    return settings.images[id];
}

export function removeImage(imageId) {
    const settings = getSettings();
    delete settings.images[imageId];
    for (const col of Object.values(settings.collections)) {
        col.imageIds = col.imageIds.filter((id) => id !== imageId);
    }
    saveSettings();
}

export function updateImageCrop(imageId, crop) {
    const settings = getSettings();
    const img = settings.images[imageId];
    if (!img) return null;
    img.crop = crop;
    saveSettings();
    return img;
}

export function listImages() {
    return Object.values(getSettings().images).sort((a, b) => b.addedAt - a.addedAt);
}

// ---------------- collections ----------------

export function createCollection(name) {
    const settings = getSettings();
    const id = makeCollectionId();
    settings.collections[id] = { id, name: name || "คอลเลกชันใหม่", imageIds: [] };
    saveSettings();
    return settings.collections[id];
}

export function renameCollection(collectionId, name) {
    const settings = getSettings();
    const col = settings.collections[collectionId];
    if (!col) return;
    col.name = name;
    saveSettings();
}

export function removeCollection(collectionId) {
    const settings = getSettings();
    delete settings.collections[collectionId];
    for (const scope of Object.values(settings.bindings)) {
        for (const [key, binding] of Object.entries(scope)) {
            if (binding.bgId === collectionId) delete binding.bgId;
            if (binding.bannerId === collectionId) delete binding.bannerId;
            if (!binding.bgId && !binding.bannerId) delete scope[key];
        }
    }
    saveSettings();
}

export function addImageToCollection(collectionId, imageId) {
    const settings = getSettings();
    const col = settings.collections[collectionId];
    if (!col || col.imageIds.includes(imageId)) return;
    col.imageIds.push(imageId);
    saveSettings();
}

export function removeImageFromCollection(collectionId, imageId) {
    const settings = getSettings();
    const col = settings.collections[collectionId];
    if (!col) return;
    col.imageIds = col.imageIds.filter((id) => id !== imageId);
    saveSettings();
}

export function listCollections() {
    return Object.values(getSettings().collections);
}

export function getCollectionImages(collectionId) {
    const settings = getSettings();
    const col = settings.collections[collectionId];
    if (!col) return [];
    return col.imageIds.map((id) => settings.images[id]).filter(Boolean);
}

// ---------------- bindings ----------------

/**
 * @param {"character"|"persona"|"group"} scope
 * @param {string} key
 * @returns {TscBinding}
 */
export function getBinding(scope, key) {
    const settings = getSettings();
    return settings.bindings[scope]?.[key] || {};
}

export function setBinding(scope, key, patch) {
    const settings = getSettings();
    if (!settings.bindings[scope]) settings.bindings[scope] = {};
    settings.bindings[scope][key] = { ...settings.bindings[scope][key], ...patch };
    // ล้าง binding ว่างทิ้ง
    const b = settings.bindings[scope][key];
    if (!b.bgId && !b.bannerId) delete settings.bindings[scope][key];
    saveSettings();
}

export function renameBindingKey(scope, oldKey, newKey) {
    const settings = getSettings();
    const bucket = settings.bindings[scope];
    if (!bucket || !bucket[oldKey] || oldKey === newKey) return;
    bucket[newKey] = bucket[oldKey];
    delete bucket[oldKey];
    saveSettings();
}

export function deleteBindingKey(scope, key) {
    const settings = getSettings();
    delete settings.bindings[scope]?.[key];
    saveSettings();
}
