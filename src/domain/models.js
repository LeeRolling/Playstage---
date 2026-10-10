import { clone, nowIso } from "./util.js";

export const LOCAL_CONNECTED_NOTE = "连上了。这一版还不会用它来演戏，只确认路是通的。";

export function publicModel(model) {
  return {
    provider: model.provider === "cloud" ? "cloud" : "local",
    localBaseUrl: model.localBaseUrl || "http://127.0.0.1:11434/v1",
    localModel: model.localModel || "",
    cloudBaseUrl: model.cloudBaseUrl || "",
    cloudModel: model.cloudModel || "",
    cloudApiKeySet: Boolean(model.cloudApiKey),
    localProbe: model.localProbe
      ? { ok: Boolean(model.localProbe.ok), message: model.localProbe.message || "", at: model.localProbe.at || "" }
      : null,
    remindRetest: Boolean(model.remindRetest),
    cloudSlots: (model.cloudSlots || []).map((slot) => ({
      id: slot.id,
      label: slot.label || "",
      baseUrl: slot.baseUrl || "",
      model: slot.model || "",
      characterIds: [...(slot.characterIds || [])],
      apiKeySet: Boolean(slot.apiKey),
    })),
  };
}

export function updateModel(library, fields) {
  const next = clone(library);
  const model = next.model;
  if (fields.provider != null) {
    if (fields.provider !== "local" && fields.provider !== "cloud") {
      throw new Error("模型只能选本机，或你自己的云端接口。");
    }
    model.provider = fields.provider;
  }
  if (fields.localBaseUrl != null) model.localBaseUrl = String(fields.localBaseUrl).trim();
  if (fields.localModel != null) model.localModel = String(fields.localModel).trim();
  if (fields.cloudBaseUrl != null) model.cloudBaseUrl = String(fields.cloudBaseUrl).trim();
  if (fields.cloudModel != null) model.cloudModel = String(fields.cloudModel).trim();
  if (fields.clearCloudApiKey) model.cloudApiKey = "";
  else if (String(fields.cloudApiKey ?? "").trim()) model.cloudApiKey = String(fields.cloudApiKey).trim();
  return next;
}

export function updateCloudSlot(library, fields) {
  const next = clone(library);
  const slot = next.model.cloudSlots?.find((item) => item.id === fields.slotId);
  if (!slot) throw new Error("没有这个云端接口。");
  if (fields.label != null) slot.label = String(fields.label).trim() || slot.label;
  if (fields.baseUrl != null) slot.baseUrl = String(fields.baseUrl).trim();
  if (fields.model != null) slot.model = String(fields.model).trim();
  if (fields.clearApiKey) slot.apiKey = "";
  else if (String(fields.apiKey ?? "").trim()) slot.apiKey = String(fields.apiKey).trim();
  if (fields.characterIds) {
    const allowed = new Set(next.characters.filter((item) => item.kind === "npc").map((item) => item.id));
    const unique = [];
    for (const id of fields.characterIds) {
      if (!allowed.has(id)) throw new Error("要绑定的角色不在人设卡里。");
      if (!unique.includes(id)) unique.push(id);
    }
    if (unique.length > 3) throw new Error("一个云端接口最多绑三位角色。");
    slot.characterIds = unique;
  }
  return next;
}

export function recordProbe(library, { ok, message }) {
  const next = clone(library);
  next.model.localProbe = {
    ok: Boolean(ok),
    message: String(message || ""),
    at: nowIso(),
  };
  next.model.remindRetest = false;
  return next;
}

export function armModelRetest(library) {
  if (!library.model?.localProbe) return library;
  if (library.model.remindRetest) return library;
  const next = clone(library);
  next.model.remindRetest = true;
  return next;
}
