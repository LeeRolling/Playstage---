import assert from "node:assert/strict";
import test from "node:test";
import { adviseFromVram } from "./guide.js";
import { createSeedLibrary } from "./library.js";
import { dispatch, sessionForm } from "./index.js";

test("开局只有一本世界书，并带副本补丁", () => {
  const library = createSeedLibrary();
  assert.equal(library.worldBook.id, "book-main");
  assert.ok(library.worldBook.patches.length >= 1);
  assert.equal(library.sessions[0].worldBookId, "book-main");
});

test("两名角色是群聊，只留一名变一对一", () => {
  const library = createSeedLibrary();
  assert.equal(sessionForm(library.sessions[0]), "group");
  const next = dispatch(library, { type: "session.setNpcs", npcIds: ["npc-announcer"] }).library;
  assert.equal(sessionForm(next.sessions[0]), "duo");
});

test("轮流发言会轮换占位回复", () => {
  let library = createSeedLibrary();
  library = dispatch(library, { type: "session.send", text: "开场" }).library;
  library = dispatch(library, { type: "session.send", text: "下一句" }).library;
  const npcLines = library.sessions[0].messages.filter((item) => item.kind === "npc");
  assert.equal(npcLines.length, 2);
  assert.notEqual(npcLines[0].speakerId, npcLines[1].speakerId);
  assert.match(npcLines[0].text, /占位/);
});

test("抢话会停下，点名才回应", () => {
  let library = dispatch(createSeedLibrary(), { type: "session.setMode", mode: "interrupt" }).library;
  library = dispatch(library, { type: "session.send", text: "我饿了" }).library;
  const last = library.sessions[0].messages.at(-1);
  assert.equal(last.kind, "system");
  assert.match(last.text, /冷静/);

  library = dispatch(library, { type: "session.setMode", mode: "direct" }).library;
  library = dispatch(library, { type: "session.send", text: "大家好" }).library;
  assert.equal(library.sessions[0].messages.at(-1).kind, "system");
  library = dispatch(library, { type: "session.send", text: "提灯，看这边" }).library;
  const named = library.sessions[0].messages.at(-1);
  assert.equal(named.speakerName, "提灯");
});

test("存档后再说话，读档会回到存档时", () => {
  let library = dispatch(createSeedLibrary(), { type: "save.create", name: "开场前" }).library;
  const count = library.sessions[0].messages.length;
  library = dispatch(library, { type: "session.send", text: "这句不该留在档里" }).library;
  assert.ok(library.sessions[0].messages.length > count);
  library = dispatch(library, { type: "save.load", saveId: library.saves[0].id }).library;
  assert.equal(library.sessions[0].messages.length, count);
});

test("剧情包占位导出含前文提要，导入只登记", () => {
  const exported = dispatch(createSeedLibrary(), { type: "transfer.export", kind: "story" });
  assert.match(exported.download.body.priorSummary, /前文提要/);
  assert.match(exported.download.body.note, /占位/);
  const imported = dispatch(exported.library, {
    type: "transfer.import",
    kind: "characters",
    filename: "friend-card.json",
  });
  assert.match(imported.message, /只登记/);
  assert.equal(imported.library.characters.length, createSeedLibrary().characters.length);
});

test("空着的云端钥匙不会把已保存的钥匙擦掉", () => {
  let library = createSeedLibrary();
  library.model.cloudApiKey = "secret-key";
  library = dispatch(library, { type: "model.update", cloudApiKey: "", localModel: "demo" }).library;
  assert.equal(library.model.cloudApiKey, "secret-key");
  assert.equal(library.model.localModel, "demo");
});

test("显存建议提到 canirun，且不承诺代下模型", () => {
  const mid = adviseFromVram(8192);
  const low = adviseFromVram(4096);
  const none = adviseFromVram(null);
  for (const advice of [mid, low, none]) {
    assert.match(advice.body, /canirun\.ai/);
    assert.match(advice.body, /不/);
  }
  assert.match(mid.title, /8GB/);
  assert.match(low.body, /体验有限/);
  assert.match(none.body, /不用着急/);
});

test("未确认免责声明不能结束引导", () => {
  assert.throws(
    () => dispatch(createSeedLibrary(), { type: "guide.complete", disclaimerAccepted: false }),
    /免责声明/,
  );
  const done = dispatch(createSeedLibrary(), { type: "guide.complete", disclaimerAccepted: true }).library;
  assert.equal(done.guide.completed, true);
});
