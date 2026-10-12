/**
 * 图片路径和磁盘上的文件对不上时，在这里找同名的那一张。
 * 功能层只记路径。这里不删用户自己的图。
 */

import fs from "node:fs";
import path from "node:path";
import { ACTION_SLOT_COUNT, characterFolderLayout, EXPRESSION_SLOT_COUNT, slotFileName } from "../domain/characters.js";

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".gif"];

export function retargetLibraryPictures(library, root) {
  if (!library || typeof library !== "object") return { library, changed: false };
  const next = structuredClone(library);
  let changed = false;
  const rewrite = (value) => {
    const found = resolveStoredPicture(root, value);
    if (!found || found === value) return value;
    changed = true;
    return found;
  };
  for (const person of next.characters || []) {
    if (person.avatarFile) person.avatarFile = rewrite(person.avatarFile);
    if (person.fullBodyFile) person.fullBodyFile = rewrite(person.fullBodyFile);
    if (person.thinkingFile) person.thinkingFile = rewrite(person.thinkingFile);
    if (Array.isArray(person.expressionFiles)) person.expressionFiles = rewriteList(person.expressionFiles, rewrite);
    if (Array.isArray(person.actionFiles)) person.actionFiles = rewriteList(person.actionFiles, rewrite);
  }
  for (const book of next.worldBooks || []) {
    for (const place of book.locations || []) {
      if (place.imageFile) place.imageFile = rewrite(place.imageFile);
      if (place.nightImageFile) place.nightImageFile = rewrite(place.nightImageFile);
      for (const trigger of place.triggers || []) {
        if (trigger.imageFile) trigger.imageFile = rewrite(trigger.imageFile);
      }
    }
  }
  return changed ? { library: next, changed: true } : { library, changed: false };
}

/**
 * 记下的路径还在，就用它。不在时，先看同一个文件夹里换了后缀的同名图，
 * 再在 assets 里找唯一一张同名图（文件夹名写错时）。找不到就保持原路径。
 */
export function resolveStoredPicture(root, stored) {
  const rel = normalizeRel(stored);
  if (!rel) return "";
  if (!rel.startsWith("assets/") && !rel.startsWith("data/media/")) return "";
  const abs = safeResolve(root, rel);
  if (!abs) return "";
  if (isFile(abs)) return rel;
  if (!isImageName(rel)) return "";
  const sibling = findSiblingImage(abs);
  if (sibling) return relativePosix(root, sibling);
  if (rel.startsWith("assets/")) {
    const unique = findUniqueByStem(path.join(root, "assets"), path.basename(rel));
    if (unique && safeResolve(root, relativePosix(root, unique)) === unique) return relativePosix(root, unique);
  }
  return "";
}

/**
 * 立绘路径已经迁到「角色名/立绘/」但图还在旁边的单张文件上时，抄一份进新文件夹。
 * 原来的图留下，不删。
 */
export function settleCharacterPortraits(library, root) {
  for (const person of library?.characters || []) {
    const stored = String(person?.fullBodyFile || "").replace(/\\/g, "/").trim();
    const legacy = legacySinglePortrait(stored);
    if (!legacy) continue;
    const nextAbs = safeResolve(root, stored);
    const oldAbs = safeResolve(root, legacy);
    if (!nextAbs || !oldAbs || !isFile(oldAbs) || isFile(nextAbs)) continue;
    fs.mkdirSync(path.dirname(nextAbs), { recursive: true });
    fs.copyFileSync(oldAbs, nextAbs);
  }
}

/**
 * 表情、动作某一格还是空的，就看角色文件夹里有没有 01、02 这种编号的图。
 * 只认这一格自己的文件夹，不去别的目录乱配。
 */
