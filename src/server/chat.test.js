import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import {
  chatTimeoutMs,
  completeChat,
  createLocalWarmKeeper,
  explainHttpStatus,
  looksLikeDeepSeek,
  ollamaGenerateUrl,
  parseModelList,
  probeLocalReady,
  resolveChatUrl,
  resolveModelListUrls,
  setLocalKeepAlive,
} from "./chat.js";

test("对话地址认得出 Ollama、智谱和千问", () => {
  assert.equal(resolveChatUrl("http://127.0.0.1:11434"), "http://127.0.0.1:11434/v1/chat/completions");
  assert.equal(resolveChatUrl("http://127.0.0.1:11434/v1"), "http://127.0.0.1:11434/v1/chat/completions");
  assert.equal(
    resolveChatUrl("https://open.bigmodel.cn/api/paas/v4"),
    "https://open.bigmodel.cn/api/paas/v4/chat/completions",
  );
  assert.equal(
    resolveChatUrl("https://dashscope.aliyuncs.com/compatible-mode/v1"),
    "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
  );
  assert.deepEqual(resolveModelListUrls("http://127.0.0.1:11434"), [
    "http://127.0.0.1:11434/api/tags",
    "http://127.0.0.1:11434/v1/models",
  ]);
  assert.deepEqual(resolveModelListUrls("http://127.0.0.1:11434/v1"), [
    "http://127.0.0.1:11434/v1/models",
    "http://127.0.0.1:11434/api/tags",
  ]);
  assert.equal(resolveChatUrl("https://api.deepseek.com"), "https://api.deepseek.com/v1/chat/completions");
  assert.equal(resolveChatUrl("https://api.deepseek.com/v1"), "https://api.deepseek.com/v1/chat/completions");
  assert.equal(looksLikeDeepSeek({ baseUrl: "https://api.example.com/v1", model: "DeepSeek-Flash" }), true);
  assert.equal(looksLikeDeepSeek({ baseUrl: "http://127.0.0.1:11434/v1", model: "qwen" }), false);
  assert.ok(chatTimeoutMs({ apiKey: "" }, false) > chatTimeoutMs({ apiKey: "" }, true));
  assert.ok(chatTimeoutMs({ apiKey: "" }, false) < 10 * 60_000);
  assert.ok(chatTimeoutMs({ apiKey: "k" }) < 60_000);
});

test("模型列表能读 OpenAI 和 Ollama 两种形状", () => {
  assert.deepEqual(parseModelList({ data: [{ id: "qwen2.5" }, { id: "qwen2.5" }] }), ["qwen2.5"]);
  assert.deepEqual(parseModelList({ models: [{ name: "qwen-uncensored:latest" }] }), ["qwen-uncensored:latest"]);
});

test("失败原因用中文区分钥匙、限流和本机没开", () => {
  assert.match(explainHttpStatus(401, { apiKey: "x" }), /钥匙/);
  assert.match(explainHttpStatus(429, { apiKey: "x" }), /太频繁/);
  assert.match(explainHttpStatus(404, { apiKey: "" }), /本机模型/);
  assert.match(explainHttpStatus(404, { apiKey: "x" }), /模型名/);
});

test("completeChat 会把台词从兼容接口里取出来", async () => {
  const seen = {};
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      seen.url = request.url;
      seen.auth = request.headers.authorization || "";
      seen.body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ choices: [{ message: { content: "炉火还在。" } }] }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    const result = await completeChat(
      { baseUrl: `http://127.0.0.1:${port}/v1`, model: "qwen-local", apiKey: "" },
      [{ role: "user", content: "你好" }],
    );
    assert.equal(result.ok, true);
    assert.equal(result.text, "炉火还在。");
    assert.equal(seen.url, "/v1/chat/completions");
    assert.equal(seen.auth, "");
    assert.equal(seen.body.model, "qwen-local");
    assert.equal(seen.body.stream, true);
    assert.equal(seen.body.thinking, undefined);
    assert.equal(seen.body.reasoning_effort, "none");
    assert.equal(seen.body.keep_alive, undefined);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("钥匙错误时不会抛出，而是一句中文", async () => {
  const result = await completeChat({ baseUrl: "http://127.0.0.1:9/v1", model: "glm-4-flash", apiKey: "bad" }, [
    { role: "user", content: "你好" },
  ], async () => ({
    ok: false,
    status: 401,
    text: async () => "",
  }));
  assert.equal(result.ok, false);
  assert.match(result.message, /钥匙/);
});

test("流式片段能拼成一句台词", async () => {
  const result = await completeChat(
    { baseUrl: "http://127.0.0.1:9/v1", model: "qwen-plus", apiKey: "k" },
    [{ role: "user", content: "你好" }],
    async () => ({
      ok: true,
      status: 200,
      text: async () =>
        [
          `data: ${JSON.stringify({ choices: [{ delta: { content: "能，" } }] })}`,
          `data: ${JSON.stringify({ choices: [{ delta: { content: "门还没关。" } }] })}`,
          "data: [DONE]",
        ].join("\n"),
    }),
  );
  assert.equal(result.ok, true);
  assert.equal(result.text, "能，门还没关。");
});

test("DeepSeek 空内容会再问一次，并关掉思考", async () => {
  const bodies = [];
  const result = await completeChat(
    { baseUrl: "https://api.deepseek.com/v1", model: "DeepSeek-Flash", apiKey: "dk" },
    [{ role: "user", content: "现在是什么情况？" }],
    async (_url, init) => {
      const body = JSON.parse(init.body);
      bodies.push(body);
      if (bodies.length === 1) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ choices: [{ message: { content: "", reasoning_content: "先想一想" } }] }),
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ choices: [{ message: { content: "门还开着。" } }] }),
      };
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.text, "门还开着。");
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].stream, true);
  assert.equal(bodies[0].keep_alive, undefined);
  assert.deepEqual(bodies[0].thinking, { type: "disabled" });
  assert.equal(bodies[1].stream, false);
  assert.deepEqual(bodies[1].thinking, { type: "disabled" });
});

