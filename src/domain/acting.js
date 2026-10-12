/**
 * 把这一场戏收成给模型看的提示。这里不联网。
 * 真正的外呼留在本机服务里。
 *
 * 抢话的冷静：固定最多两位 NPC，并要求最后一位把话题收住。
 * TODO: 还没有按「话题是否已经收束」做语义判断（例如决定吃什么就停）。见产品说明里的对话链条。
 * TODO: 台词触发自定义表情和动作，细则留到以后的世界书，这一版不写触发词。
 */

import { bookForSession, resolveScene } from "./scene.js";
import { aliveNpcs, getSession } from "./session.js";

export const INTERRUPT_LIMIT = 2;

export function planSpeakers(library) {
  const session = getSession(library);
  const line = lastPlayerText(session);
  const npcs = aliveNpcs(library, session);
  if (npcs.length === 0) {
    return { mode: session.speakMode, speakers: [], coolDown: false, notice: "" };
  }
  if (session.speakMode === "direct") {
    const named = npcs.find((npc) => npc.name && line.includes(npc.name));
    if (!named) return { mode: "direct", speakers: [], coolDown: false, notice: "" };
    return { mode: "direct", speakers: [brief(named)], coolDown: false, notice: "" };
  }
  if (session.speakMode === "interrupt") {
    const start = npcs.length ? (session.turnCursor || 0) % npcs.length : 0;
    const count = Math.min(INTERRUPT_LIMIT, npcs.length);
    const speakers = [];
    for (let i = 0; i < count; i += 1) speakers.push(brief(npcs[(start + i) % npcs.length]));
    return { mode: "interrupt", speakers, coolDown: true, notice: "" };
  }
  const speaker = npcs[(session.turnCursor || 0) % npcs.length];
  return { mode: "turn", speakers: [brief(speaker)], coolDown: false, notice: "" };
}

export function buildActingMessages(library, speakerId, context = {}) {
  const session = getSession(library);
  const speaker = library.characters.find((item) => item.id === speakerId);
  if (!speaker) throw new Error("台上没有这个角色。");
  const book = bookForSession(library, session);
  const scene = resolveScene(library);
  const mode = context.mode || session.speakMode || "turn";
  const index = Number(context.index) || 0;
  const total = Number(context.total) || 1;
  const others = aliveNpcs(library, session).filter((npc) => npc.id !== speaker.id);
  const player = library.characters.find((item) => item.id === session.playerCardId);
  const system = [
    `你在剧戏台里扮演「${speaker.name}」。只输出这一句台词。`,
    "用中文，用这个人自己的口气。不要写名字前缀，不要写旁白，不要代替别人说话，不要解释你在扮演。",
    "",
    worldBlock(book, scene, session),
    "",
    characterBlock(speaker),
    "",
    player ? `玩家是「${player.name}」。${clip(player.summary, 160)}` : "玩家在说话。",
    others.length
      ? `在场还有：${others.map((npc) => `${npc.name}（${clip(npc.summary, 60)}）`).join("；")}。他们不是你，不要替他们开口。`
      : "这一轮没有别的角色要你代说。",
    "",
    modeBlock(mode, index, total, speaker.name),
    "",
    "最近的对白：",
    transcript(session),
  ].join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: `请只写「${speaker.name}」接下来要说的一句台词。` },
  ];
}

function brief(npc) {
  return { id: npc.id, name: npc.name };
}

function lastPlayerText(session) {
  const found = [...session.messages].reverse().find((item) => item.kind === "player");
  return found?.text || "";
}

function worldBlock(book, scene, session) {
  if (!book) return "还没有世界书。";
  const lines = [`世界：${book.name}`, clip(book.summary, 400)];
  const where = scene?.locationName ? `当前地点：${scene.locationName}` : "";
  const when = scene?.timeOfDay === "night" ? "夜晚" : "白天";
  if (where) lines.push(`${where}，${when}。`);
  if (scene?.triggerName) lines.push(`特殊情景：${scene.triggerName}。`);
  const blob = `${transcript(session)}\n${book.summary || ""}`;
  const picked = [];
  for (const entry of book.entries || []) {
    if (entry.enabled === false) continue;
    const always = entry.title === "禁忌" || entry.title === "氛围" || entry.title === "冲突";
    const hit = (entry.keywords || []).some((word) => word && blob.includes(word));
    if (always || hit) picked.push(entry);
  }
  for (const entry of picked.slice(0, 6)) {
    lines.push(`【${entry.title}】${clip(entry.body, 500)}`);
  }
  for (const patch of book.patches || []) {
    if (patch.enabled === false) continue;
    lines.push(`【补丁 ${patch.title}】${clip(patch.body, 240)}`);
  }
  return lines.filter(Boolean).join("\n");
}

function characterBlock(speaker) {
  return [
    `你是：${speaker.name}`,
    speaker.summary ? `身份：${clip(speaker.summary, 400)}` : "",
    speaker.personality ? `性格：${clip(speaker.personality, 240)}` : "",
    speaker.speechStyle ? `说法：${clip(speaker.speechStyle, 240)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function modeBlock(mode, index, total, name) {
  if (mode === "direct") return `发言方式：点谁谁回。玩家点到了${name}。只回你自己的一句。`;
  if (mode === "interrupt") {
    const last = index >= total - 1;
    return last
      ? "发言方式：抢话。你是这一轮的最后一句。承接刚才的话题，把话收住，不要再抛新问题，也不要复述别人的原话。说完就停。"
      : "发言方式：抢话。先接玩家刚打开的话题，只说一句。后面还有人接，不要把整件事替他们说完，也不要复述别人的原话。";
  }
  return "发言方式：严格轮流。这一轮轮到你。只说一句，然后停下，等下一位。";
}

function transcript(session) {
  const recent = session.messages.slice(-12);
  if (!recent.length) return "（还没有对白）";
  return recent
    .map((item) => {
      const who = item.kind === "system" ? "戏台" : item.speakerName || "有人";
      return `${who}：${clip(item.text, 280)}`;
    })
    .join("\n");
}

function clip(text, max) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}
