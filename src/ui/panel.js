import { dragElement } from "../../../../../RossAscends-mods.js";
import { loadMovingUIState } from "../../../../../power-user.js";
import { animation_duration } from "../../../../../../script.js";
import { callGenericPopup, POPUP_TYPE, POPUP_RESULT } from "../../../../../popup.js";

import { extensionFolderPath, getSettings, listImages, listCollections, createCollection, renameCollection, removeCollection, addImageToCollection, removeImageFromCollection, getCollectionImages, getBinding, setBinding, updateImageCrop } from "../store.js";
import { uploadImages, deleteImageEverywhere, importCurrentCharacterAvatar, importCurrentPersonaAvatar, importGroupMemberAvatars, listStBackgrounds, importFromBackground } from "../library.js";
import { currentEntity, currentPersona } from "../collections.js";
import { escapeHtml, formatFileSize, parseAspect, cropperDataToRect, FULL_CROP } from "../util.js";
import { refreshAllBanners } from "../banner.js";
import { refreshBackground } from "../background.js";

const PANEL_ID = "tinyscenePanel";
let panelReady = false;
let activeCollectionId = null;
let cropTargetId = null;

// native prompt()/confirm() ใช้ไม่ได้ในบริบทที่ ST ถูกห่อด้วย webview (เช่น Tauri) — ใช้กล่องของ ST เองแทนเสมอ
async function promptText(title, defaultValue = "") {
    const value = await callGenericPopup(title, POPUP_TYPE.INPUT, defaultValue);
    if (value === false || value === null) return null;
    const trimmed = String(value).trim();
    return trimmed || null;
}

async function confirmAction(title) {
    const result = await callGenericPopup(title, POPUP_TYPE.CONFIRM);
    return result === POPUP_RESULT.AFFIRMATIVE;
}

function refreshLive() {
    refreshAllBanners();
    refreshBackground();
}

function collectionOptionsHtml(selectedId) {
    const collections = listCollections();
    const options = ['<option value="">(ไม่ผูก)</option>']
        .concat(collections.map((c) => `<option value="${c.id}"${c.id === selectedId ? " selected" : ""}>${escapeHtml(c.name)} (${c.imageIds.length})</option>`));
    return options.join("");
}

/** ส่วน "บริบทปัจจุบัน" — ผูกคอลเลกชัน bg/banner ให้ตัวละคร/กลุ่มที่คุยอยู่ และ persona ที่เลือกอยู่ */
function renderEntityBindings() {
    const entity = currentEntity();
    const persona = currentPersona();

    const $entity = $("#tsc-entity-block");
    if (entity) {
        const binding = getBinding(entity.scope, entity.key);
        $entity.show();
        $("#tsc-entity-label").text(`${entity.scope === "group" ? "กลุ่ม" : "ตัวละคร"}: ${entity.label}`);
        $("#tsc-entity-bg").html(collectionOptionsHtml(binding.bgId));
        $("#tsc-entity-banner").html(collectionOptionsHtml(binding.bannerId));
    } else {
        $entity.hide();
    }

    const $persona = $("#tsc-persona-block");
    if (persona) {
        const binding = getBinding(persona.scope, persona.key);
        $persona.show();
        $("#tsc-persona-label").text(`Persona: ${persona.label}`);
        $("#tsc-persona-bg").html(collectionOptionsHtml(binding.bgId));
        $("#tsc-persona-banner").html(collectionOptionsHtml(binding.bannerId));
    } else {
        $persona.hide();
    }
}

function renderCollectionList() {
    const collections = listCollections();
    if (!activeCollectionId && collections.length) activeCollectionId = collections[0].id;
    if (activeCollectionId && !collections.some((c) => c.id === activeCollectionId)) activeCollectionId = collections[0]?.id || null;

    const html = collections.map((c) => {
        const active = c.id === activeCollectionId ? " tsc-collection-active" : "";
        return `<div class="tsc-collection-item${active}" data-id="${c.id}">
            <span class="tsc-collection-name">${escapeHtml(c.name)}</span>
            <span class="tsc-collection-count">${c.imageIds.length}</span>
            <i class="fa-solid fa-pen tsc-collection-rename" data-id="${c.id}" title="เปลี่ยนชื่อ"></i>
            <i class="fa-solid fa-trash tsc-collection-delete" data-id="${c.id}" title="ลบคอลเลกชัน"></i>
        </div>`;
    }).join("") || '<p class="tsc-hint">ยังไม่มีคอลเลกชัน — กด "+ คอลเลกชันใหม่" ด้านล่าง</p>';
    $("#tsc-collection-list").html(html);
}

