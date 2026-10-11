import assert from "node:assert/strict";
import test from "node:test";
import { createSeedLibrary } from "../domain/library.js";
import { dispatch, toPublicLibrary } from "../domain/index.js";
import { looksLikeDeepSeek } from "./chat.js";
import { replyToPlayer } from "./reply.js";

test("本机模型的回复会写进对白，失败时留一句中文", async () => {
  let library = dispatch(createSeedLibrary(), { type: "stage.select", stageId: "stage-azure" }).library;
  library = dispatch(library, { type: "model.update", provider: "local", localModel: "qwen-local" }).library;
  const spoken = await replyToPlayer(library, "青册不许打开", async (target, messages) => {
    assert.equal(target.model, "qwen-local");
    assert.equal(target.apiKey, "");
    assert.match(messages[0].content, /青玄界/);
    assert.match(messages[0].content, /青册不许打开/);
    return { ok: true, text: "暖璃：这句话我记下了。" };
  });
  const npc = spoken.library.sessions[0].messages.filter((item) => item.kind === "npc");
  assert.equal(npc.length, 1);
  assert.equal(npc[0].speakerName, "暖璃");
  assert.equal(npc[0].text, "这句话我记下了。");
  assert.equal(spoken.tone, "ok");

  const failed = await replyToPlayer(spoken.library, "再问一句", async () => ({
    ok: false,
    message: "连不上本机 Ollama。请先自己打开 Ollama，地址一般是 http://127.0.0.1:11434 。模型要你自己装，剧戏台不下载。",
  }));
  assert.equal(failed.tone, "bad");
  assert.match(failed.message, /Ollama/);
  assert.match(failed.library.sessions[0].messages.at(-1).text, /Ollama/);
  assert.equal(failed.library.sessions[0].messages.filter((item) => item.kind === "npc").length, 1);

  const quiet = dispatch(createSeedLibrary(), { type: "stage.select", stageId: "stage-frost" }).library;
  const missing = await replyToPlayer(quiet, "有人吗", async () => {
    throw new Error("不该走到这里");
  });
  assert.equal(missing.tone, "bad");
  assert.match(missing.message, /本机模型/);
  assert.equal(missing.message.includes("读取本机模型"), false);
});

test("清掉本机模型后，另一家云端会接话", async () => {
  let library = dispatch(createSeedLibrary(), { type: "stage.select", stageId: "stage-azure" }).library;
  library = dispatch(library, {
    type: "model.update",
    routeMode: "auto",
    provider: "local",
    localModel: "",
    cloudBaseUrl: "https://api.deepseek.com/v1",
    cloudModel: "deepseek-chat",
    cloudApiKey: "dk",
  }).library;
  let seen = null;
  const spoken = await replyToPlayer(library, "青册不许打开", async (target) => {
    seen = target;
    return { ok: true, text: "暖璃：门还开着。" };
  });
  assert.equal(seen.baseUrl, "https://api.deepseek.com/v1");
  assert.equal(seen.model, "deepseek-chat");
  assert.equal(seen.apiKey, "dk");
  assert.equal(looksLikeDeepSeek(seen), true);
  assert.match(spoken.message, /改用云端「DeepSeek」/);
  assert.equal(spoken.message.includes("读取本机模型"), false);
  assert.equal(spoken.tone, "ok");
  assert.equal(spoken.library.sessions[0].messages.some((item) => item.kind === "npc"), true);
});

test("本机连不上时改用云端，只用本机时仍拦住", async () => {
  let library = dispatch(createSeedLibrary(), { type: "stage.select", stageId: "stage-azure" }).library;
  library = dispatch(library, {
    type: "model.update",
    routeMode: "auto",
    localModel: "qwen-local",
    cloudBaseUrl: "https://api.deepseek.com",
    cloudModel: "DeepSeek-Flash",
    cloudApiKey: "dk",
  }).library;
  const down = await replyToPlayer(
    library,
    "在吗",
    async (target) => {
      assert.equal(target.label, "DeepSeek");
      assert.equal(target.apiKey, "dk");
      assert.equal(looksLikeDeepSeek(target), true);
      return { ok: true, text: "暖璃：在。" };
    },
    { probeLocal: async () => ({ ok: false, reason: "unreachable" }) },
  );
  assert.match(down.message, /连不上/);
  assert.equal(down.tone, "ok");

  const missingModel = await replyToPlayer(
    library,
    "在吗",
    async (target) => {
      assert.equal(target.model, "DeepSeek-Flash");
      return { ok: true, text: "暖璃：在。" };
    },
    { probeLocal: async () => ({ ok: false, reason: "missing" }) },
  );
  assert.match(missingModel.message, /没有这个模型/);

  const up = await replyToPlayer(
    library,
    "在吗",
    async (target) => {
      assert.equal(target.provider, "local");
      assert.equal(target.model, "qwen-local");
      return { ok: true, text: "暖璃：在。" };
    },
    { probeLocal: async () => ({ ok: true }) },
  );
  assert.equal(up.message, "");

  const forced = dispatch(library, { type: "model.update", routeMode: "local", localModel: "" }).library;
  let calls = 0;
  const blocked = await replyToPlayer(forced, "在吗", async () => {
    calls += 1;
    return { ok: true, text: "不该说" };
  });
  assert.equal(calls, 0);
  assert.match(blocked.message, /读取本机模型/);
  assert.equal(blocked.tone, "bad");
});

test("抢话会接两句然后冷静", async () => {
  let library = dispatch(createSeedLibrary(), { type: "stage.select", stageId: "stage-frost" }).library;
  library = dispatch(library, { type: "session.setMode", mode: "interrupt" }).library;
  library = dispatch(library, { type: "model.update", provider: "zhipu", zhipuModel: "glm-4-flash", zhipuApiKey: "zk" }).library;
  const names = [];
  const outcome = await replyToPlayer(library, "我饿了", async (target) => {
    assert.equal(target.apiKey, "zk");
    assert.equal(target.baseUrl, "https://open.bigmodel.cn/api/paas/v4");
    names.push(target.model);
    return { ok: true, text: names.length === 1 ? "先去炉火边。" : "今天就吃这个，别的明天再说。" };
  });
  const npc = outcome.library.sessions[0].messages.filter((item) => item.kind === "npc");
  assert.equal(npc.length, 2);
  assert.equal(npc[0].speakerName, "Astrid");
  assert.equal(npc[1].speakerName, "Sigrid");
  assert.match(outcome.library.sessions[0].messages.at(-1).text, /冷静/);
  assert.equal(JSON.stringify(toPublicLibrary(outcome.library)).includes("zk"), false);
});
