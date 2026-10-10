import { clone, nowIso, requireText, uid } from "./util.js";

export const SPEAK_MODES = {
  turn: "严格轮流",
  interrupt: "抢话",
  direct: "点谁谁回",
};

export function sessionForm(session) {
  return session.npcIds.length > 1 ? "group" : "duo";
}

export function sessionFormLabel(session) {
  return sessionForm(session) === "group" ? "群聊" : "一对一";
}

export function getSession(library) {
  const session = library.sessions[0];
  if (!session) throw new Error("还没有会话。");
  if (session.worldBookId !== library.worldBook.id) {
    throw new Error("一场戏只能挂一本世界书。");
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
  const allowed = new Set(next.characters.filter((item) => item.kind === "npc").map((item) => item.id));
  const unique = [];
  for (const id of npcIds ?? []) {
    if (!allowed.has(id)) throw new Error("会话里出现了不存在的角色。");
    if (!unique.includes(id)) unique.push(id);
  }
  const session = getSession(next);
  session.npcIds = unique;
  session.turnCursor = 0;
  return next;
}

export function setLocation(library, locationId) {
  const next = clone(library);
  const location = next.worldBook.locations.find((item) => item.id === locationId);
  if (!location) throw new Error("世界书里没有这个地点。");
  getSession(next).state.locationId = location.id;
  return next;
}

export function sendPlayerLine(library, text) {
  const next = clone(library);
  const session = getSession(next);
  const line = requireText(text, "先写一句，再送上台。");
  const player = next.characters.find((item) => item.id === session.playerCardId);
  session.messages.push(message(player?.id || "player", player?.name || "我", "player", line));

  const npcs = session.npcIds
    .map((id) => next.characters.find((item) => item.id === id))
    .filter(Boolean);
  const draft = draftMock(session, npcs, line);
  if (draft.reply) session.messages.push(draft.reply);
  if (draft.aside) session.messages.push(draft.aside);
  session.turnCursor = draft.turnCursor;
  return next;
}

function draftMock(session, npcs, line) {
  const snippet = line.length > 28 ? `${line.slice(0, 28)}…` : line;
  if (npcs.length === 0) {
    return {
      reply: null,
      aside: message("system", "戏台", "system", "台上还没有别的角色。到「这场」里请至少一位上来。"),
      turnCursor: session.turnCursor || 0,
    };
  }

  if (session.speakMode === "direct") {
    const named = npcs.find((npc) => line.includes(npc.name));
    if (!named) {
      return {
        reply: null,
        aside: message(
          "system",
          "戏台",
          "system",
          "点谁谁回：请在这句话里写上角色的名字，对方才会接话。没被点到的人先不说话。",
        ),
        turnCursor: session.turnCursor || 0,
      };
    }
    return {
      reply: mockLine(named, `你点到了我。关于「${snippet}」，我先应一声。这仍是占位回复，还没有模型。`),
      aside: null,
      turnCursor: session.turnCursor || 0,
    };
  }

  if (session.speakMode === "interrupt") {
    const speaker = npcs[0];
    return {
      reply: mockLine(speaker, `先接你这句「${snippet}」。话题先收到这里，本轮停下。`),
      aside: message(
        "system",
        "戏台",
        "system",
        "冷静回合（占位）：抢话先停住，避免角色互相刷屏。以后会按对话链条收束，这一版只示范「会停」。",
      ),
      turnCursor: session.turnCursor || 0,
    };
  }

  const cursor = session.turnCursor || 0;
  const speaker = npcs[cursor % npcs.length];
  return {
    reply: mockLine(
      speaker,
      `轮到我说。听见「${snippet}」。下一位再接。这是占位回复，不是模型生成的。`,
    ),
    aside: null,
    turnCursor: (cursor + 1) % npcs.length,
  };
}

function mockLine(npc, text) {
  return message(npc.id, npc.name, "npc", `（占位，尚未连接模型）${text}`);
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
