import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { adviseFromVram, describePrerequisites } from "./guide.js";
import { createSeedLibrary, migrateLibrary } from "./library.js";
import { LOCAL_CONNECTED_NOTE, armModelRetest } from "./models.js";
import { resolveScene } from "./scene.js";
import { dispatch, sessionForm } from "./index.js";

test("开局有三本世界书，一场戏还没把九个人请上台", () => {
  const library = createSeedLibrary();
  assert.equal(library.worldBooks.length, 3);
  assert.equal(library.stagePicked, false);
  assert.equal(library.sessions[0].npcIds.length, 0);
  assert.equal(library.sessions[0].worldBookId, "");
  assert.equal(sessionForm(library.sessions[0]), "empty");
  const npcs = library.characters.filter((item) => item.kind === "npc");
  assert.equal(npcs.length, 9);
  for (const stage of library.stages) {
    assert.equal(stage.characterIds.length, 3);
  }
});

test("选定舞台后只请这一本世界的三位", () => {
  const library = dispatch(createSeedLibrary(), { type: "stage.select", stageId: "stage-frost" }).library;
  const session = library.sessions[0];
  assert.equal(session.worldBookId, "book-frost");
  assert.deepEqual(session.npcIds, ["npc-astrid", "npc-sigrid", "npc-elin"]);
  assert.equal(sessionForm(session), "group");
  assert.throws(
    () => dispatch(library, { type: "session.setNpcs", npcIds: ["npc-astrid", "npc-nuanli"] }),
    /当前舞台/,
  );
  const duo = dispatch(library, { type: "session.setNpcs", npcIds: ["npc-astrid"] }).library;
  assert.equal(sessionForm(duo.sessions[0]), "duo");
});

test("霓穹市地点路径含已确认的卧室、厨房、玄关", () => {
  const neon = createSeedLibrary().worldBooks.find((item) => item.id === "book-neon");
  const byName = Object.fromEntries(neon.locations.map((item) => [item.name, item.imageFile]));
  assert.equal(byName["卧室"], "assets/defaults/backgrounds/现代/卧室/赛博卧室_白天.jpg");
  assert.equal(byName["厨房"], "assets/defaults/backgrounds/现代/厨房/赛博厨房_白天.jpg");
  assert.equal(byName["玄关"], "assets/defaults/backgrounds/现代/玄关/赛博玄关_白天.jpg");
  assert.equal(byName["城市中心"], "assets/defaults/backgrounds/现代/城市中心/赛博城市中心_白天.jpg");
  assert.equal(byName["办公室"], "assets/defaults/backgrounds/现代/办公室/赛博办公室_白天.png");
  assert.equal(byName["客厅"], "assets/defaults/backgrounds/现代/客厅/赛博客厅_白天.png");
  assert.equal(neon.locations.length, 13);
  for (const place of neon.locations) {
    assert.match(place.nightImageFile, /_晚上\.(jpg|png)$/);
    assert.equal(place.nightImageFile.replace("_晚上", "_白天"), place.imageFile);
  }
  const names = ["氛围", "冲突", "禁忌"];
  assert.deepEqual(
    neon.entries.map((item) => item.title),
    names,
  );
});

test("默认角色写下全身图路径", () => {
  const library = createSeedLibrary();
  const astrid = library.characters.find((item) => item.name === "Astrid");
  const nuanli = library.characters.find((item) => item.name === "暖璃");
  const chutang = library.characters.find((item) => item.name === "初棠");
  assert.equal(astrid.fullBodyFile, "assets/defaults/characters/女/北欧/Astrid.png");
  assert.equal(nuanli.fullBodyFile, "assets/defaults/characters/女/东方/暖璃.png");
  assert.equal(chutang.fullBodyFile, "assets/defaults/characters/女/现代/初棠.png");
});

test("说话里提到地点会换景，特殊情景没图时只做标记", () => {
  let library = dispatch(createSeedLibrary(), { type: "stage.select", stageId: "stage-neon" }).library;
  library = dispatch(library, { type: "session.send", text: "我去卧室看看" }).library;
  assert.equal(library.sessions[0].state.locationId, "loc-neon-bedroom");
  assert.equal(library.view ? library.sessions[0].state.locationId : "loc-neon-bedroom", "loc-neon-bedroom");
  const sceneLine = library.sessions[0].messages.find((item) => item.text.includes("卧室"));
  assert.ok(sceneLine);

  library = dispatch(library, { type: "session.send", text: "去义体改造商店，别谈出厂设置" }).library;
  assert.equal(library.sessions[0].state.locationId, "loc-neon-clinic");
  assert.equal(library.sessions[0].state.activeTriggerId, "trig-neon-factory");
  assert.match(library.sessions[0].messages.at(-1).text === undefined ? "" : library.sessions[0].messages.map((item) => item.text).join("\n"), /特殊情景/);

  library = dispatch(library, { type: "session.setTime", timeOfDay: "night" }).library;
  assert.equal(library.sessions[0].state.timeOfDay, "night");
  assert.equal(
    resolveScene(library).imageFile,
    "assets/defaults/backgrounds/现代/义体改造商店/赛博义体改造商店_晚上.jpg",
  );
});

