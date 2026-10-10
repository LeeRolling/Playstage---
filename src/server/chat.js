/**
 * 向外调用模型。只在本机服务里发生，界面不直接请求云端。
 * 智谱、通义千问和 Ollama 的 OpenAI 兼容地址都走同一条对话接口。
 */

const LOCAL_TIMEOUT_MS = 120_000;
const CLOUD_TIMEOUT_MS = 45_000;

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
      ? "本机模型想得太久，这次先停下。可以等它空闲后再送一句，或换一个更轻的模型。"
      : "云端太久没有回应。请检查网络，稍后再试。";
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

export async function completeChat(target, messages, fetchImpl = fetch, options = {}) {
  const url = resolveChatUrl(target?.baseUrl);
  if (!url) return { ok: false, message: "模型地址读不懂。请回到「模型」页检查。" };
  if (!target?.model) return { ok: false, message: "还没有填写模型名。" };
  const headers = { "content-type": "application/json", ...authHeaders(target.apiKey) };
  const body = JSON.stringify({
    model: target.model,
    messages,
    temperature: 0.8,
    max_tokens: options.maxTokens || 400,
    stream: false,
  });
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(target.apiKey ? CLOUD_TIMEOUT_MS : LOCAL_TIMEOUT_MS),
    });
    const raw = await response.text();
    if (!response.ok) return { ok: false, message: explainHttpStatus(response.status, target) };
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return { ok: false, message: "模型回了一段读不懂的内容。请再送一句。" };
    }
    const text = extractReply(payload);
    if (!text) return { ok: false, message: "模型没有说出内容。请再送一句，或换一个模型试试。" };
    return { ok: true, text };
  } catch (error) {
    return { ok: false, message: explainNetworkError(error, target) };
  }
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

function extractReply(payload) {
  const choice = payload?.choices?.[0]?.message;
  let content = choice?.content;
  if (Array.isArray(content)) {
    content = content.map((part) => part?.text || part?.content || "").join("");
  }
  if (!content && payload?.message?.content) content = payload.message.content;
  return String(content || "").trim();
}