test("等太久的空回复不再追问第二次", async () => {
  let calls = 0;
  let clock = 0;
  const result = await completeChat(
    { baseUrl: "https://api.deepseek.com/v1", model: "DeepSeek-Flash", apiKey: "dk" },
    [{ role: "user", content: "在吗" }],
    async () => {
      calls += 1;
      clock += 20_000;
      return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: null } }] }) };
    },
    { now: () => clock },
  );
  assert.equal(calls, 1);
  assert.equal(result.ok, false);
  assert.match(result.message, /没有再自动追问/);
});

test("思考字段被拒绝时退回普通请求", async () => {
  const bodies = [];
  const result = await completeChat(
    { baseUrl: "https://api.deepseek.com", model: "deepseek-chat", apiKey: "dk" },
    [{ role: "user", content: "你好" }],
    async (_url, init) => {
      const body = JSON.parse(init.body);
      bodies.push(body);
      if (body.thinking) {
        return { ok: false, status: 400, text: async () => "" };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ choices: [{ message: { content: [{ type: "text", text: "炉火还在。" }] } }] }),
      };
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.text, "炉火还在。");
  assert.equal(bodies.length, 2);
  assert.equal(bodies[1].thinking, undefined);
  assert.equal(bodies[1].stream, false);
});

test("本机探测能分出连不上和没装上", async () => {
  const ready = await probeLocalReady({ baseUrl: "http://127.0.0.1:9/v1", model: "qwen2.5" }, async () => ({
    ok: true,
    status: 200,
    json: async () => ({ models: [{ name: "qwen2.5:latest" }] }),
  }));
  assert.equal(ready.ok, true);
  const missing = await probeLocalReady({ baseUrl: "http://127.0.0.1:9/v1", model: "missing" }, async () => ({
    ok: true,
    status: 200,
    json: async () => ({ models: [{ name: "qwen2.5:latest" }] }),
  }));
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, "missing");
  const down = await probeLocalReady({ baseUrl: "http://127.0.0.1:9/v1", model: "qwen" }, async () => {
    throw new Error("offline");
  });
  assert.equal(down.ok, false);
  assert.equal(down.reason, "unreachable");
});

test("预热的 keep_alive 只出现在本机请求里", async () => {
  assert.equal(ollamaGenerateUrl("http://127.0.0.1:11434/v1"), "http://127.0.0.1:11434/api/generate");
  assert.equal(ollamaGenerateUrl("http://127.0.0.1:11434"), "http://127.0.0.1:11434/api/generate");
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200, text: async () => "" };
  };
  const pinned = await setLocalKeepAlive(
    { baseUrl: "http://127.0.0.1:11434/v1", model: "qwen-local" },
    -1,
    fetchImpl,
  );
  assert.equal(pinned.ok, true);
  assert.match(pinned.message, /留在显存/);
  const released = await setLocalKeepAlive(
    { baseUrl: "http://127.0.0.1:11434/v1", model: "qwen-local" },
    0,
    fetchImpl,
  );
  assert.match(released.message, /卸下/);
  assert.equal(seen[0].url, "http://127.0.0.1:11434/api/generate");
  assert.equal(seen[0].body.keep_alive, -1);
  assert.equal(seen[0].body.stream, false);
  assert.equal(seen[1].body.keep_alive, 0);

  const bodies = [];
  const chatFetch = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { content: "在。" } }] }),
    };
  };
  await completeChat(
    { baseUrl: "http://127.0.0.1:9/v1", model: "qwen", apiKey: "" },
    [{ role: "user", content: "在吗" }],
    chatFetch,
    { keepAlive: -1 },
  );
  await completeChat(
    { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat", apiKey: "dk" },
    [{ role: "user", content: "在吗" }],
    chatFetch,
    { keepAlive: -1 },
  );
  assert.equal(bodies[0].keep_alive, -1);
  assert.equal(bodies[0].stream, true);
  assert.equal(bodies[0].reasoning_effort, "none");
  assert.equal(bodies[1].keep_alive, undefined);
  assert.equal(bodies[1].reasoning_effort, undefined);
  assert.deepEqual(bodies[1].thinking, { type: "disabled" });
});

