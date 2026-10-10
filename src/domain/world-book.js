import { clone, nowIso, requireText, uid } from "./util.js";

export function getWorldBook(library) {
  return library.worldBook;
}

export function updateWorldBook(library, fields) {
  const next = clone(library);
  const book = next.worldBook;
  if (fields.name != null) book.name = requireText(fields.name, "世界书要有名字。");
  if (fields.summary != null) book.summary = String(fields.summary).trim();
  book.updatedAt = nowIso();
  return next;
}

export function addEntry(library, fields) {
  const next = clone(library);
  next.worldBook.entries.push({
    id: uid("entry"),
    title: requireText(fields.title, "条目要有标题。"),
    body: requireText(fields.body, "条目要有正文。"),
    keywords: String(fields.keywords ?? "")
      .split(/[,，]/)
      .map((item) => item.trim())
      .filter(Boolean),
    enabled: true,
  });
  return next;
}

export function addPatch(library, fields) {
  const next = clone(library);
  next.worldBook.patches.push({
    id: uid("patch"),
    title: requireText(fields.title, "补丁要有标题。"),
    body: requireText(fields.body, "补丁要写补充了什么。"),
    enabled: true,
    createdAt: nowIso(),
  });
  return next;
}

export function togglePatch(library, patchId) {
  const next = clone(library);
  const patch = next.worldBook.patches.find((item) => item.id === patchId);
  if (!patch) throw new Error("找不到这张副本补丁。");
  patch.enabled = !patch.enabled;
  return next;
}

export function addLocation(library, fields) {
  const next = clone(library);
  next.worldBook.locations.push({
    id: uid("loc"),
    name: requireText(fields.name, "地点要有名字。"),
    imageFile: "",
  });
  return next;
}

export function setLocationImage(library, locationId, imageFile) {
  const next = clone(library);
  const location = next.worldBook.locations.find((item) => item.id === locationId);
  if (!location) throw new Error("找不到这个地点。");
  location.imageFile = String(imageFile ?? "").trim();
  return next;
}
