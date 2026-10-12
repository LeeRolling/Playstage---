/**
 * 图片路径和磁盘上的文件对不上时，在这里找同名的那一张。
 * 功能层只记路径。这里不删用户自己的图。
 * 新裁的表情、动作写进 assets/characters/角色名/表情|动作/，文件名用固定编号。
 * 全身图和思考图仍可以是原来的单文件。立绘目录这一版不强制搬迁。
 */

import fs from "node:fs";
import path from "node:path";
import { ACTION_SLOTS, EXPRESSION_SLOTS } from "../domain/characters.js";

const ART_DIR = {
  expression: "表情",
  action: "动作",
};

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
    rewriteArtMap(person.expressions, rewrite);
    rewriteArtMap(person.actions, rewrite);
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
 * 只接受表情、动作的固定编号。角色名里的斜杠会拿掉，避免写到文件夹外面。
 * 名字清完是空的，就改用角色 id。
 */
export function characterArtRelativePath({ name, id, kind, slotId, ext }) {
  const folder = ART_DIR[kind];
  const slots = kind === "expression" ? EXPRESSION_SLOTS : kind === "action" ? ACTION_SLOTS : [];
  if (!folder || !slots.some((slot) => slot.id === slotId)) return "";
  const safeExt = ext === "png" || ext === "jpg" || ext === "webp" ? ext : "";
  if (!safeExt) return "";
  const dir = safeCharacterFolder(name) || safeCharacterFolder(id);
  if (!dir) return "";
  return `assets/characters/${dir}/${folder}/${slotId}.${safeExt}`;
}

/**
 * 表情和动作落在角色文件夹里。其它图仍写进 data/media，文件名随机，不覆盖旧图。
 */
export function saveUploadedPicture(root, body, library) {
  const parsed = parseImageDataUrl(body?.dataUrl);
  const kind = body?.kind === "expression" || body?.kind === "action" ? body.kind : "";
  if (!kind) {
    const mediaDir = path.join(root, "data/media");
    fs.mkdirSync(mediaDir, { recursive: true });
    const filename = `img-${Date.now()}-${Math.random().toString(16).slice(2, 8)}.${parsed.ext}`;
    fs.writeFileSync(path.join(mediaDir, filename), parsed.buffer);
    return { path: `data/media/${filename}`, url: `/media/${filename}` };
  }
  const person = (library?.characters || []).find((item) => item.id === body.characterId);
  if (!person) throw new Error("找不到这张人设卡。");
  const rel = characterArtRelativePath({
    name: person.name,
    id: person.id,
    kind,
    slotId: body.slotId,
    ext: parsed.ext,
  });
  const abs = rel ? safeResolve(root, rel) : "";
  if (!abs) throw new Error("这张图没有对上表情或动作。");
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, parsed.buffer);
  return { path: rel, url: `/${rel.split("/").map((part) => encodeURIComponent(part)).join("/")}` };
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

function rewriteArtMap(map, rewrite) {
  if (!map || typeof map !== "object" || Array.isArray(map)) return;
  for (const id of Object.keys(map)) {
    if (typeof map[id] !== "string" || !map[id]) continue;
    map[id] = rewrite(map[id]);
  }
}

function parseImageDataUrl(dataUrl) {
  const match = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ""));
  if (!match) throw new Error("请上传一张图片。裁剪后再保存。");
  const ext = match[1] === "png" ? "png" : match[1] === "webp" ? "webp" : "jpg";
  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (!buffer.length || buffer.length > 6_000_000) throw new Error("这张图太大或是空的。");
  return { ext, buffer };
}

function safeCharacterFolder(value) {
  const text = String(value || "")
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
    .replace(/^\.+/, "")
    .replace(/[. ]+$/g, "")
    .trim();
  if (!text || text === "." || text === "..") return "";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(text)) return "";
  return text.slice(0, 40);
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