test("可以自己加地点，王宫大门不会误判成王宫内部", () => {
  let library = dispatch(createSeedLibrary(), { type: "stage.select", stageId: "stage-frost" }).library;
  library = dispatch(library, { type: "session.send", text: "我站在王宫大门" }).library;
  assert.equal(library.sessions[0].state.locationId, "loc-frost-gate");
  library = dispatch(library, {
    type: "world.addLocation",
    worldBookId: "book-frost",
    name: "冰河渡口",
  }).library;
  const added = library.worldBooks.find((item) => item.id === "book-frost").locations.find((item) => item.name === "冰河渡口");
  assert.ok(added);
  library = dispatch(library, {
    type: "world.setLocationImage",
    locationId: added.id,
    imageFile: "data/media/ferry-day.jpg",
    slot: "day",
  }).library;
  const saved = library.worldBooks
    .find((item) => item.id === "book-frost")
    .locations.find((item) => item.id === added.id);
  assert.equal(saved.imageFile, "data/media/ferry-day.jpg");
});

test("轮流发言会轮换占位回复", () => {
  let library = dispatch(createSeedLibrary(), { type: "stage.select", stageId: "stage-frost" }).library;
  library = dispatch(library, { type: "session.send", text: "开场" }).library;
  library = dispatch(library, { type: "session.send", text: "下一句" }).library;
  const npcLines = library.sessions[0].messages.filter((item) => item.kind === "npc");
  assert.equal(npcLines.length, 2);
  assert.equal(npcLines[0].speakerName, "Astrid");
  assert.equal(npcLines[1].speakerName, "Sigrid");
  assert.match(npcLines[0].text, /占位/);
});

test("抢话会停下，点名才回应", () => {
  let library = dispatch(createSeedLibrary(), { type: "stage.select", stageId: "stage-frost" }).library;
  library = dispatch(library, { type: "session.setMode", mode: "interrupt" }).library;
  library = dispatch(library, { type: "session.send", text: "我饿了" }).library;
  const last = library.sessions[0].messages.at(-1);
  assert.equal(last.kind, "system");
  assert.match(last.text, /冷静/);

  library = dispatch(library, { type: "session.setMode", mode: "direct" }).library;
  library = dispatch(library, { type: "session.send", text: "大家好" }).library;
  assert.equal(library.sessions[0].messages.at(-1).kind, "system");
  library = dispatch(library, { type: "session.send", text: "Elin，看这边" }).library;
  const named = [...library.sessions[0].messages].reverse().find((item) => item.kind === "npc");
  assert.equal(named.speakerName, "Elin");
});

test("存档后再说话，读档会回到存档时", () => {
  let library = dispatch(createSeedLibrary(), { type: "stage.select", stageId: "stage-azure" }).library;
  library = dispatch(library, { type: "save.create", name: "开场前" }).library;
  const count = library.sessions[0].messages.length;
  library = dispatch(library, { type: "session.send", text: "这句不该留在档里" }).library;
  assert.ok(library.sessions[0].messages.length > count);
  library = dispatch(library, { type: "save.load", saveId: library.saves[0].id }).library;
  assert.equal(library.sessions[0].messages.length, count);
});

