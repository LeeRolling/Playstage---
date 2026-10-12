import { clone, requireText, uid } from "./util.js";

const KINDS = new Set(["player", "npc"]);

/**
 * 每位角色在舞台上的位置和放大。记在人设上，每一场、每一座舞台都用这一套。
 * x：相对这张立绘自身宽度的百分比，正数往右。
 * y：相对这张立绘自身高度的百分比，正数往上。
 * scale：全身立绘的放大倍数。1 是正常大小，大于 1 人就更大。默认 1.15，比正常略大一点。
 * 缺字段时用默认值。极端值收到范围内，人仍留在锁住的戏台里。
 */
export const DEFAULT_STAGE_POSE = {
  x: 0,
  y: 0,
  scale: 1.15,
};

export const STAGE_POSE_LIMITS = {
  x: { min: -100, max: 100, step: 1 },
  y: { min: -100, max: 100, step: 1 },
  scale: { min: 0.4, max: 2.4, step: 0.05 },
};

/**
 * 台词颜色记在人设上。对话框里这个人说的话用这一色，方便分清是谁。
 * 缺了、或写得不像颜色时，按这个色板补一个还没被占用的浅色。
 * 这些浅色在经典、赛博、北欧的深色对话框上读得清。东方那套浅底由界面再压暗。
 */
export const LINE_COLOR_PALETTE = [
  "#e6c98a",
  "#f0b7a4",
  "#9ec5e8",
  "#c9d6a8",
  "#e7c4d8",
  "#b7e0d2",
  "#d7c4f2",
  "#f3d6a1",
  "#8fd0c8",
  "#e8b4c8",
  "#d2c2a6",
  "#c5b4e3",
];

/**
 * 表情和动作用固定编号当键，不用中文情绪词。
 * 界面上可以写短中文，存下来的路径和文件名仍用这些编号。
 * TODO: 模型台词自动切换表情/动作，以及世界书同义词词典，留到后面的测试版。
 */
export const EXPRESSION_SLOTS = [
  { id: "expr_neutral", label: "中立" },
  { id: "expr_smile", label: "笑" },
  { id: "expr_laugh", label: "大笑" },
  { id: "expr_sad", label: "难过" },
  { id: "expr_angry", label: "生气" },
  { id: "expr_shy", label: "害羞" },
  { id: "expr_surprised", label: "惊讶" },
  { id: "expr_think", label: "思考" },
  { id: "expr_pain", label: "痛" },
  { id: "expr_love", label: "喜欢" },
];

export const ACTION_SLOTS = [
  { id: "pose_stand", label: "站" },
  { id: "pose_sit", label: "坐" },
  { id: "pose_walk", label: "走" },
  { id: "pose_run", label: "跑" },
  { id: "pose_wave", label: "挥手" },
  { id: "pose_point", label: "指" },
  { id: "pose_cross_arms", label: "抱臂" },
  { id: "pose_cover_face", label: "掩面" },
  { id: "pose_kneel", label: "跪" },
  { id: "pose_lie", label: "躺" },
  { id: "pose_fight", label: "打斗" },
];

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

/**
 * 思考立绘是可选的另一张全身图。旧档没有这个字段时补成空字符串，舞台上就继续用全身图。
 */
export function ensureThinkingFiles(library) {
  if (!Array.isArray(library?.characters) || library.characters.length === 0) return library;
  let changed = false;
  const characters = library.characters.map((character) => {
    const file = normalizeThinkingFile(character?.thinkingFile);
    if (character && character.thinkingFile === file) return character;
    changed = true;
    return { ...character, thinkingFile: file };
  });
  if (!changed) return library;
  return { ...library, characters };
}

/**
 * 旧档没有台词颜色时补上。已经写成颜色的留着，只把大小写和三位缩写收成 #rrggbb。
 * 两位角色可以故意用同一色，这里不拆开。
 */
export function ensureLineColors(library) {
  if (!Array.isArray(library?.characters) || library.characters.length === 0) return library;
  const reserved = new Set();
  for (const character of library.characters) {
    const color = normalizeLineColor(character?.lineColor);
    if (color) reserved.add(color);
  }
  let changed = false;
  const characters = library.characters.map((character, index) => {
    const color = normalizeLineColor(character?.lineColor);
    if (color) {
      if (character.lineColor === color) return character;
      changed = true;
      return { ...character, lineColor: color };
    }
    const assigned = unusedPaletteColor(reserved, index);
    reserved.add(assigned);
    changed = true;
    return { ...character, lineColor: assigned };
  });
  if (!changed) return library;
  return { ...library, characters };
}

