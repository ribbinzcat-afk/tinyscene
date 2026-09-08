import { getContext } from "../../../../extensions.js";
import { user_avatar } from "../../../../personas.js";
import {
    getBinding, setBinding, listCollections, createCollection,
    getCollectionImages,
} from "./store.js";

/**
 * บริบทปัจจุบัน — ใช้ตัดสินว่า "ตอนนี้กำลังคุยกับใคร" เพื่อเลือกคอลเลกชันที่ผูกไว้
 * @returns {{ scope: "character"|"group", key: string, label: string } | null}
 */
export function currentEntity() {
    const ctx = getContext();
    if (ctx.groupId) {
        const group = ctx.groups?.find((g) => g.id === ctx.groupId);
        return { scope: "group", key: ctx.groupId, label: group?.name || ctx.groupId };
    }
    const char = ctx.characters?.[ctx.characterId];
    if (char) return { scope: "character", key: char.avatar, label: char.name };
    return null;
}

/** persona ที่เลือกอยู่ตอนนี้ */
export function currentPersona() {
    if (!user_avatar) return null;
    const ctx = getContext();
    const name = ctx.powerUserSettings?.personas?.[user_avatar] || user_avatar;
    return { scope: "persona", key: user_avatar, label: name };
}

/**
 * รวมรูปพื้นหลังของบริบทปัจจุบัน — ตัวละคร/กลุ่ม "และ" persona (เอามารวมกันเป็นพูลเดียว
 * เพราะพื้นหลังหนึ่งฉากอยากให้สลับได้ทั้งของสองฝั่ง) ตัดรูปซ้ำด้วย id
 */
export function resolveBackgroundImages() {
    const pools = [];
    const entity = currentEntity();
    if (entity) {
        const binding = getBinding(entity.scope, entity.key);
        if (binding.bgId) pools.push(...getCollectionImages(binding.bgId));
    }
    const persona = currentPersona();
    if (persona) {
        const binding = getBinding(persona.scope, persona.key);
        if (binding.bgId) pools.push(...getCollectionImages(binding.bgId));
    }
    return dedupe(pools);
}

/**
 * คอลเลกชัน banner ของ "ตัวละคร/กลุ่ม" ปัจจุบัน (แยกจาก persona เพราะ banner ต้องรู้ว่าเป็นข้อความของฝั่งไหน)
 */
export function resolveBannerImages(isUser) {
    if (isUser) {
        const persona = currentPersona();
        if (!persona) return [];
        const binding = getBinding(persona.scope, persona.key);
        if (!binding.bannerId) return [];
        return getCollectionImages(binding.bannerId);
    }
    const entity = currentEntity();
    if (!entity) return [];
    const binding = getBinding(entity.scope, entity.key);
    if (!binding.bannerId) return [];
    return getCollectionImages(binding.bannerId);
}

function dedupe(images) {
    const seen = new Set();
    const out = [];
    for (const img of images) {
        if (seen.has(img.id)) continue;
        seen.add(img.id);
        out.push(img);
    }
    return out;
}

export function bindCurrentEntity(kind /* 'bg'|'banner' */, collectionId) {
    const entity = currentEntity();
    if (!entity) return;
    setBinding(entity.scope, entity.key, kind === "bg" ? { bgId: collectionId } : { bannerId: collectionId });
}

export function bindCurrentPersona(kind, collectionId) {
    const persona = currentPersona();
    if (!persona) return;
    setBinding(persona.scope, persona.key, kind === "bg" ? { bgId: collectionId } : { bannerId: collectionId });
}

export function ensureCollection(name) {
    const existing = listCollections().find((c) => c.name === name);
    return existing || createCollection(name);
}