function imageCardHtml(image, { inCollection }) {
    return `<div class="tsc-image-card" data-id="${image.id}">
        <img src="${encodeURI(image.url)}" loading="lazy" alt="">
        <div class="tsc-image-name" title="${escapeHtml(image.name)}">${escapeHtml(image.name)}</div>
        <div class="tsc-image-actions">
            <i class="fa-solid fa-crop tsc-img-crop" data-id="${image.id}" title="ปรับครอปสำหรับ banner"></i>
            ${inCollection
            ? `<i class="fa-solid fa-minus tsc-img-remove-col" data-id="${image.id}" title="เอาออกจากคอลเลกชันนี้"></i>`
            : `<i class="fa-solid fa-plus tsc-img-add-col" data-id="${image.id}" title="เพิ่มเข้าคอลเลกชันนี้"></i>`}
            <i class="fa-solid fa-trash tsc-img-delete" data-id="${image.id}" title="ลบออกจากคลังถาวร"></i>
        </div>
    </div>`;
}

function renderCollectionImages() {
    const $wrap = $("#tsc-collection-images");
    if (!activeCollectionId) {
        $wrap.html('<p class="tsc-hint">เลือกคอลเลกชันด้านซ้ายก่อน</p>');
        return;
    }
    const images = getCollectionImages(activeCollectionId);
    $wrap.html(images.map((img) => imageCardHtml(img, { inCollection: true })).join("")
        || '<p class="tsc-hint">คอลเลกชันนี้ยังไม่มีรูป — กด "+" บนรูปในคลังด้านล่างเพื่อเพิ่ม</p>');
}

function renderLibrary() {
    const images = listImages();
    $("#tsc-library-count").text(`${images.length} รูป`);
    $("#tsc-library-grid").html(images.map((img) => imageCardHtml(img, { inCollection: false })).join("")
        || '<p class="tsc-hint">ยังไม่มีรูปในคลัง — ลากไฟล์มาวาง หรือกด "เลือกไฟล์"</p>');
}

function renderAll() {
    renderEntityBindings();
    renderCollectionList();
    renderCollectionImages();
    renderLibrary();
}

// ---------------- upload / import ----------------

async function handleFilesAdded(fileList) {
    const { added, skipped } = await uploadImages(fileList);
    if (added.length) toastr.success(`อัปโหลดสำเร็จ ${added.length} รูป`, "TinyScene");
    for (const s of skipped) toastr.warning(`${s.name}: ${s.reason}`, "TinyScene");
    renderLibrary();
}

/** เปิด/ปิดรายการพื้นหลังของ ST ให้คลิกเลือกนำเข้าได้ทันที (ไม่ใช้ prompt() เพราะใช้ไม่ได้ในบางบริบท เช่น Tauri webview) */
async function handleImportBackground() {
    const $list = $("#tsc-bg-import-list");
    if (!$list.prop("hidden")) {
        $list.prop("hidden", true).empty();
        return;
    }
    const files = await listStBackgrounds();
    if (!files.length) { toastr.info("ไม่พบพื้นหลังของ SillyTavern", "TinyScene"); return; }
    $list.html(files.map((f) =>
        `<div class="tsc-bg-import-item" data-file="${escapeHtml(f)}">${escapeHtml(f)}</div>`,
    ).join(""));
    $list.prop("hidden", false);
}

// ---------------- crop editor ----------------

