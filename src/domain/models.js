import { clone, nowIso } from "./util.js";

export const LOCAL_CONNECTED_NOTE = "连上了。上台说话时会用这里选中的本机模型。剧戏台仍不附带模型。";
export const OLLAMA_BASE_URL = "http://127.0.0.1:11434/v1";
export const ZHIPU_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";
export const QWEN_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";

const PROVIDERS = new Set(["local", "cloud", "zhipu", "qwen"]);

export function publicModel(model) {
  const slots = model.cloudSlots || [];
  return {
    provider: PROVIDERS.has(model.provider) ? model.provider : "local",
    localBaseUrl: model.localBaseUrl || OLLAMA_BASE_URL,
    localModel: model.localModel || "",
    localModels: [...(model.localModels || [])],
    cloudBaseUrl: model.cloudBaseUrl || "",
    cloudModel: model.cloudModel || "",
    cloudApiKeySet: Boolean(model.cloudApiKey),
    localProbe: model.localProbe
      ? { ok: Boolean(model.localProbe.ok), message: model.localProbe.message || "", at: model.localProbe.at || "" }
      : null,
    remindRetest: Boolean(model.remindRetest),
    zhipu: publicSlot(findSlot(slots, "zhipu")),
    qwen: publicSlot(findSlot(slots, "qwen")),
    cloudSlots: slots.map((slot) => publicSlot(slot)),
  };
}

export function updateModel(library, fields) {
  const next = clone(library);
  const model = next.model;
  ensureModelSlots(model);
  if (fields.provider != null) {
    if (!PROVIDERS.has(fields.provider)) {
      throw new Error("请选本机、智谱、通义千问，或另一家云端。");
    }
    model.provider = fields.provider;
  }
  if (fields.localBaseUrl != null) model.localBaseUrl = String(fields.localBaseUrl).trim();
  if (fields.localModel != null) model.localModel = String(fields.localModel).trim();
  if (fields.cloudBaseUrl != null) model.cloudBaseUrl = String(fields.cloudBaseUrl).trim();
  if (fields.cloudModel != null) model.cloudModel = String(fields.cloudModel).trim();
  if (fields.clearCloudApiKey) model.cloudApiKey = "";
  else if (String(fields.cloudApiKey ?? "").trim()) model.cloudApiKey = String(fields.cloudApiKey).trim();
  writeNamedSlot(model, "zhipu", fields.zhipuModel, fields.zhipuApiKey, fields.clearZhipuApiKey);
  writeNamedSlot(model, "qwen", fields.qwenModel, fields.qwenApiKey, fields.clearQwenApiKey);
  return next;
}

