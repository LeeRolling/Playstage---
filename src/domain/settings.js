/**
 * 玩家在戏台上的显示偏好。只记档位，不关心像素。
 * 和世界书、模型设置一起写在 data/library.json，关掉再打开还在。
 */

import { clone } from "./util.js";

const SPRITE_SCALES = new Set(["small", "medium", "large"]);
const DIALOG_SCALES = new Set(["short", "medium", "tall"]);

export const DEFAULT_SETTINGS = {
  spriteScale: "large",
  dialogScale: "short",
};

export function normalizeSettings(raw) {
  return {
    spriteScale: SPRITE_SCALES.has(raw?.spriteScale) ? raw.spriteScale : DEFAULT_SETTINGS.spriteScale,
    dialogScale: DIALOG_SCALES.has(raw?.dialogScale) ? raw.dialogScale : DEFAULT_SETTINGS.dialogScale,
  };
}

export function ensureSettings(library) {
  const settings = normalizeSettings(library?.settings);
  const current = library?.settings;
  if (current && current.spriteScale === settings.spriteScale && current.dialogScale === settings.dialogScale) {
    return library;
  }
  return { ...library, settings };
}

export function updateSettings(library, fields) {
  const next = clone(library);
  const settings = normalizeSettings(next.settings);
  if (fields.spriteScale != null && fields.spriteScale !== "") {
    if (!SPRITE_SCALES.has(fields.spriteScale)) throw new Error("立绘大小请选小、中或大。");
    settings.spriteScale = fields.spriteScale;
  }
  if (fields.dialogScale != null && fields.dialogScale !== "") {
    if (!DIALOG_SCALES.has(fields.dialogScale)) throw new Error("对话框高度请选矮、中或高。");
    settings.dialogScale = fields.dialogScale;
  }
  next.settings = settings;
  return next;
}
