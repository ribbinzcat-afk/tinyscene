import { getRequestHeaders } from "../../../../../script.js";
import { getBase64Async, saveBase64AsFile, getFileExtension } from "../../../../utils.js";
import { getContext } from "../../../../extensions.js";
import { user_avatar, getUserAvatar } from "../../../../personas.js";
import { addImage, removeImage } from "./store.js";

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024; // 12MB ต่อไฟล์ — กันกรณี base64 พองจนคำขอ JSON ใหญ่เกินจำเป็น

/** sanitize ชื่อโฟลเดอร์ย่อยให้ปลอดภัย (เซิร์ฟเวอร์ sanitize ซ้ำอยู่แล้ว แต่กันโฟลเดอร์ว่าง/ตัวอักษรพิเศษล้วนไว้ก่อน) */
function safeSubFolder(name) {
    const cleaned = String(name || "").trim();
    return cleaned || "misc";
}

/** โฟลเดอร์ย่อยของบริบทปัจจุบัน — ใช้เก็บรูปที่อัปโหลดให้เป็นหมวดหมู่ */
export function currentSubFolder() {
    const ctx = getContext();
    if (ctx.groupId) {
        const group = ctx.groups?.find((g) => g.id === ctx.groupId);
        return safeSubFolder(group?.name || ctx.groupId);
    }
    const char = ctx.characters?.[ctx.characterId];
    if (char) return safeSubFolder(char.name);
    return "misc";
}

/**
 * อัปโหลดรูปหลายไฟล์เข้าคลัง (เก็บที่ user/images/<subFolder>/) แล้วบันทึกลง settings
 * @param {FileList|File[]} files
 * @param {string} [subFolderOverride]
 * @returns {Promise<{added: TscImage[], skipped: {name:string, reason:string}[]}>}
 */
export async function uploadImages(files, subFolderOverride) {
    const subFolder = safeSubFolder(subFolderOverride || currentSubFolder());
    const added = [];
    const skipped = [];

    for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) {
            skipped.push({ name: file.name, reason: "ไม่ใช่ไฟล์รูปภาพ" });
            continue;
        }
        if (file.size > MAX_UPLOAD_BYTES) {
            skipped.push({ name: file.name, reason: `ไฟล์ใหญ่เกิน ${(MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(0)}MB` });
            continue;
        }
        try {
            const dataUri = await getBase64Async(file);
            const base64Data = dataUri.split(",")[1] ?? dataUri;
            const extension = getFileExtension(file) || "png";
            const stamp = `tsc_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
            const path = await saveBase64AsFile(base64Data, subFolder, stamp, extension);

            const dims = await imageDimensions(dataUri);
            const image = addImage({
                source: "upload",
                url: path,
                name: file.name.replace(/\.[^/.]+$/, ""),
                w: dims.w, h: dims.h,
            });
            added.push(image);
        } catch (error) {
            console.error(`[tinyscene] อัปโหลด "${file.name}" ล้มเหลว:`, error);
            skipped.push({ name: file.name, reason: error?.message || "อัปโหลดล้มเหลว" });
        }
    }

    return { added, skipped };
}

/** ดึงนามสกุลไฟล์จาก URL — ใช้แทน getFileExtension() (มันอ่าน file.name ซึ่ง Blob จาก fetch ไม่มีให้) */
function extensionFromUrl(url) {
    const clean = String(url || "").split(/[?#]/)[0];
    const dot = clean.lastIndexOf(".");
    return dot === -1 ? "png" : clean.slice(dot + 1).toLowerCase();
}

/**
 * เพิ่มรูปจาก URL ของ extension อื่นเข้าคลัง (ใช้กับท่อส่งรูปข้าม extension เช่น scene-captured ผ่าน
 * event "scap:image-generated") — path ที่อยู่บนเซิร์ฟเวอร์ ST เอง (/user/images/...) จะถูกคัดลอกเป็นไฟล์ของ
 * ตัวเองเสมอ ห้ามใช้ path ต้นทางตรงๆ เพราะไฟล์เดียวกันจะถูกอ้างอิงพร้อมกันทั้งจากข้อความในแชทของต้นทางและ
 * คลังนี้ ใครลบก่อนอีกฝ่ายพัง — ส่วน URL ภายนอกเต็ม (http/https เช่น Custom API ที่ตอบเป็นลิงก์ตรง) ไม่ต้อง
 * คัดลอก เพราะไฟล์ไม่ได้อยู่บนดิสก์เรา ไม่มีใครเป็นเจ้าของ ไม่มีปัญหา "ใครลบก่อน" (fetch() ก็ทำไม่ได้อยู่ดีถ้า
 * ปลายทางไม่เปิด CORS ให้)
 * @param {{url: string, name: string, w?: number, h?: number}} args
 */
export async function addImageFromUrl({ url, name, w = 0, h = 0 }) {
    if (/^https?:\/\//i.test(url)) {
        return addImage({ source: "generated", url, name, w, h });
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`โหลดรูปจากปลายทางไม่สำเร็จ (HTTP ${res.status})`);
    const blob = await res.blob();
    const dataUri = await getBase64Async(blob);
    const base64Data = dataUri.split(",")[1] ?? dataUri;
    const extension = extensionFromUrl(url);
    const stamp = `tsc_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
    const path = await saveBase64AsFile(base64Data, currentSubFolder(), stamp, extension);
    return addImage({ source: "generated", url: path, name, w, h });
}

