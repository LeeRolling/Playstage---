/**
 * 向外调用模型。只在本机服务里发生，界面不直接请求云端。
 * 智谱、通义千问和 Ollama 的 OpenAI 兼容地址都走同一条对话接口。
 */

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

export async function listModels(target, fetchImpl = fetch) {
  const urls = resolveModelListUrls(target?.baseUrl);
  if (!urls.length) {
    return { ok: false, models: [], status: 0, message: "地址读不懂。请填写 http 开头的本机或云端地址。" };
  }
  let lastStatus = 0;
  let lastMessage = "";
  for (const url of urls) {
    try {
      const response = await fetchImpl(url, {
        headers: authHeaders(target?.apiKey),
        signal: AbortSignal.timeout(4000),
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
  let thinkingRejected = false;
  let result = await requestChat(url, target, messages, fetchImpl, {
    ...options,
    stream: true,
    disableThinking: deepseek,
  });
  if (!result.ok && result.status === 400) {
    if (deepseek) thinkingRejected = true;
    result = await requestChat(url, target, messages, fetchImpl, {
      ...options,
      stream: false,
      disableThinking: false,
    });
  }
  const elapsed = now() - started;
  if (!result.ok && result.kind === "empty" && elapsed < EMPTY_RETRY_MS) {
    result = await requestChat(url, target, messages, fetchImpl, {
      ...options,
      stream: false,
      disableThinking: deepseek && !thinkingRejected,
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
  return { text: content.trim() };
}

function extractReply(payload) {
  return extractPiece(payload).trim();
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