test("预热后一段时间没人用本机，就把模型从显存放开", async () => {
  let clock = 1_000;
  const calls = [];
  const keeper = createLocalWarmKeeper({
    idleMs: 1_000,
    now: () => clock,
    setKeepAlive: async (target, keepAlive) => {
      calls.push({ model: target.model, keepAlive });
      return { ok: true, message: keepAlive === 0 ? "本机模型已从显存卸下。" : "本机模型已留在显存里。" };
    },
  });
  const model = {
    localKeepWarm: true,
    localModel: "qwen",
    localBaseUrl: "http://127.0.0.1:11434/v1",
    routeMode: "auto",
    provider: "local",
  };
  await keeper.pin({ baseUrl: model.localBaseUrl, model: "qwen" });
  assert.equal(calls[0].keepAlive, -1);
  assert.equal(keeper.snapshot().pinned, true);
  clock = 1_500;
  await keeper.tick(model);
  assert.equal(calls.length, 1);
  keeper.noteLocalChat({ baseUrl: model.localBaseUrl, model: "qwen" });
  clock = 2_000;
  await keeper.tick(model);
  assert.equal(calls.length, 1);
  clock = 2_600;
  await keeper.tick(model);
  assert.equal(calls.at(-1).keepAlive, 0);
  assert.equal(keeper.snapshot().pinned, false);
  assert.match(keeper.snapshot().message, /放开/);

  await keeper.pin({ baseUrl: model.localBaseUrl, model: "qwen" });
  clock += 10;
  await keeper.tick({ ...model, routeMode: "cloud" });
  assert.equal(calls.at(-1).keepAlive, 0);

  const note = await keeper.onModelSaved(
    { ...model, localKeepWarm: false, routeMode: "auto" },
    { ...model, localKeepWarm: true },
  );
  assert.match(note, /读进显存/);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.at(-1).keepAlive, -1);
  const dropped = await keeper.onModelSaved(model, { ...model, localKeepWarm: false });
  assert.match(dropped, /卸下/);
  assert.equal(calls.at(-1).keepAlive, 0);
});

test("本机思考标签不会进台词，旧接口拒绝思考字段时会退回", async () => {
  const bodies = [];
  const cleaned = await completeChat(
    { baseUrl: "http://127.0.0.1:9/v1", model: "huihui-qwen3-14b-q4:latest", apiKey: "" },
    [{ role: "user", content: "你好" }],
    async (_url, init) => {
      bodies.push(JSON.parse(init.body));
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [{ message: { content: "<think>先想一下</think>【expr_smile】【pose_wave】这条线今晚还亮着。" } }],
          }),
      };
    },
  );
  assert.equal(cleaned.ok, true);
  assert.equal(cleaned.text.includes("think"), false);
  assert.equal(cleaned.text.includes("<"), false);
  assert.match(cleaned.text, /这条线今晚还亮着/);
  assert.equal(bodies[0].reasoning_effort, "none");
  assert.equal(bodies[0].thinking, undefined);

  const cloudBodies = [];
  await completeChat(
    { baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus", apiKey: "qk" },
    [{ role: "user", content: "你好" }],
    async (_url, init) => {
      cloudBodies.push(JSON.parse(init.body));
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ choices: [{ message: { content: "门还开着。" } }] }),
      };
    },
  );
  assert.equal(cloudBodies[0].reasoning_effort, undefined);
  assert.equal(cloudBodies[0].thinking, undefined);

  const retried = [];
  const rejected = await completeChat(
    { baseUrl: "http://127.0.0.1:9/v1", model: "qwen-local", apiKey: "" },
    [{ role: "user", content: "你好" }],
    async (_url, init) => {
      const body = JSON.parse(init.body);
      retried.push(body);
      if (body.reasoning_effort) return { ok: false, status: 400, text: async () => "" };
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ choices: [{ message: { content: "在。" } }] }),
      };
    },
  );
  assert.equal(rejected.ok, true);
  assert.equal(rejected.text, "在。");
  assert.equal(retried.length, 2);
  assert.equal(retried[0].reasoning_effort, "none");
  assert.equal(retried[1].reasoning_effort, undefined);
  assert.equal(retried[1].stream, false);
});

test("云端地址没带钥匙时不等超时", async () => {
  let calls = 0;
  const result = await completeChat(
    { baseUrl: "https://api.deepseek.com/v1", model: "DeepSeek-Flash", apiKey: "" },
    [{ role: "user", content: "你好" }],
    async () => {
      calls += 1;
      return { ok: true, status: 200, text: async () => "" };
    },
  );
  assert.equal(calls, 0);
  assert.match(result.message, /钥匙/);
});
