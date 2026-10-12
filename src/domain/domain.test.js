import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { adviseFromVram, describePrerequisites } from "./guide.js";
import { ACTION_SLOTS, emptyPerformanceArt, EXPRESSION_SLOTS, LINE_COLOR_PALETTE } from "./characters.js";
import { createSeedLibrary, migrateLibrary } from "./library.js";
import {
  LOCAL_CONNECTED_NOTE,
  LOCAL_KEEP_ALIVE_PIN,
  actingTarget,
  armModelRetest,
  localChatKeepAlive,
  localRouteProbe,
  shouldReleaseLocalWarm,
} from "./models.js";
import { resolveScene } from "./scene.js";
import { buildActingMessages, commitNpcReply, dispatch, finishCoolDown, planSpeakers, sessionForm, toPublicLibrary } from "./index.js";
import { resolveUiSkin } from "./settings.js";

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
  assert.equal(astrid.thinkingFile, "");
  assert.equal(nuanli.thinkingFile, "");
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

test("地点下拉只列当前世界书，选中的地点一定在这份名单里", () => {
  const azure = dispatch(createSeedLibrary(), { type: "stage.select", stageId: "stage-azure" }).library;
  const scene = toPublicLibrary(azure).view.scene;
  assert.equal(scene.locationId, "loc-azure-town");
  assert.equal(scene.locationName, "城镇");
  assert.deepEqual(
    scene.locations.map((item) => item.name),
    ["城镇", "村庄", "皇宫"],
  );
  assert.equal(
    scene.locations.some((item) => item.id === scene.locationId),
    true,
  );

  const palace = dispatch(azure, { type: "session.setLocation", locationId: "loc-azure-palace" }).library;
  assert.equal(palace.sessions[0].state.locationId, "loc-azure-palace");
  assert.equal(toPublicLibrary(palace).view.scene.locationName, "皇宫");

  const neon = dispatch(palace, { type: "stage.select", stageId: "stage-neon" }).library;
  const neonScene = toPublicLibrary(neon).view.scene;
  assert.equal(neonScene.locationId, "loc-neon-center");
  assert.equal(neonScene.locationName, "城市中心");
  assert.equal(
    neonScene.locations.some((item) => item.id === "loc-azure-palace"),
    false,
  );
  assert.equal(
    neonScene.locations.some((item) => item.id === neonScene.locationId),
    true,
  );

  const stale = JSON.parse(JSON.stringify(azure));
  stale.sessions[0].state.locationId = "loc-frost-town";
  stale.sessions[0].state.activeTriggerId = "trig-frost-gate";
  const migrated = migrateLibrary(stale);
  assert.notEqual(migrated, stale);
  assert.equal(stale.sessions[0].state.locationId, "loc-frost-town");
  assert.equal(migrated.sessions[0].state.locationId, "loc-azure-town");
  assert.equal(migrated.sessions[0].state.activeTriggerId, "");
  const repaired = toPublicLibrary(stale);
  assert.equal(repaired.sessions[0].state.locationId, "loc-azure-town");
  assert.equal(repaired.view.scene.locationId, "loc-azure-town");
  assert.equal(repaired.view.scene.locationName, "城镇");
  assert.equal(
    repaired.view.scene.locations.some((item) => item.id === repaired.view.scene.locationId),
    true,
  );
  assert.equal(
    repaired.view.scene.locations.some((item) => item.id === "loc-frost-town"),
    false,
  );

  const blank = JSON.parse(JSON.stringify(azure));
  blank.sessions[0].state.locationId = "";
  blank.sessions[0].state.timeOfDay = "night";
  const filled = migrateLibrary(blank);
  assert.equal(filled.sessions[0].state.locationId, "loc-azure-town");
  assert.equal(filled.sessions[0].state.timeOfDay, "night");

  const village = JSON.parse(JSON.stringify(azure));
  village.sessions[0].state.locationId = "loc-azure-village";
  assert.equal(migrateLibrary(village).sessions[0].state.locationId, "loc-azure-village");
  assert.equal(toPublicLibrary(village).view.scene.locationName, "村庄");

  const dirty = JSON.parse(JSON.stringify(azure));
  dirty.sessions[0].state.locationId = "missing-place";
  dirty.sessions[0].state.activeTriggerId = "trig-azure-book";
  const afterMode = dispatch(dirty, { type: "session.setMode", mode: "direct" }).library;
  assert.equal(afterMode.sessions[0].speakMode, "direct");
  assert.equal(afterMode.sessions[0].state.locationId, "loc-azure-town");
  assert.equal(afterMode.sessions[0].state.activeTriggerId, "");
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

test("轮流只安排下一位，写回台词后光标前进", () => {
  let library = dispatch(createSeedLibrary(), { type: "stage.select", stageId: "stage-frost" }).library;
  library = dispatch(library, { type: "session.send", text: "开场" }).library;
  let plan = planSpeakers(library);
  assert.equal(plan.mode, "turn");
  assert.equal(plan.speakers.length, 1);
  assert.equal(plan.speakers[0].name, "Astrid");
  assert.equal(
    library.sessions[0].messages.some((item) => item.kind === "npc"),
    false,
  );
  library = commitNpcReply(library, plan.speakers[0].id, "Astrid：我在门边。");
  assert.equal(library.sessions[0].messages.at(-1).speakerName, "Astrid");
  assert.equal(library.sessions[0].messages.at(-1).text, "我在门边。");
  assert.equal(library.sessions[0].turnCursor, 1);
  library = dispatch(library, { type: "session.send", text: "下一句" }).library;
  plan = planSpeakers(library);
  assert.equal(plan.speakers[0].name, "Sigrid");
});

test("抢话最多两句后冷静，点名才安排回应", () => {
  let library = dispatch(createSeedLibrary(), { type: "stage.select", stageId: "stage-frost" }).library;
  library = dispatch(library, { type: "session.setMode", mode: "interrupt" }).library;
  library = dispatch(library, { type: "session.send", text: "我饿了" }).library;
  const plan = planSpeakers(library);
  assert.equal(plan.coolDown, true);
  assert.equal(plan.speakers.length, 2);
  assert.equal(plan.speakers[0].name, "Astrid");
  assert.equal(plan.speakers[1].name, "Sigrid");
  library = commitNpcReply(library, plan.speakers[0].id, "炉火边还有面包。");
  library = commitNpcReply(library, plan.speakers[1].id, "那就先吃这个，别的明天再说。");
  library = finishCoolDown(library);
  assert.equal(library.sessions[0].messages.at(-1).kind, "system");
  assert.match(library.sessions[0].messages.at(-1).text, /冷静/);
  assert.equal(library.sessions[0].messages.filter((item) => item.kind === "npc").length, 2);

  library = dispatch(library, { type: "session.setMode", mode: "direct" }).library;
  library = dispatch(library, { type: "session.send", text: "大家好" }).library;
  assert.equal(library.sessions[0].messages.at(-1).kind, "system");
  assert.equal(planSpeakers(library).speakers.length, 0);
  library = dispatch(library, { type: "session.send", text: "Elin，看这边" }).library;
  const named = planSpeakers(library);
  assert.equal(named.speakers.length, 1);
  assert.equal(named.speakers[0].name, "Elin");
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

test("每人设记住台上的位置和放大，缺了就居中并略放大", () => {
  const seeded = createSeedLibrary();
  for (const person of seeded.characters) {
    assert.deepEqual(person.stagePose, { x: 0, y: 0, scale: 1.15 });
  }

  const made = dispatch(seeded, { type: "character.create", kind: "npc" });
  assert.deepEqual(made.library.characters.at(-1).stagePose, { x: 0, y: 0, scale: 1.15 });
  const player = dispatch(seeded, { type: "character.create", kind: "player" }).library.characters.at(-1);
  assert.equal(player.kind, "player");
  assert.deepEqual(player.stagePose, { x: 0, y: 0, scale: 1.15 });

  const saved = dispatch(seeded, {
    type: "character.update",
    id: "npc-chutang",
    fields: { stagePose: { x: -20, y: 6, scale: 1.6 } },
  });
  assert.match(saved.message, /人设已保存/);
  assert.deepEqual(saved.library.characters.find((item) => item.id === "npc-chutang").stagePose, {
    x: -20,
    y: 6,
    scale: 1.6,
  });
  assert.deepEqual(saved.library.characters.find((item) => item.id === "npc-xingxuan").stagePose, {
    x: 0,
    y: 0,
    scale: 1.15,
  });

  const clamped = dispatch(seeded, {
    type: "character.update",
    id: "player-guest",
    fields: { stagePose: { x: 999, y: -999, scale: 9 } },
  });
  assert.deepEqual(clamped.library.characters.find((item) => item.id === "player-guest").stagePose, {
    x: 100,
    y: -100,
    scale: 2.4,
  });
  const edge = dispatch(seeded, {
    type: "character.update",
    id: "npc-xingxuan",
    fields: { stagePose: { x: -100, y: 100, scale: 1 } },
  });
  assert.deepEqual(edge.library.characters.find((item) => item.id === "npc-xingxuan").stagePose, {
    x: -100,
    y: 100,
    scale: 1,
  });

  const partial = dispatch(saved.library, {
    type: "character.update",
    id: "npc-chutang",
    fields: { fullBodyFile: "assets/defaults/characters/女/现代/初棠.png", stagePose: { scale: 0.1 } },
  });
  const chutang = partial.library.characters.find((item) => item.id === "npc-chutang");
  assert.equal(chutang.summary.length > 0, true);
  assert.equal(chutang.fullBodyFile, "assets/defaults/characters/女/现代/初棠.png");
  assert.deepEqual(chutang.stagePose, { x: -20, y: 6, scale: 0.4 });

  const textOnly = dispatch(partial.library, {
    type: "character.update",
    id: "npc-chutang",
    fields: { summary: "仍在" },
  });
  assert.equal(textOnly.library.characters.find((item) => item.id === "npc-chutang").summary, "仍在");
  assert.deepEqual(textOnly.library.characters.find((item) => item.id === "npc-chutang").stagePose, {
    x: -20,
    y: 6,
    scale: 0.4,
  });

  const old = {
    revision: 2,
    stagePicked: true,
    activeStageId: "stage-frost",
    stages: [{ id: "stage-frost" }],
    worldBooks: [{ id: "book-frost" }],
    settings: { spriteScale: "small", dialogScale: "short", uiSkin: "classic", uiSkinMode: "auto" },
    characters: [
      { id: "npc-astrid", kind: "npc", name: "Astrid" },
      { id: "npc-sigrid", kind: "npc", name: "Sigrid", stagePose: { x: 12, y: -3, scale: 1.4 } },
    ],
  };
  const migrated = migrateLibrary(old);
  assert.notEqual(migrated, old);
  assert.deepEqual(migrated.characters[0].stagePose, { x: 0, y: 0, scale: 1.15 });
  assert.deepEqual(migrated.characters[1].stagePose, { x: 12, y: -3, scale: 1.4 });
  assert.equal(migrated.settings.spriteScale, "small");
  assert.equal(migrated.stagePicked, true);

  const messy = migrateLibrary({
    ...old,
    characters: [{ id: "npc-astrid", stagePose: { x: "nope", y: 4, scale: 80, extra: true } }],
  });
  assert.deepEqual(messy.characters[0].stagePose, { x: 0, y: 4, scale: 2.4 });

  const stable = {
    revision: 2,
    stagePicked: true,
    activeStageId: "stage-frost",
    stages: [{ id: "stage-frost" }],
    worldBooks: [{ id: "book-frost" }],
    settings: { spriteScale: "large", dialogScale: "short", uiSkin: "classic", uiSkinMode: "auto" },
    characters: [
      {
        id: "npc-astrid",
        stagePose: { x: 0, y: 0, scale: 1.15 },
        thinkingFile: "",
        lineColor: "#f0b7a4",
        ...emptyPerformanceArt(),
      },
    ],
  };
  assert.equal(migrateLibrary(stable), stable);

  const spec = toPublicLibrary(seeded).view.stagePose;
  assert.deepEqual(spec.defaults, { x: 0, y: 0, scale: 1.15 });
  assert.deepEqual(spec.limits.x, { min: -100, max: 100, step: 1 });
  assert.deepEqual(spec.limits.y, { min: -100, max: 100, step: 1 });
  const keptEdge = migrateLibrary({
    ...old,
    characters: [{ id: "npc-astrid", stagePose: { x: 80, y: -30, scale: 1.15 } }],
  });
  assert.deepEqual(keptEdge.characters[0].stagePose, { x: 80, y: -30, scale: 1.15 });
  const widened = migrateLibrary({
    ...old,
    characters: [{ id: "npc-astrid", stagePose: { x: 120, y: -140, scale: 1.15 } }],
  });
  assert.deepEqual(widened.characters[0].stagePose, { x: 100, y: -100, scale: 1.15 });
  assert.deepEqual(spec.limits.scale, { min: 0.4, max: 2.4, step: 0.05 });
});

test("思考立绘跟着人设保存，旧档缺了就是空", () => {
  const seeded = createSeedLibrary();
  for (const person of seeded.characters) assert.equal(person.thinkingFile, "");

  const made = dispatch(seeded, { type: "character.create", kind: "npc" });
  assert.equal(made.library.characters.at(-1).thinkingFile, "");
  const player = dispatch(seeded, { type: "character.create", kind: "player" }).library.characters.at(-1);
  assert.equal(player.thinkingFile, "");

  const saved = dispatch(seeded, {
    type: "character.update",
    id: "npc-nuanli",
    fields: { thinkingFile: " data/media/img-think.png " },
  });
  const nuanli = saved.library.characters.find((item) => item.id === "npc-nuanli");
  assert.equal(nuanli.thinkingFile, "data/media/img-think.png");
  assert.equal(nuanli.fullBodyFile, "assets/defaults/characters/女/东方/暖璃.png");
  assert.equal(saved.library.characters.find((item) => item.id === "npc-yuetong").thinkingFile, "");

  const kept = dispatch(saved.library, {
    type: "character.update",
    id: "npc-nuanli",
    fields: { summary: "仍在" },
  });
  const keptNuanli = kept.library.characters.find((item) => item.id === "npc-nuanli");
  assert.equal(keptNuanli.summary, "仍在");
  assert.equal(keptNuanli.thinkingFile, "data/media/img-think.png");

  const published = toPublicLibrary(kept.library);
  assert.equal(published.characters.find((item) => item.id === "npc-nuanli").thinkingFile, "data/media/img-think.png");
  const exported = dispatch(kept.library, { type: "transfer.export", kind: "characters" });
  assert.equal(
    exported.download.body.characters.find((item) => item.id === "npc-nuanli").thinkingFile,
    "data/media/img-think.png",
  );

  const old = {
    revision: 2,
    stagePicked: true,
    activeStageId: "stage-frost",
    stages: [{ id: "stage-frost" }],
    worldBooks: [{ id: "book-frost" }],
    settings: { spriteScale: "large", dialogScale: "short", uiSkin: "classic", uiSkinMode: "auto" },
    characters: [
      { id: "npc-astrid", kind: "npc", name: "Astrid", fullBodyFile: "assets/defaults/characters/女/北欧/Astrid.png" },
      { id: "npc-sigrid", thinkingFile: "  data/media/sigrid-think.png  " },
      { id: "npc-elin", thinkingFile: 3 },
    ],
  };
  const migrated = migrateLibrary(old);
  assert.equal(migrated.characters[0].thinkingFile, "");
  assert.equal(migrated.characters[0].fullBodyFile, "assets/defaults/characters/女/北欧/Astrid.png");
  assert.equal(migrated.characters[1].thinkingFile, "data/media/sigrid-think.png");
  assert.equal(migrated.characters[2].thinkingFile, "");
});

test("台词颜色记在人设上，旧档没有就按色板补上", () => {
  const seeded = createSeedLibrary();
  assert.deepEqual(
    seeded.characters.map((item) => item.lineColor),
    LINE_COLOR_PALETTE.slice(0, seeded.characters.length),
  );
  assert.equal(new Set(seeded.characters.map((item) => item.lineColor)).size, seeded.characters.length);
  const migratedSeed = migrateLibrary(seeded);
  assert.equal(migratedSeed, seeded);

  const made = dispatch(seeded, { type: "character.create", kind: "npc" });
  const newbie = made.library.characters.at(-1);
  assert.equal(LINE_COLOR_PALETTE.includes(newbie.lineColor), true);
  assert.equal(seeded.characters.some((item) => item.lineColor === newbie.lineColor), false);
  const player = dispatch(made.library, { type: "character.create", kind: "player" }).library.characters.at(-1);
  assert.equal(LINE_COLOR_PALETTE.includes(player.lineColor), true);
  assert.notEqual(player.lineColor, newbie.lineColor);

  const saved = dispatch(seeded, {
    type: "character.update",
    id: "npc-astrid",
    fields: { lineColor: " #F0B7A4 " },
  });
  assert.equal(saved.library.characters.find((item) => item.id === "npc-astrid").lineColor, "#f0b7a4");
  const short = dispatch(seeded, {
    type: "character.update",
    id: "npc-elin",
    fields: { lineColor: "abc" },
  });
  assert.equal(short.library.characters.find((item) => item.id === "npc-elin").lineColor, "#aabbcc");
  assert.throws(
    () => dispatch(seeded, { type: "character.update", id: "npc-elin", fields: { lineColor: "红色" } }),
    /台词颜色/,
  );
  const kept = dispatch(saved.library, {
    type: "character.update",
    id: "npc-astrid",
    fields: { summary: "仍在" },
  });
  const keptAstrid = kept.library.characters.find((item) => item.id === "npc-astrid");
  assert.equal(keptAstrid.summary, "仍在");
  assert.equal(keptAstrid.lineColor, "#f0b7a4");

  const old = {
    revision: 2,
    stagePicked: true,
    activeStageId: "stage-frost",
    stages: [{ id: "stage-frost" }],
    worldBooks: [{ id: "book-frost" }],
    settings: { spriteScale: "large", dialogScale: "short", uiSkin: "classic", uiSkinMode: "auto" },
    characters: [
      { id: "npc-astrid", kind: "npc", name: "Astrid" },
      { id: "npc-sigrid", name: "Sigrid", lineColor: "#ABCDEF" },
      { id: "npc-elin", lineColor: "nope" },
      { id: "player-guest", kind: "player", lineColor: "#abc" },
      { id: "npc-nuanli", lineColor: "#e6c98a" },
      { id: "npc-yuetong", lineColor: "#e6c98a" },
    ],
  };
  const migrated = migrateLibrary(old);
  assert.notEqual(migrated, old);
  const [astrid, sigrid, elin, guest, nuanli, yuetong] = migrated.characters;
  assert.equal(LINE_COLOR_PALETTE.includes(astrid.lineColor), true);
  assert.equal(sigrid.lineColor, "#abcdef");
  assert.equal(LINE_COLOR_PALETTE.includes(elin.lineColor), true);
  assert.notEqual(astrid.lineColor, elin.lineColor);
  assert.notEqual(astrid.lineColor, "#abcdef");
  assert.notEqual(elin.lineColor, "#abcdef");
  assert.equal(guest.lineColor, "#aabbcc");
  assert.equal(nuanli.lineColor, "#e6c98a");
  assert.equal(yuetong.lineColor, "#e6c98a");
  assert.equal(migrateLibrary(migrated), migrated);

  const published = toPublicLibrary(saved.library);
  assert.equal(published.characters.find((item) => item.id === "npc-astrid").lineColor, "#f0b7a4");
  assert.deepEqual(published.view.lineColorPalette, LINE_COLOR_PALETTE);
});

test("表情和动作按固定编号记下，旧档缺了就是空", () => {
  const expressionIds = EXPRESSION_SLOTS.map((slot) => slot.id);
  const actionIds = ACTION_SLOTS.map((slot) => slot.id);
  assert.deepEqual(expressionIds, [
    "expr_neutral",
    "expr_smile",
    "expr_laugh",
    "expr_sad",
    "expr_angry",
    "expr_shy",
    "expr_surprised",
    "expr_think",
    "expr_pain",
    "expr_love",
  ]);
  assert.deepEqual(actionIds, [
    "pose_stand",
    "pose_sit",
    "pose_walk",
    "pose_run",
    "pose_wave",
    "pose_point",
    "pose_cross_arms",
    "pose_cover_face",
    "pose_kneel",
    "pose_lie",
    "pose_fight",
  ]);

  const seeded = createSeedLibrary();
  for (const person of seeded.characters) {
    assert.deepEqual(Object.keys(person.expressions), expressionIds);
    assert.deepEqual(Object.values(person.expressions), expressionIds.map(() => ""));
    assert.deepEqual(Object.keys(person.actions), actionIds);
    assert.deepEqual(Object.values(person.actions), actionIds.map(() => ""));
  }

  const made = dispatch(seeded, { type: "character.create", kind: "npc" }).library.characters.at(-1);
  assert.deepEqual(Object.keys(made.expressions), expressionIds);
  assert.deepEqual(Object.values(made.actions), actionIds.map(() => ""));
  const player = dispatch(seeded, { type: "character.create", kind: "player" }).library.characters.at(-1);
  assert.deepEqual(Object.keys(player.expressions), expressionIds);

  const saved = dispatch(seeded, {
    type: "character.update",
    id: "npc-nuanli",
    fields: {
      expressions: {
        expr_smile: " assets/characters/暖璃/表情/expr_smile.png ",
        expr_nope: "不要这个键",
        expr_sad: 4,
      },
    },
  });
  const nuanli = saved.library.characters.find((item) => item.id === "npc-nuanli");
  assert.equal(nuanli.expressions.expr_smile, "assets/characters/暖璃/表情/expr_smile.png");
  assert.equal(nuanli.expressions.expr_sad, "");
  assert.equal(nuanli.expressions.expr_neutral, "");
  assert.equal("expr_nope" in nuanli.expressions, false);
  assert.equal(nuanli.fullBodyFile, "assets/defaults/characters/女/东方/暖璃.png");
  assert.deepEqual(nuanli.actions, emptyPerformanceArt().actions);

  const added = dispatch(saved.library, {
    type: "character.update",
    id: "npc-nuanli",
    fields: { actions: { pose_wave: " assets/characters/暖璃/动作/pose_wave.png " }, summary: "仍在" },
  });
  const kept = added.library.characters.find((item) => item.id === "npc-nuanli");
  assert.equal(kept.summary, "仍在");
  assert.equal(kept.expressions.expr_smile, "assets/characters/暖璃/表情/expr_smile.png");
  assert.equal(kept.actions.pose_wave, "assets/characters/暖璃/动作/pose_wave.png");
  assert.equal(kept.actions.pose_stand, "");
  assert.equal(added.library.characters.find((item) => item.id === "npc-yuetong").expressions.expr_smile, "");

  const published = toPublicLibrary(added.library);
  assert.deepEqual(
    published.view.performance.expressions.map((slot) => slot.id),
    expressionIds,
  );
  assert.deepEqual(
    published.view.performance.actions.map((slot) => slot.id),
    actionIds,
  );
  assert.equal(published.view.performance.expressions[0].label, "中立");
  assert.equal(published.view.performance.actions[0].label, "站");
  const exported = dispatch(added.library, { type: "transfer.export", kind: "characters" });
  assert.equal(
    exported.download.body.characters.find((item) => item.id === "npc-nuanli").expressions.expr_smile,
    "assets/characters/暖璃/表情/expr_smile.png",
  );

  const old = {
    revision: 2,
    stagePicked: true,
    activeStageId: "stage-azure",
    stages: [{ id: "stage-azure" }],
    worldBooks: [{ id: "book-azure" }],
    settings: { spriteScale: "large", dialogScale: "short", uiSkin: "classic", uiSkinMode: "auto" },
    characters: [
      {
        id: "npc-nuanli",
        name: "暖璃",
        fullBodyFile: "assets/defaults/characters/女/东方/暖璃.png",
        expressions: { expr_smile: " assets/characters/暖璃/表情/expr_smile.jpg ", extra: "丢掉" },
      },
      { id: "npc-yuetong", actions: "不是表" },
    ],
  };
  const migrated = migrateLibrary(old);
  assert.equal(migrated.characters[0].fullBodyFile, "assets/defaults/characters/女/东方/暖璃.png");
  assert.equal(migrated.characters[0].expressions.expr_smile, "assets/characters/暖璃/表情/expr_smile.jpg");
  assert.equal(migrated.characters[0].expressions.expr_love, "");
  assert.equal("extra" in migrated.characters[0].expressions, false);
  assert.deepEqual(migrated.characters[0].actions, emptyPerformanceArt().actions);
  assert.deepEqual(migrated.characters[1].expressions, emptyPerformanceArt().expressions);
  assert.deepEqual(migrated.characters[1].actions, emptyPerformanceArt().actions);
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
    slotId: "slot-zhipu",
    characterIds: ["npc-chutang", "npc-xingxuan"],
  }).library;
  const zhipu = library.model.cloudSlots.find((item) => item.id === "slot-zhipu");
  assert.deepEqual(zhipu.characterIds, ["npc-chutang", "npc-xingxuan"]);
  assert.throws(
    () =>
      dispatch(library, {
        type: "model.updateSlot",
        slotId: "slot-qwen",
        characterIds: ["npc-nuanli", "npc-yuetong", "npc-qingyan", "npc-xingxuan"],
      }),
    /最多绑三位/,
  );
  zhipu.apiKey = "slot-secret";
  library = dispatch(library, { type: "model.updateSlot", slotId: "slot-zhipu", apiKey: "" }).library;
  assert.equal(library.model.cloudSlots.find((item) => item.id === "slot-zhipu").apiKey, "slot-secret");
});

test("本机连上后的句子固定，下次打开会提醒再测", () => {
  let library = dispatch(createSeedLibrary(), {
    type: "model.recordProbe",
    ok: true,
    message: LOCAL_CONNECTED_NOTE,
    models: ["qwen-local"],
  }).library;
  assert.equal(library.model.localProbe.message, LOCAL_CONNECTED_NOTE);
  assert.match(LOCAL_CONNECTED_NOTE, /不附带模型/);
  assert.equal(library.model.remindRetest, false);
  assert.deepEqual(toPublicLibrary(library).model.localModels, ["qwen-local"]);
  library = armModelRetest(library);
  assert.equal(library.model.remindRetest, true);
});

test("提示词带上世界书和刚说的话，钥匙不进界面", () => {
  let library = dispatch(createSeedLibrary(), { type: "stage.select", stageId: "stage-frost" }).library;
  library = dispatch(library, { type: "session.send", text: "霜税还没结" }).library;
  const messages = buildActingMessages(library, "npc-astrid", { mode: "turn", index: 0, total: 1 });
  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /霜印王国/);
  assert.match(messages[0].content, /禁忌/);
  assert.match(messages[0].content, /霜税还没结/);
  assert.match(messages[0].content, /Astrid/);
  assert.match(messages[0].content, /严格轮流/);
  assert.match(messages[0].content, /expr_neutral/);
  assert.match(messages[0].content, /expr_love/);
  assert.match(messages[0].content, /pose_stand/);
  assert.match(messages[0].content, /pose_fight/);
  assert.match(messages[0].content, /不要写句式样例/);
  assert.match(messages[0].content, /思考标签/);
  assert.equal(/句式样例\s*[：:]/.test(messages[0].content), false);
  assert.equal(messages[1].content.includes("句式样例"), false);
  assert.match(messages[1].content, /【表情编号】/);
  assert.match(messages[1].content, /【动作编号】/);
  library = dispatch(library, {
    type: "model.update",
    provider: "qwen",
    qwenModel: "qwen-plus",
    qwenApiKey: "secret-qwen",
  }).library;
  const target = actingTarget(library);
  assert.equal(target.ok, true);
  assert.equal(target.label, "通义千问");
  assert.equal(target.model, "qwen-plus");
  assert.equal(target.apiKey, "secret-qwen");
  assert.equal(target.baseUrl, "https://dashscope.aliyuncs.com/compatible-mode/v1");
  const published = JSON.stringify(toPublicLibrary(library));
  assert.equal(published.includes("secret-qwen"), false);
  assert.equal(toPublicLibrary(library).model.qwen.apiKeySet, true);
  const missing = actingTarget(dispatch(createSeedLibrary(), { type: "model.update", provider: "zhipu", zhipuModel: "glm-4-flash" }).library);
  assert.equal(missing.ok, false);
  assert.match(missing.message, /智谱/);
  assert.equal(JSON.stringify(missing).includes("apiKey"), false);
});

test("清掉本机模型后自动改用另一家，不再逼着去选本机", () => {
  let library = dispatch(createSeedLibrary(), {
    type: "model.update",
    routeMode: "auto",
    provider: "local",
    localModel: "",
    cloudBaseUrl: "https://api.deepseek.com/v1",
    cloudModel: "deepseek-chat",
    cloudApiKey: "dk-secret",
  }).library;
  const target = actingTarget(library);
  assert.equal(target.ok, true);
  assert.equal(target.provider, "cloud");
  assert.equal(target.baseUrl, "https://api.deepseek.com/v1");
  assert.equal(target.model, "deepseek-chat");
  assert.equal(target.apiKey, "dk-secret");
  assert.equal(target.label, "DeepSeek");
  assert.match(target.notice, /改用云端「DeepSeek」/);
  assert.equal(target.notice.includes("读取本机模型"), false);
  assert.equal(target.notice.includes("还没有选择本机模型"), false);
  const hinted = toPublicLibrary(library).model;
  assert.equal(hinted.routeMode, "auto");
  assert.match(hinted.routeHint, /DeepSeek/);
  assert.equal(JSON.stringify(hinted).includes("dk-secret"), false);

  const kept = dispatch(library, { type: "model.update", localModel: "qwen-local" }).library;
  assert.equal(actingTarget(kept).provider, "local");
  const down = actingTarget(kept, { localReachable: false, localReason: "unreachable" });
  assert.equal(down.label, "DeepSeek");
  assert.match(down.notice, /连不上/);
  const uninstalled = actingTarget(kept, { localReachable: false, localReason: "missing" });
  assert.match(uninstalled.notice, /没有这个模型/);

  const forced = dispatch(library, { type: "model.update", routeMode: "local", localModel: "" }).library;
  const blocked = actingTarget(forced);
  assert.equal(blocked.ok, false);
  assert.match(blocked.message, /读取本机模型/);

  const cloudOnly = dispatch(kept, { type: "model.update", routeMode: "cloud" }).library;
  const forcedCloud = actingTarget(cloudOnly, { localReachable: true });
  assert.equal(forcedCloud.provider, "cloud");
  assert.equal(forcedCloud.model, "deepseek-chat");
  assert.equal(forcedCloud.notice, undefined);

  const none = actingTarget(createSeedLibrary());
  assert.equal(none.ok, false);
  assert.match(none.message, /本机模型/);
  assert.equal(none.message.includes("读取本机模型"), false);
  assert.throws(() => dispatch(createSeedLibrary(), { type: "model.update", routeMode: "both" }), /自动/);
  const saved = dispatch(createSeedLibrary(), { type: "model.update", routeMode: "auto", provider: "local" });
  assert.match(saved.message, /自动接话/);
  assert.equal(localRouteProbe(createSeedLibrary()), null);
  assert.equal(localRouteProbe(kept).model, "qwen-local");
  assert.equal(localRouteProbe(cloudOnly), null);
});

test("自动时勾了智谱就用智谱，没勾就用另一家留下的接口", () => {
  let library = dispatch(createSeedLibrary(), {
    type: "model.update",
    routeMode: "auto",
    provider: "zhipu",
    localModel: "",
    zhipuModel: "glm-4-flash",
    zhipuApiKey: "zk",
    cloudBaseUrl: "https://api.deepseek.com",
    cloudModel: "deepseek-chat",
    cloudApiKey: "dk",
  }).library;
  const zhipu = actingTarget(library);
  assert.equal(zhipu.label, "智谱");
  assert.equal(zhipu.model, "glm-4-flash");
  assert.equal(zhipu.notice, undefined);

  library = dispatch(library, { type: "model.update", provider: "local" }).library;
  const extra = actingTarget(library);
  assert.equal(extra.label, "DeepSeek");
  assert.match(extra.notice, /还没有选模型/);

  const slotted = createSeedLibrary();
  slotted.model.localModel = "";
  slotted.model.cloudSlots.push({
    id: "slot-deepseek",
    label: "DeepSeek",
    vendor: "custom",
    baseUrl: "https://api.deepseek.com/v1",
    model: "DeepSeek-Flash",
    apiKey: "slot-dk",
    characterIds: [],
  });
  const fromSlot = actingTarget(slotted);
  assert.equal(fromSlot.ok, true);
  assert.equal(fromSlot.model, "DeepSeek-Flash");
  assert.equal(fromSlot.baseUrl, "https://api.deepseek.com/v1");
  assert.equal(fromSlot.apiKey, "slot-dk");
});

test("预热只留给本机，云端回退和空闲后会放开", () => {
  const seeded = createSeedLibrary();
  assert.equal(seeded.model.localKeepWarm, false);
  let library = dispatch(seeded, { type: "model.update", localKeepWarm: true, localModel: "qwen-local" }).library;
  assert.equal(library.model.localKeepWarm, true);
  library = dispatch(library, { type: "model.update", localModel: "qwen-local" }).library;
  assert.equal(library.model.localKeepWarm, true);
  const published = toPublicLibrary(library).model;
  assert.equal(published.localKeepWarm, true);
  assert.equal(published.localWarmIdleMinutes, 10);
  const localTarget = { provider: "local", model: "qwen-local", apiKey: "", baseUrl: "http://127.0.0.1:11434/v1" };
  assert.equal(localChatKeepAlive(library.model, localTarget), LOCAL_KEEP_ALIVE_PIN);
  assert.equal(
    localChatKeepAlive(library.model, {
      provider: "cloud",
      model: "deepseek-chat",
      apiKey: "dk",
      baseUrl: "https://api.deepseek.com/v1",
    }),
    null,
  );
  const cloudOnly = dispatch(library, { type: "model.update", routeMode: "cloud" }).library;
  assert.equal(localChatKeepAlive(cloudOnly.model, localTarget), null);
  const off = dispatch(library, { type: "model.update", localKeepWarm: false }).library;
  assert.equal(localChatKeepAlive(off.model, localTarget), null);
  assert.equal(shouldReleaseLocalWarm({ pinned: true, lastLocalUseAt: 1000, now: 1500, idleMs: 1000 }), false);
  assert.equal(shouldReleaseLocalWarm({ pinned: true, lastLocalUseAt: 1000, now: 2000, idleMs: 1000 }), true);
  assert.equal(shouldReleaseLocalWarm({ pinned: false, lastLocalUseAt: 1000, now: 9000, idleMs: 1000 }), false);

  const old = createSeedLibrary();
  delete old.model.localKeepWarm;
  const migrated = migrateLibrary(old);
  assert.equal(migrated.model.localKeepWarm, false);
});

test("保存本机和云端时，提示分开写，并且用对「仍」", () => {
  const local = dispatch(createSeedLibrary(), { type: "model.update", provider: "local", localModel: "qwen" });
  assert.equal(local.message, "本地模型已经加载到《剧戏台》中，《剧戏台》仍不会自带任何AI模型。");
  const cloud = dispatch(createSeedLibrary(), {
    type: "model.update",
    provider: "cloud",
    cloudBaseUrl: "https://api.deepseek.com",
    cloudModel: "DeepSeek-Flash",
    cloudApiKey: "dk",
  });
  assert.equal(cloud.message, "云端设置已经写在这台电脑上。《剧戏台》仍不会自带任何AI模型。");
  assert.equal(cloud.message.includes("本地模型已经加载"), false);
  const zhipu = dispatch(createSeedLibrary(), { type: "model.update", provider: "zhipu", zhipuModel: "glm-4-flash" });
  assert.match(zhipu.message, /云端设置已经写在这台电脑上/);
  assert.match(zhipu.message, /仍不会自带任何AI模型/);
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
  assert.ok(next.model.cloudSlots.some((item) => item.id === "slot-zhipu"));
  assert.ok(next.model.cloudSlots.some((item) => item.id === "slot-qwen"));
});

test("旧资料库会补上智谱栏，已经写下的千问钥匙还在", () => {
  const old = createSeedLibrary();
  old.model.localModels = undefined;
  old.model.cloudSlots = [
    {
      id: "slot-deepseek",
      label: "DeepSeek",
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-chat",
      apiKey: "dk",
      characterIds: [],
    },
    {
      id: "slot-qwen",
      label: "通义千问",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      model: "qwen-plus",
      apiKey: "qk",
      characterIds: ["npc-astrid"],
    },
  ];
  const next = migrateLibrary(old);
  assert.notEqual(next, old);
  assert.equal(next.model.cloudSlots.find((item) => item.id === "slot-qwen").apiKey, "qk");
  assert.equal(next.model.cloudSlots.find((item) => item.id === "slot-deepseek").apiKey, "dk");
  assert.equal(next.model.cloudSlots.find((item) => item.id === "slot-zhipu").baseUrl, "https://open.bigmodel.cn/api/paas/v4");
  assert.equal(old.model.cloudSlots.some((item) => item.id === "slot-zhipu"), false);
});

test("没写下接话方式时，选过云端的仍只用云端，本机则改成自动", () => {
  const cloudish = createSeedLibrary();
  delete cloudish.model.routeMode;
  cloudish.model.provider = "zhipu";
  const cloudNext = migrateLibrary(cloudish);
  assert.notEqual(cloudNext, cloudish);
  assert.equal(cloudNext.model.routeMode, "cloud");

  const localish = createSeedLibrary();
  delete localish.model.routeMode;
  const localNext = migrateLibrary(localish);
  assert.equal(localNext.model.routeMode, "auto");
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
  const filledSkin = migrateLibrary(chosen);
  assert.notEqual(filledSkin, chosen);
  assert.equal(filledSkin.settings.spriteScale, "medium");
  assert.equal(filledSkin.settings.dialogScale, "tall");
  assert.equal(filledSkin.settings.note, "留着");
  assert.equal(filledSkin.settings.uiSkin, "classic");
  assert.equal(filledSkin.settings.uiSkinMode, "auto");
  assert.equal(filledSkin.worldBooks[0].name, "保留这本书");
  assert.equal(filledSkin.stagePicked, true);

  const complete = {
    ...kept,
    settings: { spriteScale: "medium", dialogScale: "tall", uiSkin: "cyber", uiSkinMode: "manual", note: "留着" },
  };
  const same = migrateLibrary(complete);
  assert.equal(same, complete);
  assert.equal(same.settings.spriteScale, "medium");
  assert.equal(same.settings.dialogScale, "tall");
  assert.equal(same.settings.uiSkin, "cyber");
  assert.equal(same.settings.note, "留着");

  const broken = migrateLibrary({ ...kept, settings: { spriteScale: "nope" } });
  assert.equal(broken.settings.spriteScale, "large");
  assert.equal(broken.settings.dialogScale, "short");
  assert.equal(broken.settings.uiSkin, "classic");
  assert.equal(broken.settings.uiSkinMode, "auto");
  assert.equal(broken.worldBooks[0].name, "保留这本书");
});

test("皮肤默认跟随舞台，换舞台会换样子，手动选择会留下来", () => {
  const seeded = createSeedLibrary();
  assert.equal(seeded.settings.uiSkin, "classic");
  assert.equal(seeded.settings.uiSkinMode, "auto");
  assert.equal(resolveUiSkin(seeded), "classic");
  assert.equal(seeded.stages.find((item) => item.id === "stage-azure").skinId, "eastern");
  assert.equal(seeded.stages.find((item) => item.id === "stage-neon").skinId, "cyber");
  assert.equal(seeded.stages.find((item) => item.id === "stage-frost").skinId, "nordic");

  const azure = dispatch(seeded, { type: "stage.select", stageId: "stage-azure" }).library;
  assert.equal(resolveUiSkin(azure), "eastern");
  assert.equal(toPublicLibrary(azure).view.skin.id, "eastern");
  assert.equal(toPublicLibrary(azure).view.skin.mode, "auto");
  assert.equal(toPublicLibrary(azure).view.skins.length, 4);

  const neon = dispatch(seeded, { type: "stage.select", stageId: "stage-neon" }).library;
  assert.equal(resolveUiSkin(neon), "cyber");
  const frost = dispatch(seeded, { type: "stage.select", stageId: "stage-frost" }).library;
  assert.equal(resolveUiSkin(frost), "nordic");

  const manual = dispatch(frost, { type: "settings.update", uiSkin: "classic", uiSkinMode: "manual" });
  assert.equal(manual.library.settings.uiSkin, "classic");
  assert.equal(manual.library.settings.uiSkinMode, "manual");
  assert.equal(manual.library.settings.spriteScale, "large");
  assert.equal(manual.library.settings.dialogScale, "short");
  assert.match(manual.message, /皮肤已留在这台电脑上/);
  assert.equal(resolveUiSkin(manual.library), "classic");

  const switched = dispatch(manual.library, { type: "stage.select", stageId: "stage-azure" }).library;
  assert.equal(switched.activeStageId, "stage-azure");
  assert.equal(switched.settings.uiSkin, "classic");
  assert.equal(switched.settings.uiSkinMode, "manual");
  assert.equal(resolveUiSkin(switched), "classic");

  const onlySkin = dispatch(azure, { type: "settings.update", uiSkin: "nordic" }).library;
  assert.equal(onlySkin.settings.uiSkinMode, "manual");
  assert.equal(resolveUiSkin(onlySkin), "nordic");

  const again = dispatch(switched, { type: "settings.update", uiSkinMode: "auto" });
  assert.match(again.message, /跟着当前舞台/);
  assert.equal(again.library.settings.uiSkin, "classic");
  assert.equal(resolveUiSkin(again.library), "eastern");

  const restarted = dispatch(manual.library, { type: "run.start", stageId: "stage-neon" }).library;
  assert.equal(restarted.settings.uiSkin, "classic");
  assert.equal(restarted.settings.uiSkinMode, "manual");
  assert.equal(resolveUiSkin(restarted), "classic");

  const follow = dispatch(restarted, { type: "settings.update", uiSkinMode: "auto" }).library;
  assert.equal(resolveUiSkin(follow), "cyber");
  const cleared = dispatch(follow, { type: "run.begin" }).library;
  assert.equal(resolveUiSkin(cleared), "classic");

  const legacy = {
    ...createSeedLibrary(),
    stagePicked: true,
    activeStageId: "stage-neon",
    stages: createSeedLibrary().stages.map(({ skinId, ...rest }) => rest),
  };
  assert.equal(resolveUiSkin(legacy), "cyber");

  assert.throws(() => dispatch(seeded, { type: "settings.update", uiSkin: "pastel" }), /没有这套皮肤/);
  assert.throws(() => dispatch(seeded, { type: "settings.update", uiSkinMode: "sometimes" }), /跟随舞台/);
});

test("种子文件与开局数据一致", () => {
  const disk = JSON.parse(fs.readFileSync(new URL("../../data/library.seed.json", import.meta.url), "utf8"));
  assert.deepEqual(disk, createSeedLibrary());
});
