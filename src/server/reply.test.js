import assert from "node:assert/strict";
import test from "node:test";
import { createSeedLibrary } from "../domain/library.js";
import { dispatch, toPublicLibrary } from "../domain/index.js";
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
