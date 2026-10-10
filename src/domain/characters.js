import { clone, requireText, uid } from "./util.js";

const KINDS = new Set(["player", "npc"]);

/**
 * 每位角色在舞台上的位置和放大。记在人设上，每一场、每一座舞台都用这一套。
 * x：相对视口宽度的百分比，正数往右。
 * y：相对视口高度的百分比，正数往上。
 * scale：全身立绘的放大倍数。1 相当于从前全局「大」；默认略大一点。
 * 缺字段时用默认值。极端值收到范围内，避免把锁住的戏台撑破。
 */
export const DEFAULT_STAGE_POSE = {
  x: 0,
  y: 0,
  scale: 1.15,
};

export const STAGE_POSE_LIMITS = {
  x: { min: -48, max: 48, step: 1 },
  y: { min: -30, max: 30, step: 1 },
  scale: { min: 0.4, max: 2.5, step: 0.05 },
};

export function freshStagePose() {
  return { x: DEFAULT_STAGE_POSE.x, y: DEFAULT_STAGE_POSE.y, scale: DEFAULT_STAGE_POSE.scale };
}

export function normalizeStagePose(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    x: clampPoseNumber(source.x, STAGE_POSE_LIMITS.x, DEFAULT_STAGE_POSE.x),
    y: clampPoseNumber(source.y, STAGE_POSE_LIMITS.y, DEFAULT_STAGE_POSE.y),
    scale: clampPoseNumber(source.scale, STAGE_POSE_LIMITS.scale, DEFAULT_STAGE_POSE.scale),
  };
}

export function ensureCharacterPoses(library) {
  if (!Array.isArray(library?.characters) || library.characters.length === 0) return library;
  let changed = false;
  const characters = library.characters.map((character) => {
    const pose = normalizeStagePose(character?.stagePose);
    if (storedPoseEquals(character?.stagePose, pose)) return character;
    changed = true;
    return { ...character, stagePose: pose };
  });
  if (!changed) return library;
  return { ...library, characters };
}

export function createCharacter(library, kind) {
  if (!KINDS.has(kind)) throw new Error("人设只能是玩家或台上的角色。");
  const next = clone(library);
  const character = {
    id: uid(kind === "player" ? "player" : "npc"),
    kind,
    stageId: kind === "npc" ? library.activeStageId || "" : "",
    name: kind === "player" ? "未命名的我" : "未命名角色",
    summary: "",
    personality: "",
    speechStyle: "",
    avatarFile: "",
    fullBodyFile: "",
    stagePose: freshStagePose(),
  };
  next.characters.push(character);
  return { library: next, character };
}

export function updateCharacter(library, id, fields) {
  const next = clone(library);
  const character = next.characters.find((item) => item.id === id);
  if (!character) throw new Error("找不到这张人设卡。");
  if (fields.name != null) character.name = requireText(fields.name, "人设要有名字。");
  for (const key of ["summary", "personality", "speechStyle", "avatarFile", "fullBodyFile"]) {
    if (fields[key] != null) character[key] = String(fields[key]).trim();
  }
  if (fields.stagePose != null) {
    character.stagePose = normalizeStagePose({
      ...normalizeStagePose(character.stagePose),
      ...fields.stagePose,
    });
  }
  return next;
}

export function removeCharacter(library, id) {
  const next = clone(library);
  const character = next.characters.find((item) => item.id === id);
  if (!character) throw new Error("找不到这张人设卡。");
  const session = currentSession(next);
  if (character.kind === "player" && session.playerCardId === id) {
    const others = next.characters.filter((item) => item.kind === "player" && item.id !== id);
    if (others.length === 0) throw new Error("至少留一张玩家人设。可以先另建一张，再删这张。");
    session.playerCardId = others[0].id;
  }
  session.npcIds = session.npcIds.filter((npcId) => npcId !== id);
  if (session.state?.alive) delete session.state.alive[id];
  next.characters = next.characters.filter((item) => item.id !== id);
  return next;
}

function currentSession(library) {
  const session = library.sessions[0];
  if (!session) throw new Error("还没有会话。");
  return session;
}

function clampPoseNumber(value, limit, fallback) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  const rounded = Math.round(number * 100) / 100;
  return Math.min(limit.max, Math.max(limit.min, rounded));
}

function storedPoseEquals(raw, pose) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const keys = Object.keys(raw);
  if (keys.length !== 3 || !keys.includes("x") || !keys.includes("y") || !keys.includes("scale")) return false;
  return raw.x === pose.x && raw.y === pose.y && raw.scale === pose.scale;
}
