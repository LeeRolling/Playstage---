import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { completeChat, explainHttpStatus, parseModelList, resolveChatUrl, resolveModelListUrls } from "./chat.js";

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
    assert.equal(seen.body.stream, false);
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
