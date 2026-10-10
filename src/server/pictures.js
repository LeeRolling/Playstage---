/**
 * 图片路径和磁盘上的文件对不上时，在这里找同名的那一张。
 * 功能层只记路径。这里不删用户自己的图。
 */

import fs from "node:fs";
import path from "node:path";

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
