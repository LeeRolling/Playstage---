/**
 * 一场戏当前该用哪张图。触发图优先；没有触发图时按白天或夜晚。
 */

export function bookForSession(library, session = library.sessions?.[0]) {
  if (!session?.worldBookId) return null;
  return library.worldBooks?.find((item) => item.id === session.worldBookId) || null;
}

export function resolveScene(library) {
  const session = library.sessions?.[0];
  const book = bookForSession(library, session);
  const stage = library.stages?.find((item) => item.id === library.activeStageId) || null;
  const location = book?.locations?.find((item) => item.id === session?.state?.locationId) || null;
  const timeOfDay = session?.state?.timeOfDay === "night" ? "night" : "day";
  const trigger = location?.triggers?.find((item) => item.id && item.id === session?.state?.activeTriggerId) || null;
  let imageFile = "";
  let imageKind = "none";
  if (trigger?.imageFile) {
    imageFile = trigger.imageFile;
    imageKind = "trigger";
  } else if (location) {
    imageFile = timeOfDay === "night" ? location.nightImageFile || location.imageFile || "" : location.imageFile || "";
    imageKind = imageFile ? timeOfDay : "none";
  }
  return {
    stageId: stage?.id || "",
    stageName: stage?.name || "",
    worldName: book?.name || "",
    locationId: location?.id || "",
    locationName: location?.name || (library.stagePicked ? "未定" : "未选舞台"),
    timeOfDay,
    imageFile,
    imageKind,
    backgroundSet: Boolean(imageFile),
    triggerName: trigger?.name || "",
    triggerStub: Boolean(trigger && !trigger.imageFile),
  };
}

export function applyStoryCues(book, session, text) {
  const notes = { locationChanged: false, locationName: "", triggerStub: false, triggerName: "" };
  if (!book || !session?.state) return notes;
  const line = String(text || "");
  const hits = (book.locations || []).filter((item) => item.name && line.includes(item.name));
  hits.sort((a, b) => b.name.length - a.name.length);
  if (hits[0] && hits[0].id !== session.state.locationId) {
    session.state.locationId = hits[0].id;
    session.state.activeTriggerId = "";
    notes.locationChanged = true;
    notes.locationName = hits[0].name;
  }
  const location = book.locations.find((item) => item.id === session.state.locationId);
  const trigger = (location?.triggers || []).find((item) =>
    (item.keywords || []).some((word) => word && line.includes(word)),
  );
  if (trigger) {
    session.state.activeTriggerId = trigger.id;
    notes.triggerName = trigger.name;
    notes.triggerStub = !trigger.imageFile;
  } else if (session.state.activeTriggerId) {
    session.state.activeTriggerId = "";
  }
  return notes;
}
