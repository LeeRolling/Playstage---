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

/** 表情十格、动作十一格。空字符串表示这一格还没有图。 */
export const EXPRESSION_SLOT_COUNT = 10;
export const ACTION_SLOT_COUNT = 11;

const PORTRAIT_EXT = /\.(png|jpe?g|webp|gif)$/i;
const SLOT_DIRS = new Set(["立绘", "表情", "动作"]);

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
    thinkingFile: "",
    stagePose: freshStagePose(),
    ...freshCharacterVisuals(),
  };
  next.characters.push(character);
  return { library: next, character };
}

export function updateCharacter(library, id, fields) {
  const next = clone(library);
  const character = next.characters.find((item) => item.id === id);
  if (!character) throw new Error("找不到这张人设卡。");
  if (fields.name != null) character.name = requireText(fields.name, "人设要有名字。");
  for (const key of ["summary", "personality", "speechStyle", "avatarFile", "thinkingFile"]) {
    if (fields[key] != null) character[key] = String(fields[key]).trim();
  }
  if (fields.fullBodyFile != null) {
    character.fullBodyFile = migratePortraitFile(fields.fullBodyFile, character.name);
  }
  if (fields.expressionFiles != null) character.expressionFiles = normalizeExpressionFiles(fields.expressionFiles);
  if (fields.actionFiles != null) character.actionFiles = normalizeActionFiles(fields.actionFiles);
  if (fields.activeExpression != null) {
    character.activeExpression = normalizeSlotIndex(fields.activeExpression, EXPRESSION_SLOT_COUNT);
    if (character.activeExpression >= 0) character.activeAction = -1;
  }
  if (fields.activeAction != null) {
    character.activeAction = normalizeSlotIndex(fields.activeAction, ACTION_SLOT_COUNT);
    if (character.activeAction >= 0) character.activeExpression = -1;
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

function normalizeThinkingFile(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

/**
 * 每位角色一个同名文件夹，里面是立绘、表情、动作。
 * 单张图（例如 暖璃.png）迁到 暖璃/立绘/暖璃.png。
 * 已经在立绘、表情、动作里的路径不动。自动裁出来的 img- 文件也不改名。
 */
export function migratePortraitFile(stored, characterName = "") {
  const rel = typeof stored === "string" ? stored.replace(/\\/g, "/").trim() : "";
  if (!rel || rel.includes("..") || !PORTRAIT_EXT.test(rel)) return rel;
  const parts = rel.split("/");
  const file = parts[parts.length - 1];
  const parent = parts.length >= 2 ? parts[parts.length - 2] : "";
  if (SLOT_DIRS.has(parent)) return rel;
  const stem = file.replace(/\.[^.]+$/, "");
  if (!stem || stem.startsWith("img-")) return rel;
  const name = String(characterName || "").trim().normalize("NFC");
  const named = Boolean(name) && stem.normalize("NFC") === name;
  if (!named && !rel.includes("/characters/")) return rel;
  const dir = parts.slice(0, -1).join("/");
  return `${dir}/${stem}/立绘/${file}`;
}

export function safeFolderName(name) {
  const text = String(name || "")
    .trim()
    .normalize("NFC")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "")
    .replace(/^\.+/, "");
  return text || "未命名角色";
}

export function slotFileName(index) {
  return String(Number(index) + 1).padStart(2, "0");
}

export function emptyExpressionFiles() {
  return Array.from({ length: EXPRESSION_SLOT_COUNT }, () => "");
}

export function emptyActionFiles() {
  return Array.from({ length: ACTION_SLOT_COUNT }, () => "");
}

export function freshCharacterVisuals() {
  return {
    expressionFiles: emptyExpressionFiles(),
    actionFiles: emptyActionFiles(),
    activeExpression: -1,
    activeAction: -1,
  };
}

/**
 * 角色图放在哪。立绘路径已经是文件夹时，以那个文件夹为准。
 * 还没有立绘文件夹时，用 data/media/角色名。
 */
export function characterFolderLayout(character) {
  const name = String(character?.name || "").trim();
  const portrait = migratePortraitFile(character?.fullBodyFile, name);
  const marker = "/立绘/";
  const at = portrait.indexOf(marker);
  const root = at > 0 ? portrait.slice(0, at) : name ? `data/media/${safeFolderName(name)}` : "";
  return {
    root,
    portraitDir: root ? `${root}/立绘` : "",
    expressionDir: root ? `${root}/表情` : "",
    actionDir: root ? `${root}/动作` : "",
    portraitFile: at > 0 ? portrait : fileOf(character?.fullBodyFile),
  };
}

export function ensureCharacterVisuals(library) {
  if (!Array.isArray(library?.characters) || library.characters.length === 0) return library;
  let changed = false;
  const characters = library.characters.map((character) => {
    if (!character || typeof character !== "object") return character;
    const next = applyCharacterVisuals(character);
    if (characterVisualsEqual(character, next)) return character;
    changed = true;
    return next;
  });
  if (!changed) return library;
  return { ...library, characters };
}

export function normalizeExpressionFiles(raw) {
  return normalizeFileList(raw, EXPRESSION_SLOT_COUNT);
}

export function normalizeActionFiles(raw) {
  return normalizeFileList(raw, ACTION_SLOT_COUNT);
}

export function normalizeSlotIndex(value, count) {
  if (value == null || value === "") return -1;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number < 0 || number >= count) return -1;
  return number;
}

function applyCharacterVisuals(character) {
  const fullBodyFile = migratePortraitFile(character.fullBodyFile, character.name);
  const expressionFiles = normalizeExpressionFiles(character.expressionFiles);
  const actionFiles = normalizeActionFiles(character.actionFiles);
  let activeExpression = normalizeSlotIndex(character.activeExpression, EXPRESSION_SLOT_COUNT);
  let activeAction = normalizeSlotIndex(character.activeAction, ACTION_SLOT_COUNT);
  if (activeExpression >= 0 && activeAction >= 0) activeExpression = -1;
  return { ...character, fullBodyFile, expressionFiles, actionFiles, activeExpression, activeAction };
}

function characterVisualsEqual(character, next) {
  if (fileOf(character.fullBodyFile) !== next.fullBodyFile) return false;
  if (Object.prototype.hasOwnProperty.call(character, "fullBodyFile") && character.fullBodyFile !== next.fullBodyFile) {
    return false;
  }
  if (!sameFileList(character.expressionFiles, next.expressionFiles)) return false;
  if (!sameFileList(character.actionFiles, next.actionFiles)) return false;
  if (!Object.prototype.hasOwnProperty.call(character, "activeExpression") || character.activeExpression !== next.activeExpression) {
    return false;
  }
  if (!Object.prototype.hasOwnProperty.call(character, "activeAction") || character.activeAction !== next.activeAction) {
    return false;
  }
  return true;
}

function normalizeFileList(raw, count) {
  const source = Array.isArray(raw) ? raw : [];
  const files = [];
  for (let index = 0; index < count; index += 1) {
    files.push(fileOf(source[index]));
  }
  return files;
}

function sameFileList(raw, next) {
  if (!Array.isArray(raw) || raw.length !== next.length) return false;
  for (let index = 0; index < next.length; index += 1) {
    if (raw[index] !== next[index]) return false;
  }
  return true;
}

function fileOf(value) {
  return typeof value === "string" ? value.trim() : "";
}

function storedPoseEquals(raw, pose) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const keys = Object.keys(raw);
  if (keys.length !== 3 || !keys.includes("x") || !keys.includes("y") || !keys.includes("scale")) return false;
  return raw.x === pose.x && raw.y === pose.y && raw.scale === pose.scale;
}
