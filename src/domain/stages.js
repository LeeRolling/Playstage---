import { bookForSession } from "./scene.js";
import { clone, nowIso, uid } from "./util.js";

export function beginNewRun(library) {
  const next = clone(library);
  const session = next.sessions[0];
  if (!session) throw new Error("还没有会话。");
  const playerOk = next.characters.some((item) => item.id === session.playerCardId && item.kind === "player");
  if (!playerOk) {
    const fallback = next.characters.find((item) => item.kind === "player");
    if (fallback) session.playerCardId = fallback.id;
  }
  session.name = "还没开场";
  session.worldBookId = "";
  session.npcIds = [];
  session.speakMode = "turn";
  session.turnCursor = 0;
  session.messages = [
    {
      id: uid("msg"),
      speakerId: "system",
      speakerName: "戏台",
      kind: "system",
      text: "三个舞台不会挤在一场里。先选霜印王国、青玄界或霓穹市，再请那一岸的三位上台。",
      at: nowIso(),
    },
  ];
  session.state = {
    locationId: "",
    timeOfDay: "day",
    activeTriggerId: "",
    alive: { [session.playerCardId]: true },
  };
  next.stagePicked = false;
  next.activeStageId = "";
  return next;
}

export function selectStage(library, stageId) {
  const stage = library.stages?.find((item) => item.id === stageId);
  if (!stage) throw new Error("没有这个舞台。请在霜印王国、青玄界、霓穹市里选一个。");
  const next = clone(library);
  const chosen = next.stages.find((item) => item.id === stage.id);
  const book = next.worldBooks.find((item) => item.id === chosen.worldBookId);
  if (!book) throw new Error("这个舞台的世界书找不到了。");
  const session = next.sessions[0];
  if (!session) throw new Error("还没有会话。");
  const opening = book.locations.find((item) => item.id === chosen.openingLocationId) || book.locations[0];
  if (!opening) throw new Error("这本世界书还没有地点。");

  const names = chosen.characterIds
    .map((id) => next.characters.find((item) => item.id === id)?.name)
    .filter(Boolean);

  session.worldBookId = book.id;
  session.npcIds = chosen.characterIds.filter((id) => next.characters.some((item) => item.id === id));
  session.name = chosen.name;
  session.turnCursor = 0;
  session.state.locationId = opening.id;
  session.state.timeOfDay = session.state.timeOfDay === "night" ? "night" : "day";
  session.state.activeTriggerId = "";
  session.state.alive = session.state.alive || {};
  session.state.alive[session.playerCardId] = session.state.alive[session.playerCardId] !== false;
  for (const id of chosen.characterIds) session.state.alive[id] = true;

  next.stagePicked = true;
  next.activeStageId = chosen.id;
  session.messages.push({
    id: uid("msg"),
    speakerId: "system",
    speakerName: "戏台",
    kind: "system",
    text: `舞台换成「${chosen.name}」。在场的是${names.join("、")}。地点先落在「${opening.name}」。这一场只挂这本世界书。`,
    at: nowIso(),
  });
  return next;
}

export function assertCastBelongs(library, npcIds) {
  const stageId = library.activeStageId;
  if (!stageId) throw new Error("先选一个舞台。");
  for (const id of npcIds) {
    const person = library.characters.find((item) => item.id === id && item.kind === "npc");
    if (!person) throw new Error("会话里出现了不存在的角色。");
    if (person.stageId && person.stageId !== stageId) {
      throw new Error("这一场只请当前舞台的人。另外两位世界的角色先留在她们自己的台上。");
    }
  }
}

export function currentBook(library) {
  return bookForSession(library);
}