test("从头开始清掉这场进度，存档和人设还在；读档会回到那座舞台", () => {
  let library = dispatch(createSeedLibrary(), { type: "stage.select", stageId: "stage-neon" }).library;
  library = dispatch(library, { type: "session.send", text: "一句" }).library;
  library = dispatch(library, { type: "character.update", id: "npc-chutang", fields: { summary: "改过的向导" } }).library;
  assert.equal(library.characters.find((item) => item.id === "npc-chutang").summary, "改过的向导");
  const saved = dispatch(library, { type: "save.create", name: "霓穹开场" });
  assert.match(saved.message, /已存档/);
  library = saved.library;
  const begun = dispatch(library, { type: "run.begin" });
  assert.match(begun.message, /从头准备/);
  library = begun.library;
  assert.equal(library.stagePicked, false);
  assert.equal(library.activeStageId, "");
  assert.equal(library.sessions[0].npcIds.length, 0);
  assert.equal(library.sessions[0].worldBookId, "");
  assert.equal(library.saves.length, 1);
  assert.equal(library.characters.find((item) => item.id === "npc-chutang").summary, "改过的向导");
  const loaded = dispatch(library, { type: "save.load", saveId: library.saves[0].id });
  assert.match(loaded.message, /已读档/);
  library = loaded.library;
  assert.equal(library.stagePicked, true);
  assert.equal(library.activeStageId, "stage-neon");
  assert.equal(library.sessions[0].worldBookId, "book-neon");
  assert.deepEqual(library.sessions[0].npcIds, ["npc-chutang", "npc-xingxuan", "npc-xuejing"]);

  const restarted = dispatch(library, { type: "run.start", stageId: "stage-azure" });
  assert.match(restarted.message, /舞台已选定/);
  assert.equal(restarted.library.activeStageId, "stage-azure");
  assert.equal(restarted.library.sessions[0].worldBookId, "book-azure");
  assert.equal(restarted.library.saves.length, 1);
  assert.equal(
    restarted.library.sessions[0].messages.some((item) => item.text.includes("这句不该") || item.text.includes("一句")),
    false,
  );
});

test("保存人设和世界书会明确告诉你写成了", () => {
  const seeded = createSeedLibrary();
  const card = dispatch(seeded, {
    type: "character.update",
    id: "player-guest",
    fields: { name: "旅人", summary: "还是旅人" },
  });
  assert.match(card.message, /人设已保存/);
  const book = dispatch(card.library, {
    type: "world.update",
    worldBookId: "book-azure",
    name: "青玄界",
    summary: "补了一句",
  });
  assert.match(book.message, /世界书已保存/);
  assert.equal(book.library.worldBooks.find((item) => item.id === "book-azure").summary, "补了一句");
});

test("剧情包占位导出含前文提要，导入只登记", () => {
  const picked = dispatch(createSeedLibrary(), { type: "stage.select", stageId: "stage-azure" }).library;
  const exported = dispatch(picked, { type: "transfer.export", kind: "story" });
  assert.match(exported.download.body.priorSummary, /前文提要/);
  assert.match(exported.download.body.note, /占位/);
  assert.equal(exported.download.body.worldBooks.length, 3);
  const imported = dispatch(exported.library, {
    type: "transfer.import",
    kind: "characters",
    filename: "friend-card.json",
  });
  assert.match(imported.message, /只登记/);
  assert.equal(imported.library.characters.length, picked.characters.length);
});

test("空着的云端钥匙不会把已保存的钥匙擦掉", () => {
  let library = createSeedLibrary();
  library.model.cloudApiKey = "secret-key";
  library = dispatch(library, { type: "model.update", cloudApiKey: "", localModel: "demo" }).library;
  assert.equal(library.model.cloudApiKey, "secret-key");
  assert.equal(library.model.localModel, "demo");
});

test("一个云端接口最多绑三位", () => {
  let library = dispatch(createSeedLibrary(), {
    type: "model.updateSlot",
    slotId: "slot-deepseek",
    characterIds: ["npc-chutang", "npc-xingxuan"],
  }).library;
  assert.deepEqual(library.model.cloudSlots[0].characterIds, ["npc-chutang", "npc-xingxuan"]);
  assert.throws(
    () =>
      dispatch(library, {
        type: "model.updateSlot",
        slotId: "slot-qwen",
        characterIds: ["npc-nuanli", "npc-yuetong", "npc-qingyan", "npc-xingxuan"],
      }),
    /最多绑三位/,
  );
  library.model.cloudSlots[0].apiKey = "slot-secret";
  library = dispatch(library, { type: "model.updateSlot", slotId: "slot-deepseek", apiKey: "" }).library;
  assert.equal(library.model.cloudSlots[0].apiKey, "slot-secret");
});