function openCropEditor(imageId) {
    const settings = getSettings();
    const image = settings.images[imageId];
    if (!image) return;
    cropTargetId = imageId;

    const $img = $("#tsc-crop-img");
    $("#tsc-crop-editor").show();
    $img.attr("src", encodeURI(image.url));

    $img.off("load").on("load", function () {
        if ($img.data("cropper")) $img.cropper("destroy");
        const natW = this.naturalWidth, natH = this.naturalHeight;
        image.w = natW; image.h = natH;
        const initData = (image.crop && natW && natH)
            ? { x: image.crop.x * natW, y: image.crop.y * natH, width: image.crop.w * natW, height: image.crop.h * natH }
            : undefined;
        $img.cropper({
            aspectRatio: parseAspect(getSettings().banner.aspect),
            viewMode: 2,
            autoCropArea: 1,
            data: initData,
        });
    });
}

function closeCropEditor() {
    const $img = $("#tsc-crop-img");
    if ($img.data("cropper")) $img.cropper("destroy");
    $("#tsc-crop-editor").hide();
    cropTargetId = null;
}

function applyCrop() {
    const $img = $("#tsc-crop-img");
    const cropper = $img.data("cropper");
    if (!cropper || !cropTargetId) return;
    const data = cropper.getData(true);
    const rect = cropperDataToRect(data, $img[0].naturalWidth, $img[0].naturalHeight);
    updateImageCrop(cropTargetId, rect);
    closeCropEditor();
    renderAll();
    refreshLive();
}

function resetCropFull() {
    if (!cropTargetId) return;
    updateImageCrop(cropTargetId, { ...FULL_CROP });
    closeCropEditor();
    renderAll();
    refreshLive();
}

// ---------------- events ----------------