export function updateCloudSlot(library, fields) {
  const next = clone(library);
  ensureModelSlots(next.model);
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

export function recordProbe(library, { ok, message, models }) {
  const next = clone(library);
  next.model.localProbe = {
    ok: Boolean(ok),
    message: String(message || ""),
    at: nowIso(),
  };
  next.model.remindRetest = false;
  if (Array.isArray(models)) {
    const names = [];
    for (const name of models) {
      const text = String(name || "").trim();
      if (text && !names.includes(text)) names.push(text);
    }
    next.model.localModels = names.slice(0, 80);
  }
  return next;
}

export function armModelRetest(library) {
  if (!library.model?.localProbe) return library;
  if (library.model.remindRetest) return library;
  const next = clone(library);
  next.model.remindRetest = true;
  return next;
}

/**
 * 选出这场戏要用的那一家。钥匙留在返回值里，只给本机服务外呼，不能写进给界面的资料。
 * 按角色分家是预留：这一版全场只用当前选中的那一家。
 */
export function actingTarget(library) {
  const model = library?.model || {};
  const provider = PROVIDERS.has(model.provider) ? model.provider : "local";
  if (provider === "local") {
    const baseUrl = String(model.localBaseUrl || "").trim();
    const name = String(model.localModel || "").trim();
    if (!baseUrl) {
      return {
        ok: false,
        message: "还没有填写本机地址。Ollama 一般是 http://127.0.0.1:11434 或带 /v1 的那个地址。",
      };
    }
    if (!name) {
      return {
        ok: false,
        message: "还没有选择本机模型。请到「模型」页点「读取本机模型」，选中你在 Ollama 里装好的那个，再保存。剧戏台不附带模型。",
      };
    }
    return { ok: true, provider, label: "本机", baseUrl, model: name, apiKey: "" };
  }
  if (provider === "zhipu" || provider === "qwen") {
    const slot = findSlot(model.cloudSlots || [], provider);
    const label = provider === "zhipu" ? "智谱" : "通义千问";
    if (!slot) {
      return { ok: false, message: `还没有${label}这一栏。请到「模型」页保存一次设置。` };
    }
    const name = String(slot.model || "").trim();
    const apiKey = String(slot.apiKey || "").trim();
    const baseUrl = String(slot.baseUrl || "").trim();
    if (!apiKey) {
      return {
        ok: false,
        message: `还没有填写${label}的钥匙。请到「模型」页粘贴。钥匙只留在这台电脑上，不会写进仓库。`,
      };
    }
    if (!name) {
      const example = provider === "zhipu" ? "glm-4-flash" : "qwen-plus";
      return { ok: false, message: `请填写${label}的模型名，例如 ${example}。` };
    }
    if (!baseUrl) {
      return { ok: false, message: `${label}的地址是空的。请恢复默认地址后再试。` };
    }
    return { ok: true, provider, label, baseUrl, model: name, apiKey };
  }
  const baseUrl = String(model.cloudBaseUrl || "").trim();
  const name = String(model.cloudModel || "").trim();
  const apiKey = String(model.cloudApiKey || "").trim();
  if (!baseUrl || !name || !apiKey) {
    return {
      ok: false,
      message: "另一家云端还没填全。需要地址、模型名和钥匙。钥匙只留在这台电脑上。",
    };
  }
  return { ok: true, provider: "cloud", label: "云端", baseUrl, model: name, apiKey };
}

export function defaultCloudSlots() {
  return [zhipuSlot(), qwenSlot(), extraSlot()];
}

export function ensureModelSlots(model) {
  if (!model.cloudSlots) model.cloudSlots = [];
  if (!model.cloudSlots.some((slot) => slot.id === "slot-zhipu" || slot.vendor === "zhipu")) {
    model.cloudSlots.unshift(zhipuSlot());
  }
  if (!model.cloudSlots.some((slot) => slot.id === "slot-qwen" || slot.vendor === "qwen")) {
    model.cloudSlots.push(qwenSlot());
  }
  for (const slot of model.cloudSlots) {
    slot.vendor = slot.vendor || vendorOf(slot);
    slot.characterIds = slot.characterIds || [];
    if (slot.vendor === "zhipu" && !slot.baseUrl) slot.baseUrl = ZHIPU_BASE_URL;
    if (slot.vendor === "qwen" && !slot.baseUrl) slot.baseUrl = QWEN_BASE_URL;
    if (!slot.label) slot.label = slot.vendor === "zhipu" ? "智谱" : slot.vendor === "qwen" ? "通义千问" : "另一家云端";
  }
  if (!Array.isArray(model.localModels)) model.localModels = [];
  return model;
}

function writeNamedSlot(model, vendor, modelName, apiKey, clearKey) {
  const slot = findSlot(model.cloudSlots || [], vendor);
  if (!slot) return;
  if (modelName != null) slot.model = String(modelName).trim();
  if (clearKey) slot.apiKey = "";
  else if (String(apiKey ?? "").trim()) slot.apiKey = String(apiKey).trim();
}

function findSlot(slots, vendor) {
  return slots.find((slot) => slot.vendor === vendor || slot.id === `slot-${vendor}`) || null;
}

function publicSlot(slot) {
  if (!slot) {
    return { id: "", label: "", vendor: "", baseUrl: "", model: "", characterIds: [], apiKeySet: false };
  }
  return {
    id: slot.id,
    label: slot.label || "",
    vendor: slot.vendor || vendorOf(slot),
    baseUrl: slot.baseUrl || "",
    model: slot.model || "",
    characterIds: [...(slot.characterIds || [])],
    apiKeySet: Boolean(slot.apiKey),
  };
}

function vendorOf(slot) {
  if (slot.id === "slot-zhipu") return "zhipu";
  if (slot.id === "slot-qwen") return "qwen";
  return "custom";
}

function zhipuSlot() {
  return {
    id: "slot-zhipu",
    label: "智谱",
    vendor: "zhipu",
    baseUrl: ZHIPU_BASE_URL,
    model: "",
    apiKey: "",
    characterIds: [],
  };
}

function qwenSlot() {
  return {
    id: "slot-qwen",
    label: "通义千问",
    vendor: "qwen",
    baseUrl: QWEN_BASE_URL,
    model: "",
    apiKey: "",
    characterIds: [],
  };
}

function extraSlot() {
  return {
    id: "slot-extra",
    label: "另一家云端",
    vendor: "custom",
    baseUrl: "",
    model: "",
    apiKey: "",
    characterIds: [],
  };
}
