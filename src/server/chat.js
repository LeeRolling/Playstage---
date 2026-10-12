/**
 * 向外调用模型。只在本机服务里发生，界面不直接请求云端。
 * 智谱、通义千问和 Ollama 的 OpenAI 兼容地址都走同一条对话接口。
 * 本机预热走 Ollama 自己的 /api/generate：-1 留在显存，0 马上卸下。
 */

import {
  LOCAL_KEEP_ALIVE_PIN,
  LOCAL_KEEP_ALIVE_RELEASE,
  LOCAL_WARM_IDLE_MINUTES,
  resolveRouteMode,
  shouldReleaseLocalWarm,
} from "../domain/models.js";
import { sanitizeModelReply } from "../domain/reply-text.js";

const LOCAL_COLD_TIMEOUT_MS = 240_000;
const LOCAL_WARM_TIMEOUT_MS = 120_000;
const CLOUD_TIMEOUT_MS = 35_000;
const EMPTY_RETRY_MS = 12_000;

let localWarmed = false;

export function chatTimeoutMs(target, warmed = localWarmed) {
  if (target?.apiKey) return CLOUD_TIMEOUT_MS;
  return warmed ? LOCAL_WARM_TIMEOUT_MS : LOCAL_COLD_TIMEOUT_MS;
}

