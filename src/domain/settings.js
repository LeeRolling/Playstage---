/**
 * 玩家在戏台上的显示偏好。只记档位，不关心像素。
 * 和世界书、模型设置一起写在 data/library.json，关掉再打开还在。
 *
 * uiSkinMode 为 auto 时，样子跟着当前舞台走。
 * 为 manual 时，用 uiSkin 里选定的那一套，换舞台也不会改，直到玩家再选。
 */

import { clone } from "./util.js";

const SPRITE_SCALES = new Set(["small", "medium", "large"]);
const DIALOG_SCALES = new Set(["short", "medium", "tall"]);
const SKIN_IDS = new Set(["classic", "eastern", "cyber", "nordic"]);
const SKIN_MODES = new Set(["auto", "manual"]);

export const UI_SKINS = [
  { id: "classic", name: "经典" },
  { id: "eastern", name: "东方 · 青玄" },
  { id: "cyber", name: "赛博 · 霓穹" },
  { id: "nordic", name: "北欧 · 霜印" },
];

const STAGE_SKIN = {
  "stage-azure": "eastern",
  "stage-neon": "cyber",
  "stage-frost": "nordic",
};

export const DEFAULT_SETTINGS = {
  spriteScale: "large",
  dialogScale: "short",
  uiSkin: "classic",
  uiSkinMode: "auto",
};

export function normalizeSettings(raw) {
  return {
    spriteScale: SPRITE_SCALES.has(raw?.spriteScale) ? raw.spriteScale : DEFAULT_SETTINGS.spriteScale,
    dialogScale: DIALOG_SCALES.has(raw?.dialogScale) ? raw.dialogScale : DEFAULT_SETTINGS.dialogScale,
    uiSkin: SKIN_IDS.has(raw?.uiSkin) ? raw.uiSkin : DEFAULT_SETTINGS.uiSkin,
    uiSkinMode: SKIN_MODES.has(raw?.uiSkinMode) ? raw.uiSkinMode : DEFAULT_SETTINGS.uiSkinMode,
  };
}

export function ensureSettings(library) {
  const settings = normalizeSettings(library?.settings);
  const current = library?.settings;
  if (
    current &&
    current.spriteScale === settings.spriteScale &&
    current.dialogScale === settings.dialogScale &&
    current.uiSkin === settings.uiSkin &&
    current.uiSkinMode === settings.uiSkinMode
  ) {
    return library;
  }
  return { ...library, settings: { ...current, ...settings } };
}

export function updateSettings(library, fields) {
  const next = clone(library);
  const previous = next.settings || {};
  const settings = normalizeSettings(previous);
  if (fields.spriteScale != null && fields.spriteScale !== "") {
    if (!SPRITE_SCALES.has(fields.spriteScale)) throw new Error("立绘大小请选小、中或大。");
    settings.spriteScale = fields.spriteScale;
  }
  if (fields.dialogScale != null && fields.dialogScale !== "") {
    if (!DIALOG_SCALES.has(fields.dialogScale)) throw new Error("对话框高度请选矮、中或高。");
    settings.dialogScale = fields.dialogScale;
  }
  if (fields.uiSkinMode != null && fields.uiSkinMode !== "") {
    if (!SKIN_MODES.has(fields.uiSkinMode)) throw new Error("皮肤方式请选跟随舞台，或自己指定。");
    settings.uiSkinMode = fields.uiSkinMode;
  }
  if (fields.uiSkin != null && fields.uiSkin !== "") {
    if (!SKIN_IDS.has(fields.uiSkin)) throw new Error("没有这套皮肤。请选经典、东方、赛博或北欧。");
    settings.uiSkin = fields.uiSkin;
    if (fields.uiSkinMode == null || fields.uiSkinMode === "") settings.uiSkinMode = "manual";
  }
  next.settings = { ...previous, ...settings };
  return next;
}

export function resolveUiSkin(library) {
  const settings = normalizeSettings(library?.settings);
  if (settings.uiSkinMode === "manual") return settings.uiSkin;
  if (!library?.stagePicked) return "classic";
  const stage = library.stages?.find((item) => item.id === library.activeStageId);
  if (stage && SKIN_IDS.has(stage.skinId)) return stage.skinId;
  return STAGE_SKIN[library.activeStageId] || "classic";
}

export function skinName(id) {
  return UI_SKINS.find((item) => item.id === id)?.name || "经典";
}
