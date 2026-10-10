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
