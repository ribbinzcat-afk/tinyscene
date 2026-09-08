import { getSettings } from "./store.js";

/**
 * เซ็ต CSS custom properties ที่ style.css ใช้ (ความสูงสูงสุดของ banner ปกติ/ใน VN mode)
 * เรียกตอนบูตและทุกครั้งที่ผู้ใช้แก้ค่าที่เกี่ยวข้อง — ไม่ต้อง rewrite <style> เพราะ style.css คงที่อยู่แล้ว
 */
export function applyBannerVars() {
    const settings = getSettings();
    const root = document.documentElement;
    root.style.setProperty("--tsc-max-h", `${settings.banner.maxHeightVh}vh`);
    root.style.setProperty("--tsc-max-h-vn", `${settings.banner.maxHeightVhVN}vh`);
}