test("本机连上后的句子固定，下次打开会提醒再测", () => {
  let library = dispatch(createSeedLibrary(), {
    type: "model.recordProbe",
    ok: true,
    message: LOCAL_CONNECTED_NOTE,
  }).library;
  assert.equal(library.model.localProbe.message, "连上了。这一版还不会用它来演戏，只确认路是通的。");
  assert.equal(library.model.remindRetest, false);
  library = armModelRetest(library);
  assert.equal(library.model.remindRetest, true);
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

test("前置检查不拦舞台，未确认免责声明不能结束引导", () => {
  const ready = describePrerequisites({ ollamaReachable: true });
  const quiet = describePrerequisites({ ollamaReachable: false });
  assert.match(ready.node, /Node\.js 已经在跑/);
  assert.match(quiet.ollama, /不着急/);
  assert.throws(
    () => dispatch(createSeedLibrary(), { type: "guide.complete", disclaimerAccepted: false }),
    /免责声明/,
  );
  const done = dispatch(createSeedLibrary(), { type: "guide.complete", disclaimerAccepted: true }).library;
  assert.equal(done.guide.completed, true);
});

test("旧的单本世界书会迁到三座舞台，并留下引导和钥匙", () => {
  const next = migrateLibrary({
    worldBook: { id: "book-main", name: "空台" },
    guide: { completed: true, disclaimerAccepted: true, completedAt: "2026-10-09T00:00:00.000Z" },
    model: { cloudApiKey: "kept", localModel: "demo-local", provider: "local" },
  });
  assert.equal(next.worldBooks.length, 3);
  assert.equal(next.stagePicked, false);
  assert.equal(next.guide.completed, true);
  assert.equal(next.model.cloudApiKey, "kept");
  assert.equal(next.model.localModel, "demo-local");
});

test("立绘大小默认是大，对话框默认是矮，并且会留下来", () => {
  const seeded = createSeedLibrary();
  assert.equal(seeded.settings.spriteScale, "large");
  assert.equal(seeded.settings.dialogScale, "short");

  const smaller = dispatch(seeded, { type: "settings.update", spriteScale: "small" });
  assert.equal(smaller.library.settings.spriteScale, "small");
  assert.equal(smaller.library.settings.dialogScale, "short");
  assert.match(smaller.message, /立绘大小已留在这台电脑上/);

  const taller = dispatch(smaller.library, { type: "settings.update", dialogScale: "tall" });
  assert.equal(taller.library.settings.dialogScale, "tall");
  assert.equal(taller.library.settings.spriteScale, "small");

  assert.throws(() => dispatch(seeded, { type: "settings.update", spriteScale: "huge" }), /小、中或大/);
  assert.throws(() => dispatch(seeded, { type: "settings.update", dialogScale: "giant" }), /矮、中或高/);

  const started = dispatch(taller.library, { type: "stage.select", stageId: "stage-frost" }).library;
  const saved = dispatch(started, { type: "save.create", name: "大小之前" }).library;
  const changed = dispatch(saved, { type: "settings.update", spriteScale: "medium" }).library;
  const loaded = dispatch(changed, { type: "save.load", saveId: changed.saves[0].id }).library;
  assert.equal(loaded.settings.spriteScale, "medium");
  assert.equal(loaded.settings.dialogScale, "tall");

  const restarted = dispatch(loaded, { type: "run.start", stageId: "stage-azure" }).library;
  assert.equal(restarted.settings.spriteScale, "medium");
  assert.equal(restarted.settings.dialogScale, "tall");
});

test("旧资料库补上显示偏好，不冲掉已经写好的舞台", () => {
  const kept = {
    revision: 2,
    stagePicked: true,
    activeStageId: "stage-frost",
    stages: [{ id: "stage-frost", name: "霜印王国" }],
    worldBooks: [{ id: "book-frost", name: "保留这本书" }],
  };
  const filled = migrateLibrary(kept);
  assert.notEqual(filled, kept);
  assert.equal(filled.worldBooks[0].name, "保留这本书");
  assert.equal(filled.stagePicked, true);
  assert.equal(filled.settings.spriteScale, "large");
  assert.equal(filled.settings.dialogScale, "short");

  const chosen = {
    ...kept,
    settings: { spriteScale: "medium", dialogScale: "tall", note: "留着" },
  };
  const same = migrateLibrary(chosen);
  assert.equal(same, chosen);
  assert.equal(same.settings.spriteScale, "medium");
  assert.equal(same.settings.dialogScale, "tall");
  assert.equal(same.settings.note, "留着");

  const broken = migrateLibrary({ ...kept, settings: { spriteScale: "nope" } });
  assert.equal(broken.settings.spriteScale, "large");
  assert.equal(broken.settings.dialogScale, "short");
  assert.equal(broken.worldBooks[0].name, "保留这本书");
});

test("种子文件与开局数据一致", () => {
  const disk = JSON.parse(fs.readFileSync(new URL("../../data/library.seed.json", import.meta.url), "utf8"));
  assert.deepEqual(disk, createSeedLibrary());
});
