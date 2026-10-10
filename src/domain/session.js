import { applyStoryCues, bookForSession } from "./scene.js";
import { assertCastBelongs } from "./stages.js";
import { clone, nowIso, requireText, uid } from "./util.js";

export const SPEAK_MODES = {
  turn: "严格轮流",
  interrupt: "抢话",
  direct: "点谁谁回",
};

export function sessionForm(session) {
  if (session.npcIds.length === 0) return "empty";
  return session.npcIds.length > 1 ? "group" : "duo";
}

export function aliveNpcs(library, session) {
  return session.npcIds
    .map((id) => library.characters.find((item) => item.id === id && item.kind === "npc"))
    .filter((npc) => npc && session.state?.alive?.[npc.id] !== false);
}

export function sessionFormLabel(session) {
  if (session.npcIds.length === 0) return "还没开场";
  return sessionForm(session) === "group" ? "群聊" : "一对一";
}

export function getSession(library) {
  const session = library.sessions[0];
  if (!session) throw new Error("还没有会话。");
  if (session.worldBookId) {
    const book = library.worldBooks?.find((item) => item.id === session.worldBookId);
    if (!book) throw new Error("这场戏挂着的世界书找不到了。");
  }
  return session;
}

export function setSpeakMode(library, mode) {
  if (!SPEAK_MODES[mode]) throw new Error("发言方式只能是轮流、抢话或点谁谁回。");
  const next = clone(library);
  getSession(next).speakMode = mode;
  return next;
}

export function setPlayer(library, playerCardId) {
  const next = clone(library);
  const player = next.characters.find((item) => item.id === playerCardId && item.kind === "player");
  if (!player) throw new Error("请选一张玩家人设。");
  getSession(next).playerCardId = player.id;
  return next;
}

export function setNpcIds(library, npcIds) {
  const next = clone(library);
  const unique = [];
  for (const id of npcIds ?? []) {
    if (!unique.includes(id)) unique.push(id);
  }
  assertCastBelongs(next, unique);
  const session = getSession(next);
  session.npcIds = unique;
  session.turnCursor = 0;
  return next;
}

export function setLocation(library, locationId) {
  const next = clone(library);
  const session = getSession(next);
  const book = bookForSession(next, session);
  if (!book) throw new Error("先选一个舞台。");
  const location = book.locations.find((item) => item.id === locationId);
  if (!location) throw new Error("这本世界书里没有这个地点。");
  session.state.locationId = location.id;
  session.state.activeTriggerId = "";
  return next;
}

export function setTimeOfDay(library, timeOfDay) {
  if (timeOfDay !== "day" && timeOfDay !== "night") throw new Error("只能切换白天或夜晚。");
  const next = clone(library);
  const session = getSession(next);
  if (!session.worldBookId) throw new Error("先选一个舞台。");
  session.state.timeOfDay = timeOfDay;
  return next;
}

export function sendPlayerLine(library, text) {
  const next = clone(library);
  const session = getSession(next);
  if (!session.worldBookId) throw new Error("先选一个舞台，再开口。");
  const line = requireText(text, "先写一句，再送上台。");
  const player = next.characters.find((item) => item.id === session.playerCardId);
  session.messages.push(message(player?.id || "player", player?.name || "我", "player", line));

  const book = bookForSession(next, session);
  const cues = applyStoryCues(book, session, line);
  if (cues.locationChanged) {
    session.messages.push(message("system", "戏台", "system", `场景跟着这句话到了「${cues.locationName}」。`));
  }
  if (cues.triggerName) {
    session.messages.push(
      message(
        "system",
        "戏台",
        "system",
        cues.triggerStub
          ? `特殊情景「${cues.triggerName}」被提到了。这张图还没放进来，先沿用当前地点的背景。`
          : `特殊情景「${cues.triggerName}」换上了自己的图。`,
      ),
    );
  }

  const npcs = aliveNpcs(next, session);
  if (npcs.length === 0) {
    session.messages.push(message("system", "戏台", "system", "台上还没有别的角色。到「这场」里请至少一位上来。"));
    return next;
  }
  if (session.speakMode === "direct" && !npcs.some((npc) => line.includes(npc.name))) {
    session.messages.push(
      message("system", "戏台", "system", "点谁谁回：请在这句话里写上角色的名字，对方才会接话。没被点到的人先不说话。"),
    );
  }
  return next;
}

export function commitNpcReply(library, speakerId, text) {
  const next = clone(library);
  const session = getSession(next);
  const npc = next.characters.find((item) => item.id === speakerId && item.kind === "npc");
  if (!npc) throw new Error("台上没有这个角色。");
  const line = cleanSpokenLine(requireText(text, "模型没有说出内容。"), npc.name);
  if (!line) throw new Error("模型没有说出内容。");
  session.messages.push(message(npc.id, npc.name, "npc", line));
  if (session.speakMode === "turn") {
    const alive = aliveNpcs(next, session);
    const index = alive.findIndex((item) => item.id === npc.id);
    session.turnCursor = alive.length ? (Math.max(index, 0) + 1) % alive.length : 0;
  }
  return next;
}

export function finishCoolDown(library) {
  const next = clone(library);
  const session = getSession(next);
  const alive = aliveNpcs(next, session);
  const cursor = session.turnCursor || 0;
  session.turnCursor = alive.length ? (cursor + 1) % alive.length : 0;
  session.messages.push(
    message("system", "戏台", "system", "冷静回合：这一轮先收到这里，避免角色互相接着刷屏。你再开口，才会继续。"),
  );
  return next;
}

export function appendSystemLine(library, text) {
  const next = clone(library);
  const session = getSession(next);
  session.messages.push(message("system", "戏台", "system", requireText(text, "没有可显示的提示。")));
  return next;
}

function cleanSpokenLine(text, name) {
  let value = String(text || "").trim();
  value = value.replace(/^```[\w]*\n?/, "").replace(/```$/, "").trim();
  const paragraph = value.split(/\n{2,}/).map((item) => item.trim()).find(Boolean) || value;
  value = paragraph.replace(new RegExp(`^${escapeReg(name)}\\s*[：:]\\s*`), "");
  value = value.replace(/^[「"]/, "").replace(/[」"]$/, "").trim();
  if (value.length > 600) value = `${value.slice(0, 600)}…`;
  return value;
}

function escapeReg(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function message(speakerId, speakerName, kind, text) {
  return {
    id: uid("msg"),
    speakerId,
    speakerName,
    kind,
    text,
    at: nowIso(),
  };
}
