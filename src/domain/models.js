import { clone, nowIso } from "./util.js";

export const LOCAL_CONNECTED_NOTE = "连上了。上台说话时会用这里选中的本机模型。剧戏台仍不附带模型。";
export const OLLAMA_BASE_URL = "http://127.0.0.1:11434/v1";
export const ZHIPU_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";
export const QWEN_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";

const PROVIDERS = new Set(["local", "cloud", "zhipu", "qwen"]);
const ROUTE_MODES = ["auto", "local", "cloud"];

export function resolveRouteMode(model) {
  if (ROUTE_MODES.includes(model?.routeMode)) return model.routeMode;
  const provider = PROVIDERS.has(model?.provider) ? model.provider : "local";
  return provider === "local" ? "auto" : "cloud";
}

export function publicModel(model) {
  const slots = model.cloudSlots || [];
  const routeMode = resolveRouteMode(model);
  return {
    provider: PROVIDERS.has(model.provider) ? model.provider : "local",
    routeMode,
    routeHint: routeHint(model),
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
  if (fields.routeMode != null) {
    if (!ROUTE_MODES.includes(fields.routeMode)) {
      throw new Error("请选自动、只用本机，或只用云端。");
    }
    model.routeMode = fields.routeMode;
  }
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
 * 自动：本机模型填了并且连得上就用本机，否则用已经填好的云端。
 * 按角色分家是预留：这一版全场只用决定好的那一家。
 * localReachable 不传时，只看有没有填本机模型名，不探测网络。
 */
export function actingTarget(library, options = {}) {
  const model = library?.model || {};
  const mode = resolveRouteMode(model);
  const local = localCandidate(model);
  const localUsable = local.ok && options.localReachable !== false;
  if (mode === "local") {
    if (!local.ok) return { ok: false, message: local.message };
    if (options.localReachable === false) {
      return { ok: false, message: localDownMessage(options.localReason) };
    }
    return local.target;
  }
  const cloud = preferredCloud(model);
  if (mode === "cloud") {
    if (!cloud.ok) return { ok: false, message: cloud.message };
    return cloud.target;
  }
  if (localUsable) return local.target;
  if (cloud.ok) return cloudResult(model, local, options, cloud);
  return { ok: false, message: blockedMessage(model, local, options, cloud.message) };
}

/** 自动或只用本机、并且本机模型名已经填了时，才需要问一句 Ollama 在不在。 */
export function localRouteProbe(library) {
  const model = library?.model || {};
  if (resolveRouteMode(model) === "cloud") return null;
  const local = localCandidate(model);
  return local.ok ? local.target : null;
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
  model.routeMode = resolveRouteMode(model);
  return model;
}

function localCandidate(model) {
  const baseUrl = String(model.localBaseUrl || "").trim();
  const name = String(model.localModel || "").trim();
  if (!baseUrl) {
    return {
      ok: false,
      reason: "address",
      message: "还没有填写本机地址。Ollama 一般是 http://127.0.0.1:11434 或带 /v1 的那个地址。",
    };
  }
  if (!name) {
    return {
      ok: false,
      reason: "missing",
      message: "还没有选择本机模型。请到「模型」页点「读取本机模型」，选中你在 Ollama 里装好的那个，再保存。剧戏台不附带模型。",
    };
  }
  return {
    ok: true,
    reason: "ready",
    target: { ok: true, provider: "local", label: "本机", baseUrl, model: name, apiKey: "" },
  };
}

function localDownMessage(reason) {
  if (reason === "missing") {
    return "本机没有这个模型。请到「模型」页重新读取列表，选一个已经装好的，或改成自动，让云端接上。剧戏台不附带模型。";
  }
  return "连不上本机 Ollama。请先自己打开 Ollama。若要改用云端，把接话方式改成自动或只用云端。";
}

function preferredCloud(model) {
  const choices = cloudChoices(model);
  const provider = PROVIDERS.has(model.provider) ? model.provider : "local";
  if (provider === "zhipu" || provider === "qwen") {
    const found = choices.find((item) => item.provider === provider);
    if (found) return { ok: true, target: found, preferred: true };
  }
  if (provider === "cloud") {
    const found = choices.find((item) => item.provider === "cloud");
    if (found) return { ok: true, target: found, preferred: true };
  }
  if (choices[0]) return { ok: true, target: choices[0], preferred: false };
  return { ok: false, message: cloudMissMessage(model) };
}

function cloudChoices(model) {
  const choices = [];
  const extra = extraCandidate(model);
  if (extra.ok) choices.push(extra.target);
  for (const slot of model.cloudSlots || []) {
    if (slot.vendor === "zhipu" || slot.vendor === "qwen" || slot.id === "slot-zhipu" || slot.id === "slot-qwen") continue;
    const candidate = slotCandidate(slot);
    if (!candidate) continue;
    const same = choices.some((item) => item.baseUrl === candidate.baseUrl && item.model === candidate.model);
    if (!same) choices.push(candidate);
  }
  const zhipu = namedCloudCandidate(model, "zhipu");
  if (zhipu.ok) choices.push(zhipu.target);
  const qwen = namedCloudCandidate(model, "qwen");
  if (qwen.ok) choices.push(qwen.target);
  return choices;
}

function cloudResult(model, local, options, cloud) {
  if (shouldAnnounceFallback(model, local, options)) {
    return { ...cloud.target, fallback: true, notice: fallbackNotice(local, options, cloud.target) };
  }
  if (!cloud.preferred) {
    return {
      ...cloud.target,
      fallback: true,
      notice: `勾选的那家云端还不能用，这一句改用云端「${cloud.target.label}」。`,
    };
  }
  return cloud.target;
}

function shouldAnnounceFallback(model, local, options) {
  if (local.ok && options.localReachable === false) return true;
  const provider = PROVIDERS.has(model.provider) ? model.provider : "local";
  return provider === "local";
}

function fallbackNotice(local, options, cloud) {
  const label = cloud.label || "云端";
  if (local.ok && options.localReachable === false) {
    if (options.localReason === "missing") return `本机没有这个模型，这一句改用云端「${label}」。`;
    return `本机连不上，这一句改用云端「${label}」。`;
  }
  if (local.reason === "address") return `本机地址还空着，这一句改用云端「${label}」。`;
  return `本机还没有选模型，这一句改用云端「${label}」。`;
}

function blockedMessage(model, local, options, cloudMessage) {
  const provider = PROVIDERS.has(model.provider) ? model.provider : "local";
  const cloudChosen = provider === "zhipu" || provider === "qwen" || provider === "cloud";
  if (cloudChosen && !local.ok) return cloudMessage;
  if (local.ok && options.localReachable === false) {
    const why = options.localReason === "missing" ? "本机没有这个模型" : "本机连不上";
    return `${why}，云端也还没填好钥匙和模型名。请打开 Ollama，或到「模型」页把云端填上。剧戏台不附带模型。`;
  }
  if (local.reason === "address") {
    return "本机地址还空着，云端也还没填齐。请写上 Ollama 地址，或到「模型」页填好一家云端的钥匙和模型名。剧戏台不附带模型。";
  }
  return "本机模型还没选上，云端也没有一家填齐钥匙和模型名。请到「模型」页至少准备好一边。剧戏台不附带模型。";
}

function cloudMissMessage(model) {
  const provider = PROVIDERS.has(model.provider) ? model.provider : "local";
  if (provider === "zhipu" || provider === "qwen") return namedCloudCandidate(model, provider).message;
  if (provider === "cloud") return extraCandidate(model).message;
  return "云端还没有一家填齐地址、模型名和钥匙。";
}

function namedCloudCandidate(model, vendor) {
  const slot = findSlot(model.cloudSlots || [], vendor);
  const label = vendor === "zhipu" ? "智谱" : "通义千问";
  if (!slot) return { ok: false, message: `还没有${label}这一栏。请到「模型」页保存一次设置。` };
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
    const example = vendor === "zhipu" ? "glm-4-flash" : "qwen-plus";
    return { ok: false, message: `请填写${label}的模型名，例如 ${example}。` };
  }
  if (!baseUrl) return { ok: false, message: `${label}的地址是空的。请恢复默认地址后再试。` };
  return {
    ok: true,
    target: { ok: true, provider: vendor, label, baseUrl, model: name, apiKey },
  };
}

function extraCandidate(model) {
  const baseUrl = String(model.cloudBaseUrl || "").trim();
  const name = String(model.cloudModel || "").trim();
  const apiKey = String(model.cloudApiKey || "").trim();
  if (!baseUrl || !name || !apiKey) {
    return { ok: false, message: "另一家云端还没填全。需要地址、模型名和钥匙。钥匙只留在这台电脑上。" };
  }
  return {
    ok: true,
    target: {
      ok: true,
      provider: "cloud",
      label: cloudDisplayLabel("另一家云端", baseUrl, name),
      baseUrl,
      model: name,
      apiKey,
    },
  };
}

function slotCandidate(slot) {
  const baseUrl = String(slot.baseUrl || "").trim();
  const name = String(slot.model || "").trim();
  const apiKey = String(slot.apiKey || "").trim();
  if (!baseUrl || !name || !apiKey) return null;
  return {
    ok: true,
    provider: "cloud",
    label: cloudDisplayLabel(slot.label || "另一家云端", baseUrl, name),
    baseUrl,
    model: name,
    apiKey,
  };
}

function cloudDisplayLabel(fallback, baseUrl, modelName) {
  if (/deepseek/i.test(`${baseUrl} ${modelName} ${fallback}`)) return "DeepSeek";
  return fallback || "另一家云端";
}

function routeHint(model) {
  const mode = resolveRouteMode(model);
  const local = localCandidate(model);
  const cloud = preferredCloud(model);
  if (mode === "local") {
    return local.ok ? `只用本机「${local.target.model}」。` : "只用本机。本机模型还没选好。";
  }
  if (mode === "cloud") {
    return cloud.ok ? `只用云端「${cloud.target.label}」。` : "只用云端。云端还没填齐钥匙和模型名。";
  }
  if (local.ok && cloud.ok) {
    return `自动：本机「${local.target.model}」连得上就用本机，否则用云端「${cloud.target.label}」。`;
  }
  if (local.ok) return `自动：会用本机「${local.target.model}」。云端还没填齐，本机连不上时会拦住。`;
  if (cloud.ok) return `自动：本机还没选模型，上台会改用云端「${cloud.target.label}」。`;
  return "自动：本机和云端都还没准备好。请至少填好一边。";
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