export function resolveChatUrl(baseUrl) {
  const root = String(baseUrl || "").trim().replace(/\/$/, "");
  if (!root) return "";
  let url;
  try {
    url = new URL(root);
  } catch {
    return "";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "";
  if (root.endsWith("/chat/completions")) return root;
  const path = url.pathname.replace(/\/$/, "");
  if (path && path !== "/") return `${root}/chat/completions`;
  return `${root}/v1/chat/completions`;
}

export function resolveModelListUrls(baseUrl) {
  const root = String(baseUrl || "").trim().replace(/\/$/, "");
  if (!root) return [];
  let url;
  try {
    url = new URL(root);
  } catch {
    return [];
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return [];
  const path = url.pathname.replace(/\/$/, "");
  if (!path || path === "/") return [`${root}/api/tags`, `${root}/v1/models`];
  if (path.endsWith("/v1")) {
    const host = root.slice(0, -3);
    return [`${root}/models`, `${host}/api/tags`];
  }
  return [`${root}/models`];
}

export function parseModelList(payload) {
  const names = [];
  const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : [];
  for (const row of rows) {
    const name = String(row?.id || row?.name || row?.model || "").trim();
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

export function explainHttpStatus(status, target) {
  const local = !target?.apiKey;
  if (status === 401 || status === 403) {
    return local
      ? "本机拒绝了这次连接。请确认 Ollama 已经打开，地址没有写错。"
      : "钥匙不对，或没有权限。请到「模型」页核对智谱或通义千问的钥匙。钥匙只留在这台电脑上。";
  }
  if (status === 429) return "请求太频繁了，对方让我们等一等。稍后再送一句。";
  if (status === 402) return "云端额度可能用完了。请到对应的官网看一下账户，再回来重试。";
  if (status === 404) {
    return local
      ? "没有找到这个本机模型。请在 Ollama 里确认名字，或到「模型」页重新读取列表。剧戏台不附带模型。"
      : "云端没有这个模型名，或地址不对。请核对「模型」页里的名字和地址。";
  }
  return `模型服务返回了 ${status}。请稍后再试。若是本机，请确认 Ollama 已打开。`;
}

export function explainNetworkError(error, target) {
  const local = !target?.apiKey;
  const name = error?.name || "";
  if (name === "TimeoutError" || name === "AbortError") {
    return local
      ? "本机模型还在加载，或这一次想得太久，先停下了。第一次把模型读进显卡会更慢，和硬件有关。可以再送一句，或换一个更轻的模型。"
      : "云端太久没有回应。快模型一般不用等这么久。请检查网络和模型名，稍后再送一句。";
  }
  if (local) {
    return "连不上本机 Ollama。请先自己打开 Ollama，地址一般是 http://127.0.0.1:11434 。模型要你自己装，剧戏台不下载。";
  }
  return "连不上这家云端。请检查网络，以及「模型」页里的地址和钥匙。";
}

export async function listModels(target, fetchImpl = fetch, options = {}) {
  const urls = resolveModelListUrls(target?.baseUrl);
  if (!urls.length) {
    return { ok: false, models: [], status: 0, message: "地址读不懂。请填写 http 开头的本机或云端地址。" };
  }
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 4000;
  let lastStatus = 0;
  let lastMessage = "";
  for (const url of urls) {
    try {
      const response = await fetchImpl(url, {
        headers: authHeaders(target?.apiKey),
        signal: AbortSignal.timeout(timeoutMs),
      });
      lastStatus = response.status;
      if (!response.ok) {
        lastMessage = explainHttpStatus(response.status, target);
        continue;
      }
      const payload = await response.json();
      return { ok: true, models: parseModelList(payload), status: response.status, message: "" };
    } catch (error) {
      lastMessage = explainNetworkError(error, target);
    }
  }
  return { ok: false, models: [], status: lastStatus, message: lastMessage || "没有读到模型列表。" };
}

/** 本机模型名已经填了之后，短问一次 Ollama：连不上或列表里没有，就让自动改走云端。 */
export async function probeLocalReady(target, fetchImpl = fetch) {
  const listed = await listModels({ baseUrl: target?.baseUrl, apiKey: "" }, fetchImpl, { timeoutMs: 1500 });
  if (!listed.ok) return { ok: false, reason: "unreachable" };
  const wanted = String(target?.model || "").trim();
  if (!wanted || !listed.models.length || !modelNameInstalled(listed.models, wanted)) {
    return { ok: false, reason: "missing" };
  }
  return { ok: true, reason: "" };
}

function modelNameInstalled(names, wanted) {
  return names.some((name) => name === wanted || name.startsWith(`${wanted}:`) || wanted.startsWith(`${name}:`));
}

export function looksLikeDeepSeek(target) {
  const blob = `${target?.baseUrl || ""} ${target?.model || ""}`.toLowerCase();
  return blob.includes("deepseek");
}

export async function completeChat(target, messages, fetchImpl = fetch, options = {}) {
  const url = resolveChatUrl(target?.baseUrl);
  if (!url) return { ok: false, message: "模型地址读不懂。请回到「模型」页检查。" };
  if (!target?.model) return { ok: false, message: "还没有填写模型名。" };
  if (cloudHostWithoutKey(target)) {
    return {
      ok: false,
      message: "这个地址是云端，还没有钥匙。请到「模型」页选智谱、通义千问或「另一家云端」，粘贴钥匙并保存。剧戏台不附带模型。",
    };
  }
  const now = options.now || Date.now;
  const started = now();
  const deepseek = looksLikeDeepSeek(target);
  const local = !target?.apiKey;
  let thinkingRejected = false;
  let result = await requestChat(url, target, messages, fetchImpl, {
    ...options,
    stream: true,
    disableThinking: deepseek,
    reasoningEffort: local ? "none" : "",
  });
  if (!result.ok && result.status === 400) {
    if (deepseek || local) thinkingRejected = true;
    result = await requestChat(url, target, messages, fetchImpl, {
      ...options,
      stream: false,
      disableThinking: false,
      reasoningEffort: "",
    });
  }
  const elapsed = now() - started;
  if (!result.ok && result.kind === "empty" && elapsed < EMPTY_RETRY_MS) {
    result = await requestChat(url, target, messages, fetchImpl, {
      ...options,
      stream: false,
      disableThinking: deepseek && !thinkingRejected,
      reasoningEffort: local && !thinkingRejected ? "none" : "",
      maxTokens: options.maxTokens || 400,
    });
    if (!result.ok && result.kind === "empty") {
      return {
        ok: false,
        message: "模型没有说出内容。已经自动再问了一次，还是空的。请再送一句，或到「模型」页换一个模型名试试。",
      };
    }
  }
  if (result.ok) return { ok: true, text: result.text };
  if (result.kind === "empty") {
    return {
      ok: false,
      message: "模型没有说出内容。这一次等了很久还是空的，没有再自动追问。请再送一句，或到「模型」页换一个模型名试试。",
    };
  }
  return { ok: false, message: result.message || "模型没有接上。请再试一次。" };
}

async function requestChat(url, target, messages, fetchImpl, options) {
  const headers = { "content-type": "application/json", ...authHeaders(target.apiKey) };
  const local = !target.apiKey;
  const timeout = options.timeoutMs || chatTimeoutMs(target);
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify(chatBody(target, messages, options)),
      signal: AbortSignal.timeout(timeout),
    });
    if (local) localWarmed = true;
    const raw = await response.text();
    if (!response.ok) {
      return { ok: false, kind: "http", status: response.status, message: explainHttpStatus(response.status, target) };
    }
    const parsed = parseModelPayload(raw);
    if (!parsed) return { ok: false, kind: "bad", message: "模型回了一段读不懂的内容。请再送一句。" };
    if (!parsed.text) return { ok: false, kind: "empty", message: "模型没有说出内容。" };
    return { ok: true, kind: "ok", text: parsed.text };
  } catch (error) {
    if (local) localWarmed = true;
    return { ok: false, kind: "network", message: explainNetworkError(error, target) };
  }
}

function chatBody(target, messages, options) {
  const body = {
    model: target.model,
    messages,
    temperature: 0.8,
    max_tokens: options.maxTokens || 400,
    stream: options.stream !== false,
  };
  if (options.disableThinking) body.thinking = { type: "disabled" };
  if (options.reasoningEffort) body.reasoning_effort = options.reasoningEffort;
  if (options.keepAlive != null && !target?.apiKey) body.keep_alive = options.keepAlive;
  return body;
}

function cloudHostWithoutKey(target) {
  if (target?.apiKey) return false;
  const host = String(target?.baseUrl || "").toLowerCase();
  return /api\.deepseek\.com|openai\.com|bigmodel\.cn|dashscope\.aliyuncs\.com/.test(host);
}

export async function probeBackend(target, fetchImpl = fetch, okMessage) {
  const listed = await listModels(target, fetchImpl);
  if (listed.ok) {
    return {
      ok: true,
      models: listed.models,
      message: okMessage || "连上了。",
    };
  }
  if (target?.apiKey && (listed.status === 404 || listed.status === 405)) {
    const ping = await completeChat(
      target,
      [{ role: "user", content: "只回复：好" }],
      fetchImpl,
      { maxTokens: 8 },
    );
    if (ping.ok) {
      return {
        ok: true,
        models: [],
        message: okMessage || "这家云端有回应。上台说话时会用它来接话。剧戏台不附带模型。",
      };
    }
    return { ok: false, models: [], message: ping.message };
  }
  return { ok: false, models: [], message: listed.message };
}

function authHeaders(apiKey) {
  if (!apiKey) return {};
  return { authorization: `Bearer ${apiKey}` };
}

function parseModelPayload(raw) {
  const text = String(raw || "").trim();
  if (!text) return { text: "" };
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      return { text: extractReply(JSON.parse(text)) };
    } catch {
      return null;
    }
  }
  if (text.startsWith("data:")) return parseEventStream(text);
  return null;
}

