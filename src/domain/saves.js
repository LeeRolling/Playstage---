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
  const restored = clone(save.snapshot);
  if (index === -1) next.sessions = [restored];
  else next.sessions[index] = restored;
  applyStageFromSession(next, restored);
  return next;
}

function applyStageFromSession(library, session) {
  if (!session?.worldBookId) {
    library.stagePicked = false;
    library.activeStageId = "";
    return;
  }
  const stage = (library.stages || []).find((item) => item.worldBookId === session.worldBookId);
  if (!stage) throw new Error("这个档对应的舞台找不到了。");
  library.stagePicked = true;
  library.activeStageId = stage.id;
}

export function removeSave(library, saveId) {
  const next = clone(library);
  const before = next.saves.length;
  next.saves = next.saves.filter((item) => item.id !== saveId);
  if (next.saves.length === before) throw new Error("找不到这个档。");
  return next;
}