export function adoptCharacterFolderSlots(library, root) {
  if (!library || typeof library !== "object") return { library, changed: false };
  const next = structuredClone(library);
  let changed = false;
  for (const person of next.characters || []) {
    const layout = characterFolderLayout(person);
    if (fillEmptySlots(person, "expressionFiles", EXPRESSION_SLOT_COUNT, layout.expressionDir, root)) changed = true;
    if (fillEmptySlots(person, "actionFiles", ACTION_SLOT_COUNT, layout.actionDir, root)) changed = true;
  }
  return changed ? { library: next, changed: true } : { library, changed: false };
}

function rewriteList(files, rewrite) {
  if (!Array.isArray(files)) return files;
  return files.map((file) => (file ? rewrite(file) : file));
}

function legacySinglePortrait(stored) {
  const match = /^(.*)\/([^/]+)\/立绘\/([^/]+\.(png|jpe?g|webp|gif))$/i.exec(stored);
  if (!match) return "";
  const parent = match[1];
  const folder = match[2];
  const file = match[3];
  const stem = file.replace(/\.[^.]+$/, "");
  if (folder.normalize("NFC") !== stem.normalize("NFC")) return "";
  return `${parent}/${file}`;
}

function fillEmptySlots(person, key, count, dir, root) {
  if (!dir) return false;
  const files = Array.isArray(person[key]) ? person[key].slice() : [];
  while (files.length < count) files.push("");
  let touched = false;
  for (let index = 0; index < count; index += 1) {
    if (files[index]) continue;
    const found = findNamedImage(root, dir, slotFileName(index));
    if (!found) continue;
    files[index] = found;
    touched = true;
  }
  if (!touched) return false;
  person[key] = files.slice(0, count);
  return true;
}

function findNamedImage(root, dir, stem) {
  for (const ext of IMAGE_EXTS) {
    const rel = `${dir}/${stem}${ext}`;
    const abs = safeResolve(root, rel);
    if (abs && isFile(abs)) return rel;
  }
  return "";
}

function normalizeRel(stored) {
  const rel = String(stored || "").replace(/\\/g, "/").trim();
  if (!rel || rel.includes("..")) return "";
  return rel;
}

function safeResolve(root, rel) {
  const base = path.resolve(root);
  const abs = path.resolve(base, rel);
  if (abs !== base && !abs.startsWith(`${base}${path.sep}`)) return "";
  return abs;
}

function isFile(file) {
  try {
    return fs.existsSync(file) && fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function isImageName(name) {
  return IMAGE_EXTS.includes(path.extname(name).toLowerCase());
}

function findSiblingImage(abs) {
  const dir = path.dirname(abs);
  if (!fs.existsSync(dir)) return "";
  const stem = path.basename(abs, path.extname(abs)).normalize("NFC");
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return "";
  }
  const hits = names.filter((name) => isImageName(name) && path.basename(name, path.extname(name)).normalize("NFC") === stem);
  return pickPreferred(dir, hits);
}

function findUniqueByStem(dir, basename) {
  if (!fs.existsSync(dir)) return "";
  const stem = path.basename(basename, path.extname(basename)).normalize("NFC");
  const hits = [];
  walk(dir, (file) => {
    const name = path.basename(file);
    if (!isImageName(name)) return;
    if (path.basename(name, path.extname(name)).normalize("NFC") === stem) hits.push(file);
  });
  const stems = new Set(hits.map((file) => path.basename(path.dirname(file))));
  if (hits.length === 1) return hits[0];
  if (hits.length > 1 && stems.size === 1) return pickPreferred(path.dirname(hits[0]), hits.map((file) => path.basename(file)));
  return "";
}

function pickPreferred(dir, names) {
  if (!names.length) return "";
  for (const ext of IMAGE_EXTS) {
    const hit = names.find((name) => path.extname(name).toLowerCase() === ext);
    if (hit) return path.join(dir, hit);
  }
  return path.join(dir, names[0]);
}

function walk(dir, visit) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, visit);
    else if (entry.isFile()) visit(full);
  }
}

function relativePosix(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}