function parseEventStream(raw) {
  let content = "";
  for (const line of raw.split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      content += extractPiece(JSON.parse(data));
    } catch {
      // 跳过一行读不懂的片段，后面可能还有台词。
    }
  }
  return { text: sanitizeModelReply(content).trim() };
}

function extractReply(payload) {
  return sanitizeModelReply(extractPiece(payload)).trim();
}

export function ollamaGenerateUrl(baseUrl) {
  const root = String(baseUrl || "").trim().replace(/\/$/, "");
  if (!root) return "";
  let url;
  try {
    url = new URL(root);
  } catch {
    return "";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "";
  let path = url.pathname.replace(/\/$/, "");
  if (path.endsWith("/v1")) path = path.slice(0, -3);
  url.pathname = `${path}/api/generate`.replace(/\/{2,}/g, "/");
  return url.toString().replace(/\/$/, "");
}

export function warmStatusMessage(kind) {
  if (kind === "pinning") return "正在把本机模型读进显存，第一次会慢一些。";
  if (kind === "pinned") {
    return `本机模型已留在显存里。上台会快一些。大约 ${LOCAL_WARM_IDLE_MINUTES} 分钟没有用本机接话，会自动放开。`;
  }
  if (kind === "released") return "本机模型已从显存卸下。";
  if (kind === "idle") return `大约 ${LOCAL_WARM_IDLE_MINUTES} 分钟没有用本机接话，本机模型已从显存放开。`;
  return "";
}

export async function setLocalKeepAlive(target, keepAlive, fetchImpl = fetch) {
  const url = ollamaGenerateUrl(target?.baseUrl);
  const name = String(target?.model || "").trim();
  if (!url || !name) {
    return { ok: false, message: "还没有选择本机模型，没法预热。请先读取并选中一个。剧戏台不下载模型。" };
  }
  const releasing = keepAlive === LOCAL_KEEP_ALIVE_RELEASE;
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: name, keep_alive: keepAlive, stream: false }),
      signal: AbortSignal.timeout(releasing ? 8000 : 240_000),
    });
    await response.text();
    if (!response.ok) {
      return {
        ok: false,
        message: releasing
          ? "卸下没有完成。请确认 Ollama 还开着。"
          : "预热没有完成。请确认 Ollama 已打开，并且这个模型已经装好。剧戏台不下载模型。",
      };
    }
    return { ok: true, message: warmStatusMessage(releasing ? "released" : "pinned") };
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    if (releasing) return { ok: false, message: "卸下没有完成。请确认 Ollama 还开着。" };
    if (timedOut) return { ok: false, message: "预热等得太久了。模型可能还在读进显卡，可以再点一次「现在预热」。" };
    return { ok: false, message: "连不上本机 Ollama，没法预热。请先自己打开 Ollama。剧戏台不下载模型。" };
  }
}

