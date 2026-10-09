import { clone, requireText, uid } from "./util.js";

const KINDS = new Set(["player", "npc"]);

export function createCharacter(library, kind) {
  if (!KINDS.has(kind)) throw new Error("人设只能是玩家或台上的角色。");
  const next = clone(library);
  const character = {
    id: uid(kind === "player" ? "player" : "npc"),
    kind,
    name: kind === "player" ? "未命名的我" : "未命名角色",
    summary: "",
    personality: "",
    speechStyle: "",
    avatarFile: "",
    fullBodyFile: "",
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