export function normalizeLineColor(value) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  const full = /^#?([0-9a-fA-F]{6})$/.exec(text);
  if (full) return `#${full[1].toLowerCase()}`;
  const short = /^#?([0-9a-fA-F]{3})$/.exec(text);
  if (!short) return "";
  return `#${short[1]
    .toLowerCase()
    .split("")
    .map((item) => item + item)
    .join("")}`;
}

/**
 * 旧档没有表情、动作两张表时补成空的。编号以外的键丢掉。已写好的路径留着。
 */
export function ensureCharacterArt(library) {
  if (!Array.isArray(library?.characters) || library.characters.length === 0) return library;
  let changed = false;
  const characters = library.characters.map((character) => {
    const expressions = normalizeArtMap(character?.expressions, EXPRESSION_SLOTS);
    const actions = normalizeArtMap(character?.actions, ACTION_SLOTS);
    if (artMapEquals(character?.expressions, expressions, EXPRESSION_SLOTS) && artMapEquals(character?.actions, actions, ACTION_SLOTS)) {
      return character;
    }
    changed = true;
    return { ...character, expressions, actions };
  });
  if (!changed) return library;
  return { ...library, characters };
}

export function emptyPerformanceArt() {
  return {
    expressions: emptyArtMap(EXPRESSION_SLOTS),
    actions: emptyArtMap(ACTION_SLOTS),
  };
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
    lineColor: nextLineColor(next),
    avatarFile: "",
    fullBodyFile: "",
    thinkingFile: "",
    ...emptyPerformanceArt(),
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
  for (const key of ["summary", "personality", "speechStyle", "avatarFile", "fullBodyFile", "thinkingFile"]) {
    if (fields[key] != null) character[key] = String(fields[key]).trim();
  }
  if (fields.lineColor != null) {
    const color = normalizeLineColor(String(fields.lineColor));
    if (!color) throw new Error("台词颜色要写成 # 开头的颜色，例如 #e6c98a。");
    character.lineColor = color;
  }
  if (fields.expressions != null) character.expressions = applyArtUpdate(character.expressions, fields.expressions, EXPRESSION_SLOTS);
  if (fields.actions != null) character.actions = applyArtUpdate(character.actions, fields.actions, ACTION_SLOTS);
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

function normalizeThinkingFile(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function emptyArtMap(slots) {
  const next = {};
  for (const slot of slots) next[slot.id] = "";
  return next;
}

function normalizeArtPath(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeArtMap(raw, slots) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const next = {};
  for (const slot of slots) next[slot.id] = normalizeArtPath(source[slot.id]);
  return next;
}

function applyArtUpdate(current, patch, slots) {
  const next = normalizeArtMap(current, slots);
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return next;
  for (const slot of slots) {
    if (!Object.prototype.hasOwnProperty.call(patch, slot.id)) continue;
    next[slot.id] = normalizeArtPath(patch[slot.id]);
  }
  return next;
}

function artMapEquals(raw, normalized, slots) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const keys = Object.keys(raw);
  if (keys.length !== slots.length) return false;
  for (let index = 0; index < slots.length; index += 1) {
    if (keys[index] !== slots[index].id) return false;
    if (raw[keys[index]] !== normalized[slots[index].id]) return false;
  }
  return true;
}

function nextLineColor(library) {
  const used = new Set((library?.characters || []).map((item) => normalizeLineColor(item?.lineColor)).filter(Boolean));
  return unusedPaletteColor(used, library?.characters?.length || 0);
}

function unusedPaletteColor(used, startIndex) {
  const size = LINE_COLOR_PALETTE.length;
  const start = ((startIndex % size) + size) % size;
  for (let step = 0; step < size; step += 1) {
    const color = LINE_COLOR_PALETTE[(start + step) % size];
    if (!used.has(color)) return color;
  }
  return LINE_COLOR_PALETTE[start];
}

function storedPoseEquals(raw, pose) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const keys = Object.keys(raw);
  if (keys.length !== 3 || !keys.includes("x") || !keys.includes("y") || !keys.includes("scale")) return false;
  return raw.x === pose.x && raw.y === pose.y && raw.scale === pose.scale;
}