export function createLocalWarmKeeper(options = {}) {
  const idleMs = options.idleMs || LOCAL_WARM_IDLE_MINUTES * 60 * 1000;
  const now = options.now || Date.now;
  const setKeepAlive = options.setKeepAlive || ((target, keepAlive) => setLocalKeepAlive(target, keepAlive, options.fetchImpl));
  let pinned = false;
  let modelName = "";
  let baseUrl = "";
  let lastLocalUseAt = 0;
  let message = "";
  let epoch = 0;

  function snapshot() {
    return {
      pinned,
      model: modelName,
      message,
      idleMinutes: Math.round(idleMs / 60_000),
    };
  }

  function noteLocalChat(target) {
    epoch += 1;
    pinned = true;
    modelName = String(target?.model || modelName || "").trim();
    baseUrl = String(target?.baseUrl || baseUrl || "").trim();
    lastLocalUseAt = now();
    message = warmStatusMessage("pinned");
  }

  async function pin(target) {
    const mine = ++epoch;
    modelName = String(target?.model || "").trim();
    baseUrl = String(target?.baseUrl || "").trim();
    message = warmStatusMessage("pinning");
    const result = await setKeepAlive({ baseUrl, model: modelName }, LOCAL_KEEP_ALIVE_PIN);
    if (mine !== epoch) return result;
    if (result.ok) {
      pinned = true;
      lastLocalUseAt = now();
      message = result.message || warmStatusMessage("pinned");
    } else {
      pinned = false;
      message = result.message;
    }
    return { ...result, message };
  }

  async function release(reason = "released", targetOverride) {
    const mine = ++epoch;
    if (targetOverride?.model) {
      modelName = String(targetOverride.model || "").trim();
      baseUrl = String(targetOverride.baseUrl || baseUrl || "").trim();
    }
    const target = { baseUrl, model: modelName };
    if (!target.model) {
      pinned = false;
      message = warmStatusMessage(reason);
      return { ok: true, message };
    }
    const result = await setKeepAlive(target, LOCAL_KEEP_ALIVE_RELEASE);
    if (mine !== epoch) return result;
    if (result.ok) {
      pinned = false;
      message = reason === "idle" ? warmStatusMessage("idle") : result.message || warmStatusMessage("released");
    } else {
      message = result.message;
    }
    return { ...result, message };
  }

  function holds(model) {
    return Boolean(model?.localKeepWarm)
      && resolveRouteMode(model) !== "cloud"
      && String(model?.localModel || "").trim() === modelName
      && Boolean(modelName);
  }

  async function tick(model) {
    if (!pinned) return snapshot();
    const hold = holds(model);
    const idle = shouldReleaseLocalWarm({
      keepWarm: hold,
      pinned: true,
      lastLocalUseAt,
      now: now(),
      idleMs,
    });
    if (!hold || idle) await release(hold ? "idle" : "released");
    return snapshot();
  }

  async function onModelSaved(before, after) {
    const beforeName = String(before?.localModel || "").trim();
    const afterName = String(after?.localModel || "").trim();
    const beforeOn = Boolean(before?.localKeepWarm);
    const afterOn = Boolean(after?.localKeepWarm);
    const wasCloud = resolveRouteMode(before) === "cloud";
    const cloudOnly = resolveRouteMode(after) === "cloud";
    const notes = [];
    const drop = (beforeOn && !afterOn) || cloudOnly || !afterName || (beforeName && beforeName !== afterName);
    if (drop && (pinned || beforeOn) && (modelName || beforeName)) {
      if (beforeName && beforeName !== modelName) {
        modelName = beforeName;
        baseUrl = String(before?.localBaseUrl || baseUrl || "").trim();
      }
      const result = await release("released");
      notes.push(result.message);
    }
    const arm = afterOn && afterName && !cloudOnly && (!beforeOn || beforeName !== afterName || wasCloud);
    if (arm) {
      notes.push(warmStatusMessage("pinning"));
      pin({ baseUrl: after.localBaseUrl, model: afterName }).catch(() => {});
    }
    return notes.filter(Boolean).join("");
  }

  return { snapshot, noteLocalChat, pin, release, tick, onModelSaved };
}

function extractPiece(payload) {
  const choice = payload?.choices?.[0];
  const message = choice?.message || {};
  const delta = choice?.delta || {};
  let content =
    delta.content ??
    message.content ??
    choice?.text ??
    payload?.output_text ??
    payload?.message?.content ??
    payload?.response ??
    "";
  if (Array.isArray(content)) {
    content = content.map((part) => (typeof part === "string" ? part : part?.text || part?.content || "")).join("");
  }
  return String(content || "");
}