function bindPanelEvents() {
    const $panel = $(`#${PANEL_ID}`);

    $panel.find(".dragClose").on("click", () => closePanel());

    $panel.on("click", "#tsc-new-collection", async () => {
        const name = await promptText("ชื่อคอลเลกชันใหม่:", "คอลเลกชันใหม่");
        if (!name) return;
        const col = createCollection(name);
        activeCollectionId = col.id;
        renderAll();
    });

    $panel.on("click", ".tsc-collection-item", function (e) {
        if ($(e.target).is(".tsc-collection-rename, .tsc-collection-delete")) return;
        activeCollectionId = $(this).data("id");
        renderCollectionList();
        renderCollectionImages();
    });
    $panel.on("click", ".tsc-collection-rename", async function (e) {
        e.stopPropagation();
        const id = $(this).data("id");
        const current = listCollections().find((c) => c.id === id);
        const name = await promptText("เปลี่ยนชื่อคอลเลกชัน:", current?.name || "");
        if (name) { renameCollection(id, name); renderAll(); }
    });
    $panel.on("click", ".tsc-collection-delete", async function (e) {
        e.stopPropagation();
        const id = $(this).data("id");
        const ok = await confirmAction("ลบคอลเลกชันนี้? (รูปในคลังจะไม่ถูกลบ)");
        if (!ok) return;
        removeCollection(id);
        if (activeCollectionId === id) activeCollectionId = null;
        renderAll();
        refreshLive();
    });

    $panel.on("click", ".tsc-img-add-col", function () {
        if (!activeCollectionId) { toastr.warning("เลือกคอลเลกชันด้านซ้ายก่อน", "TinyScene"); return; }
        addImageToCollection(activeCollectionId, $(this).data("id"));
        renderAll();
        refreshLive();
    });
    $panel.on("click", ".tsc-img-remove-col", function () {
        if (!activeCollectionId) return;
        removeImageFromCollection(activeCollectionId, $(this).data("id"));
        renderAll();
        refreshLive();
    });
    $panel.on("click", ".tsc-img-delete", async function () {
        const id = $(this).data("id");
        const image = getSettings().images[id];
        if (!image) return;
        const ok = await confirmAction(`ลบ "${image.name}" ออกจากคลังถาวร?`);
        if (!ok) return;
        await deleteImageEverywhere(image);
        renderAll();
        refreshLive();
    });
    $panel.on("click", ".tsc-bg-import-item", function () {
        const file = $(this).data("file");
        importFromBackground(file);
        $("#tsc-bg-import-list").prop("hidden", true).empty();
        renderLibrary();
        toastr.success("นำเข้าแล้ว", "TinyScene");
    });
    $panel.on("click", ".tsc-img-crop", function () {
        openCropEditor($(this).data("id"));
    });

    $panel.on("click", "#tsc-crop-apply", () => applyCrop());
    $panel.on("click", "#tsc-crop-reset", () => resetCropFull());
    $panel.on("click", "#tsc-crop-cancel", () => closeCropEditor());

    $panel.on("click", "#tsc-browse-btn", () => $("#tsc-file-input").trigger("click"));
    $panel.on("change", "#tsc-file-input", function (e) {
        if (e.target.files.length) handleFilesAdded(e.target.files);
        $(this).val("");
    });
    const dropzone = $panel.find("#tsc-dropzone");
    dropzone.on("dragover", (e) => { e.preventDefault(); dropzone.addClass("tsc-dropzone-active"); });
    dropzone.on("dragleave", () => dropzone.removeClass("tsc-dropzone-active"));
    dropzone.on("drop", (e) => {
        e.preventDefault();
        dropzone.removeClass("tsc-dropzone-active");
        const files = e.originalEvent.dataTransfer?.files;
        if (files?.length) handleFilesAdded(files);
    });

    $panel.on("click", "#tsc-import-character", () => {
        const img = importCurrentCharacterAvatar();
        if (img) { toastr.success("นำเข้าแล้ว", "TinyScene"); renderLibrary(); }
        else toastr.info("ไม่มีตัวละครที่กำลังคุยอยู่ตอนนี้", "TinyScene");
    });
    $panel.on("click", "#tsc-import-persona", () => {
        const img = importCurrentPersonaAvatar();
        if (img) { toastr.success("นำเข้าแล้ว", "TinyScene"); renderLibrary(); }
        else toastr.info("ยังไม่ได้เลือก persona", "TinyScene");
    });
    $panel.on("click", "#tsc-import-group", () => {
        const imgs = importGroupMemberAvatars();
        if (imgs.length) { toastr.success(`นำเข้าแล้ว ${imgs.length} รูป`, "TinyScene"); renderLibrary(); }
        else toastr.info("ไม่ใช่แชทกลุ่ม หรือไม่มีสมาชิก", "TinyScene");
    });
    $panel.on("click", "#tsc-import-background", () => handleImportBackground());

    $panel.on("change", "#tsc-entity-bg", function () {
        const entity = currentEntity();
        if (entity) setBinding(entity.scope, entity.key, { bgId: $(this).val() || undefined });
        renderAll(); refreshLive();
    });
    $panel.on("change", "#tsc-entity-banner", function () {
        const entity = currentEntity();
        if (entity) setBinding(entity.scope, entity.key, { bannerId: $(this).val() || undefined });
        renderAll(); refreshLive();
    });
    $panel.on("change", "#tsc-persona-bg", function () {
        const persona = currentPersona();
        if (persona) setBinding(persona.scope, persona.key, { bgId: $(this).val() || undefined });
        renderAll(); refreshLive();
    });
    $panel.on("change", "#tsc-persona-banner", function () {
        const persona = currentPersona();
        if (persona) setBinding(persona.scope, persona.key, { bannerId: $(this).val() || undefined });
        renderAll(); refreshLive();
    });
}

/** สร้างแผงลอยครั้งแรก (โหลด panel.html เข้า #movingDivs) — เรียกครั้งเดียวตอนบูต */
export async function initPanel() {
    if (panelReady) return;
    const html = await $.get(`${extensionFolderPath}/panel.html`);
    $("#movingDivs").append(html);
    bindPanelEvents();
    panelReady = true;
}

export function isPanelOpen() {
    return $(`#${PANEL_ID}`).is(":visible");
}

export function closePanel() {
    const $panel = $(`#${PANEL_ID}`);
    $panel.transition({ opacity: 0, duration: animation_duration }, () => $panel.css("display", "none"));
}

export async function openPanel() {
    await initPanel();
    const $panel = $(`#${PANEL_ID}`);
    $panel.css({ display: "block", opacity: 1 });

    if (!$panel.data("tsc-drag-bound")) {
        loadMovingUIState();
        dragElement($panel);
        $panel.data("tsc-drag-bound", true);
    }

    renderAll();
}

export function togglePanel() {
    if (isPanelOpen()) closePanel();
    else openPanel();
}
