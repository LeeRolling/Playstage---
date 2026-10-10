import { clone, nowIso } from "./util.js";
import { getSession, sessionFormLabel } from "./session.js";

const STUB_NOTE = "这是骨架用的占位文件，还不是社区人设卡或正式剧情包。以后分享才会按互通格式来。";

export function exportBundle(library, kind) {
  const session = getSession(library);
  const priorSummary = `前文提要（占位）：${playerName(library, session)}在「${locationName(library, session)}」开口试演，当前是${sessionFormLabel(session)}。正式导出时这句可以改。`;
  const body = {
    format: "playstage-stub-v0",
    note: STUB_NOTE,
    kind,
    exportedAt: nowIso(),
  };

  if (kind === "world") {
    body.worldBook = clone(library.worldBook);
  } else if (kind === "characters") {
    body.characters = clone(library.characters);
  } else if (kind === "story") {
    body.priorSummary = priorSummary;
    body.session = clone(session);
    body.worldBook = clone(library.worldBook);
    body.characters = clone(library.characters);
  } else {
    throw new Error("只能导出世界书、人设卡或剧情包。");
  }

  const filenames = {
    world: "playstage-world-book.json",
    characters: "playstage-character-cards.json",
    story: "playstage-story-pack.json",
  };

  const next = clone(library);
  next.transferLog.unshift({
    id: `log-${Date.now()}`,
    at: nowIso(),
    direction: "export",
    kind,
    filename: filenames[kind],
    message: kind === "story" ? `已导出剧情包占位文件。${priorSummary}` : `已导出${labelOf(kind)}占位文件。`,
  });

  return {
    library: next,
    download: { filename: filenames[kind], body },
    message: next.transferLog[0].message,
  };
}

export function noteImport(library, fields) {
  const kind = fields.kind;
  if (!["world", "characters", "story"].includes(kind)) {
    throw new Error("请选择要导入的是世界书、人设卡还是剧情包。");
  }
  const filename = String(fields.filename ?? "").trim() || "未命名文件";
  const next = clone(library);
  const message = `已收下「${filename}」。这一版只登记，还不会按社区格式读进剧戏台。`;
  next.transferLog.unshift({
    id: `log-${Date.now()}`,
    at: nowIso(),
    direction: "import",
    kind,
    filename,
    message,
  });
  return { library: next, message };
}

function labelOf(kind) {
  if (kind === "world") return "世界书";
  if (kind === "characters") return "人设卡";
  return "剧情包";
}

function playerName(library, session) {
  return library.characters.find((item) => item.id === session.playerCardId)?.name || "玩家";
}

function locationName(library, session) {
  return library.worldBook.locations.find((item) => item.id === session.state.locationId)?.name || "未知地点";
}
