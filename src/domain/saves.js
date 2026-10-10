import { clone, nowIso, requireText, uid } from "./util.js";
import { getSession } from "./session.js";

export function createSave(library, name) {
  const next = clone(library);
  const session = getSession(next);
  const label = requireText(name, "给这个档起个名字。");
  next.saves.unshift({
    id: uid("save"),
    name: label,
    at: nowIso(),
    snapshot: clone(session),
  });
  return next;
}

export function loadSave(library, saveId) {
  const next = clone(library);
  const save = next.saves.find((item) => item.id === saveId);
  if (!save) throw new Error("找不到这个档。");
  const index = next.sessions.findIndex((item) => item.id === save.snapshot.id);
  if (index === -1) next.sessions = [clone(save.snapshot)];
  else next.sessions[index] = clone(save.snapshot);
  return next;
}

export function removeSave(library, saveId) {
  const next = clone(library);
  const before = next.saves.length;
  next.saves = next.saves.filter((item) => item.id !== saveId);
  if (next.saves.length === before) throw new Error("找不到这个档。");
  return next;
}
