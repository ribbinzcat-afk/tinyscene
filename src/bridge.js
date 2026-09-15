// ===== TinyScene — bridge.js =====
// ท่อรับรูปจาก extension อื่น (เช่น scene-captured) ผ่าน event bus "scap:*" — ไม่ import ต้นทางตรงๆ
// เลย ต้นทางไม่รู้จัก schema ของเรา แค่ยิง event มา ให้ไฟล์นี้เขียน+repaint เอง (ตรงกับสัญญาที่
// scene-captured ประกาศไว้ในคอมเมนต์ของมัน: "ท่อส่งรูปเข้า extension อื่น — event bus ล้วนๆ")
// deps: store, library, collections, ui/panel — ห้าม import จาก index.js (index.js เป็น bootstrap เท่านั้น)

import { getSettings, addImageToCollection, getBinding } from "./store.js";
import { addImageFromUrl } from "./library.js";
import { ensureCollection, currentEntity, bindCurrentEntity } from "./collections.js";
import { refreshPanelIfOpen } from "./ui/panel.js";

/** ประกาศตัวเป็นปลายทางถ้าเปิดรับรูปจากภายนอกอยู่ — เรียกจาก listener "scap:discover-targets" */
export function handleDiscoverTargets(probe) {
    if (!getSettings().bridge.acceptExternalImages) return;
    if (!probe || !Array.isArray(probe.targets)) return;   // payload หน้าตาไม่ตรงสัญญา — เมินไปเงียบๆ
    probe.targets.push({ id: "tinyscene", label: "TinyScene (แบนเนอร์)" });
}

/**
 * รับรูปที่เจนเสร็จแล้ว — เรียกจาก listener "scap:image-generated" (เป็น async เพราะต้อง fetch+อัปโหลดไฟล์)
 * แก้ payload.accepted/payload.error ให้ต้นทางอ่านผลได้ (ต้นทางรอ emit() แบบ await อยู่แล้ว)
 */
export async function handleImageGenerated(payload) {
    if (!payload || payload.targetId !== "tinyscene") return;   // ไม่ใช่ปลายทางเรา — ปล่อยให้ extension อื่นจัดการ
    const settings = getSettings();
    if (!settings.bridge.acceptExternalImages) {
        payload.error = "TinyScene ปิดรับรูปจากภายนอกอยู่ (เปิดได้ที่ตั้งค่า TinyScene)";
        return;
    }
    try {
        // คัดลอกไฟล์เป็นสำเนาของตัวเองเสมอ — ห้ามใช้ path ของต้นทางตรงๆ เพราะไฟล์เดียวกันจะถูกอ้างอิง
        // พร้อมกันทั้งจากข้อความในแชทของต้นทางและคลังนี้ ใครลบก่อนอีกฝ่ายพัง (ดูคอมเมนต์ใน library.js)
        const image = await addImageFromUrl({
            url: payload.url,
            name: payload.name,
            w: payload.width,
            h: payload.height,
        });

        const collectionName = settings.bridge.externalCollectionName || "AI สร้าง";
        const collection = ensureCollection(collectionName);
        addImageToCollection(collection.id, image.id);

        // auto-bind เฉพาะตอนตัวละคร/กลุ่มปัจจุบันยังไม่เคยผูก banner ไว้เลย — ถ้าผูกไว้แล้วห้ามแตะของเดิม
        // (ผู้ใช้อาจตั้งคอลเลกชันอื่นไว้ตั้งใจแล้ว) รูปยังเข้าคลัง+คอลเลกชันตามปกติ แค่ไม่โผล่เป็น banner เอง
        if (settings.bridge.externalAutoBind) {
            const entity = currentEntity();
            if (entity && !getBinding(entity.scope, entity.key).bannerId) {
                bindCurrentEntity("banner", collection.id);
            }
        }

        payload.accepted = true;
        payload.name = image.name;
        refreshPanelIfOpen();
    } catch (e) {
        console.error("[tinyscene] scap:image-generated listener ล้มเหลว:", e);
        payload.error = "เกิดข้อผิดพลาดขณะเพิ่มรูปเข้า TinyScene";
    }
}
