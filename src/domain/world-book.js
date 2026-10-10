import { clone, nowIso, requireText, uid } from "./util.js";

export function getWorldBook(library, worldBookId) {
  const id = worldBookId || library.sessions?.[0]?.worldBookId;
  if (!id) return null;
  return library.worldBooks.find((item) => item.id === id) || null;
}

export function updateWorldBook(library, fields) {
  const next = clone(library);
  const book = requireBook(next, fields.worldBookId);
  if (fields.name != null) book.name = requireText(fields.name, "世界书要有名字。");
  if (fields.summary != null) book.summary = String(fields.summary).trim();
  book.updatedAt = nowIso();
  return next;
}

export function addEntry(library, fields) {
  const next = clone(library);
  const book = requireBook(next, fields.worldBookId);
  book.entries.push({
    id: uid("entry"),
    title: requireText(fields.title, "条目要有标题。"),
    body: requireText(fields.body, "条目要有正文。"),
    keywords: splitWords(fields.keywords),
    enabled: true,
  });
  book.updatedAt = nowIso();
  return next;
}

export function addPatch(library, fields) {
  const next = clone(library);
  const book = requireBook(next, fields.worldBookId);
  book.patches.push({
    id: uid("patch"),
    title: requireText(fields.title, "补丁要有标题。"),
    body: requireText(fields.body, "补丁要写补充了什么。"),
    enabled: true,
    createdAt: nowIso(),
  });
  book.updatedAt = nowIso();
  return next;
}

export function togglePatch(library, patchId) {
  const next = clone(library);
  const found = findPatch(next, patchId);
  if (!found) throw new Error("找不到这张副本补丁。");
  found.patch.enabled = !found.patch.enabled;
  return next;
}

export function addLocation(library, fields) {
  const next = clone(library);
  const book = requireBook(next, fields.worldBookId);
  const name = requireText(fields.name, "地点要有名字。");
  if (book.locations.some((item) => item.name === name)) {
    throw new Error("这本世界书里已经有同名地点。");
  }
  book.locations.push({
    id: uid("loc"),
    name,
    imageFile: String(fields.imageFile ?? "").trim(),
    nightImageFile: String(fields.nightImageFile ?? "").trim(),
    triggers: [],
  });
  book.updatedAt = nowIso();
  return next;
}

export function setLocationImage(library, locationId, imageFile, slot = "day", triggerId = "") {
  const next = clone(library);
  const found = findLocation(next, locationId);
  if (!found) throw new Error("找不到这个地点。");
  const file = String(imageFile ?? "").trim();
  if (slot === "night") found.location.nightImageFile = file;
  else if (slot === "trigger") {
    const trigger = found.location.triggers.find((item) => item.id === triggerId);
    if (!trigger) throw new Error("找不到这个特殊情景。");
    trigger.imageFile = file;
  } else found.location.imageFile = file;
  found.book.updatedAt = nowIso();
  return next;
}

export function addTrigger(library, fields) {
  const next = clone(library);
  const found = findLocation(next, fields.locationId);
  if (!found) throw new Error("找不到这个地点。");
  found.location.triggers.push({
    id: uid("trig"),
    name: requireText(fields.name, "特殊情景要有名字。"),
    keywords: splitWords(fields.keywords),
    imageFile: String(fields.imageFile ?? "").trim(),
  });
  found.book.updatedAt = nowIso();
  return next;
}

function requireBook(library, worldBookId) {
  const book = getWorldBook(library, worldBookId);
  if (!book) throw new Error("先选定一场戏的世界书。");
  return book;
}

function findLocation(library, locationId) {
  for (const book of library.worldBooks || []) {
    const location = book.locations.find((item) => item.id === locationId);
    if (location) return { book, location };
  }
  return null;
}

function findPatch(library, patchId) {
  for (const book of library.worldBooks || []) {
    const patch = book.patches.find((item) => item.id === patchId);
    if (patch) return { book, patch };
  }
  return null;
}

function splitWords(value) {
  return String(value ?? "")
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