function imageDimensions(src) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve({ w: 0, h: 0 });
        img.src = src;
    });
}

/** ลบรูปออกจากคลัง — ถ้าเป็นไฟล์ที่เราเป็นเจ้าของเอง (อัปโหลดเอง หรือคัดลอกมาจากท่อส่งรูปข้าม extension)
 * จะลบไฟล์บนเซิร์ฟเวอร์ด้วย ต่างจาก "การ์ด/พื้นหลังของ ST" ที่แค่อ้างอิงไฟล์คนอื่น ลบไม่ได้ */
export async function deleteImageEverywhere(image) {
    if ((image.source === "upload" || image.source === "generated") && image.url.startsWith("/user/images/")) {
        try {
            await fetch("/api/images/delete", {
                method: "POST",
                headers: getRequestHeaders(),
                body: JSON.stringify({ path: image.url }),
            });
        } catch (error) {
            console.warn(`[tinyscene] ลบไฟล์ไม่สำเร็จ (${image.url}):`, error);
        }
    }
    removeImage(image.id);
}

/** นำเข้ารูปการ์ดของตัวละครปัจจุบัน (ไม่อัปโหลดซ้ำ — อ้างอิงไฟล์เดิมของ ST) */
export function importCurrentCharacterAvatar() {
    const ctx = getContext();
    const char = ctx.characters?.[ctx.characterId];
    if (!char || char.avatar === "none") return null;
    return addImage({ source: "character", url: `characters/${char.avatar}`, name: char.name });
}

/** นำเข้ารูป avatar ของ persona ที่เลือกอยู่ตอนนี้ */
export function importCurrentPersonaAvatar() {
    if (!user_avatar) return null;
    const ctx = getContext();
    const name = ctx.powerUserSettings?.personas?.[user_avatar] || user_avatar;
    return addImage({ source: "persona", url: getUserAvatar(user_avatar), name });
}

/** นำเข้ารูป avatar ของสมาชิกกลุ่มปัจจุบันทั้งหมด (แชทกลุ่ม) */
export function importGroupMemberAvatars() {
    const ctx = getContext();
    if (!ctx.groupId) return [];
    const group = ctx.groups?.find((g) => g.id === ctx.groupId);
    if (!group) return [];
    const results = [];
    for (const avatarFile of group.members || []) {
        const char = ctx.characters?.find((c) => c.avatar === avatarFile);
        if (!char || char.avatar === "none") continue;
        results.push(addImage({ source: "character", url: `characters/${char.avatar}`, name: char.name }));
    }
    return results;
}

/** นำเข้ารูปพื้นหลังของ ST (จากรายชื่อไฟล์ใน backgrounds/) โดยไม่อัปโหลดซ้ำ */
export function importFromBackground(filename) {
    return addImage({
        source: "background",
        url: `backgrounds/${filename}`,
        name: filename.replace(/\.[^/.]+$/, ""),
    });
}

/** ดึงรายชื่อไฟล์พื้นหลังของ ST ทั้งหมด (สำหรับให้ผู้ใช้เลือกนำเข้า) */
export async function listStBackgrounds() {
    try {
        const response = await fetch("/api/backgrounds/all", {
            method: "POST",
            headers: getRequestHeaders(),
            body: JSON.stringify({}),
        });
        if (!response.ok) return [];
        const data = await response.json();
        return (data.images || []).map((i) => i.filename);
    } catch (error) {
        console.warn("[tinyscene] โหลดรายชื่อพื้นหลังของ ST ล้มเหลว:", error);
        return [];
    }
}
