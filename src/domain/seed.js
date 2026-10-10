/**
 * 三座舞台的初始内容。图片只写路径，不把图打进逻辑。
 * 夜晚图与白天同一文件夹，文件名里的「_白天」换成「_晚上」。
 */

import { DEFAULT_SETTINGS, ensureSettings } from "./settings.js";

export const SEEDED_AT = "2026-10-10T00:00:00.000Z";

const FROST_CAST = ["npc-astrid", "npc-sigrid", "npc-elin"];
const AZURE_CAST = ["npc-nuanli", "npc-yuetong", "npc-qingyan"];
const NEON_CAST = ["npc-chutang", "npc-xingxuan", "npc-xuejing"];

export function createSeedLibrary() {
  return {
    revision: 2,
    stagePicked: false,
    activeStageId: "",
    stages: [
      {
        id: "stage-frost",
        name: "霜印王国",
        tone: "北欧",
        folder: "北欧",
        worldBookId: "book-frost",
        characterIds: [...FROST_CAST],
        openingLocationId: "loc-frost-town",
      },
      {
        id: "stage-azure",
        name: "青玄界",
        tone: "东方仙侠",
        folder: "东方",
        worldBookId: "book-azure",
        characterIds: [...AZURE_CAST],
        openingLocationId: "loc-azure-town",
      },
      {
        id: "stage-neon",
        name: "霓穹市",
        tone: "赛博",
        folder: "现代",
        worldBookId: "book-neon",
        characterIds: [...NEON_CAST],
        openingLocationId: "loc-neon-center",
      },
    ],
    worldBooks: [frostBook(), azureBook(), neonBook()],
    characters: [
      player(),
      npc("npc-astrid", "stage-frost", "Astrid", "北欧", "Astrid.png", "王宫大门的盾卫。职务是拦人，耳朵却会停下来听村里的苦。", "直，不绕。站在门与人之间时先看谁没带武器。", "短句。先说能不能，再说为什么。"),
      npc("npc-sigrid", "stage-frost", "Sigrid", "北欧", "Sigrid.png", "村庄里记得旧税和旧歌的人。歌没唱完，账也不会算丢。", "慢热，记性长。不愿把去年的霜税说成「过去的事」。", "像在低声唱歌，一句里常带旧年。"),
      npc("npc-elin", "stage-frost", "Elin", "北欧", "Elin.png", "城镇的书记。路引、粮数和谁进过门，都先落到她的桌上。", "谨慎，爱核对。不接受「大约」。", "先报数字和人名，再给判断。"),
      npc("npc-nuanli", "stage-azure", "暖璃", "东方", "暖璃.png", "青玄界里把散落典故收成书的人。问得完整，也听得完。", "温和、细心。不急着把别人的话收成结论。", "句子整。先把问题问清楚，再给一个能核对的说法。"),
      npc("npc-yuetong", "stage-azure", "月曈", "东方", "月曈.png", "爱把没写完的传说当场讲活。话多，也肯负责把跑掉的话题拉回来。", "活泼，嘴快，好奇压过规矩一半。", "快，爱接话。偶尔跑远，再自己绕回来。"),
      npc("npc-qingyan", "stage-azure", "清言", "东方", "清言.png", "守着「说出口就会成真」那条线的持卷人。一句是一句。", "话少，界限清楚。不为了热闹把话说第二遍。", "慢。不重复。没问到的不说。"),
      npc("npc-chutang", "stage-neon", "初棠", "现代", "初棠.png", "霓穹市边缘长大的向导。废区的后门和城市中心哪扇门只对预约开，她都认得。", "热，但不硬闯。先告诉你哪条路今晚走得过。", "口语。爱提街道、后门和「这条线今晚还亮着」。"),
      npc("npc-xingxuan", "stage-neon", "星璇", "现代", "星璇.png", "把霓穹市看成一幅还没完成的作品。嘴上要走，交到手里的活仍会做完。", "傲，嘴硬。不轻易认输，也不把半成品给人看。", "可以很长，但收在她自己的标准上。催促只会让她更慢。"),
      npc("npc-xuejing", "stage-neon", "雪璟", "现代", "雪璟.png", "城里最快的画师之一。原件不轻易交给别人，语气却常常是轻的。", "表面温婉，距离感清楚。笑的时候也不等于答应。", "轻，慢。一句里留一点没说完的笑。"),
    ],
    sessions: [
      {
        id: "session-main",
        name: "还没开场",
        worldBookId: "",
        playerCardId: "player-guest",
        npcIds: [],
        speakMode: "turn",
        turnCursor: 0,
        messages: [
          {
            id: "msg-open",
            speakerId: "system",
            speakerName: "戏台",
            kind: "system",
            text: "三个舞台不会挤在一场里。先选霜印王国、青玄界或霓穹市，再请那一岸的三位上台。",
            at: SEEDED_AT,
          },
        ],
        state: {
          locationId: "",
          timeOfDay: "day",
          activeTriggerId: "",
          alive: { "player-guest": true },
        },
      },
    ],
    saves: [],
    transferLog: [],
    model: {
      provider: "local",
      localBaseUrl: "http://127.0.0.1:11434/v1",
      localModel: "",
      cloudBaseUrl: "",
      cloudApiKey: "",
      cloudModel: "",
      localProbe: null,
      remindRetest: false,
      cloudSlots: [
        {
          id: "slot-deepseek",
          label: "DeepSeek",
          baseUrl: "https://api.deepseek.com/v1",
          model: "",
          apiKey: "",
          characterIds: [],
        },
        {
          id: "slot-qwen",
          label: "通义千问",
          baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
          model: "",
          apiKey: "",
          characterIds: [],
        },
        {
          id: "slot-extra",
          label: "另一家云端",
          baseUrl: "",
          model: "",
          apiKey: "",
          characterIds: [],
        },
      ],
    },
    guide: {
      completed: false,
      disclaimerAccepted: false,
      completedAt: null,
    },
    settings: { ...DEFAULT_SETTINGS },
  };
}

export function migrateLibrary(raw) {
  if (raw && raw.revision >= 2 && Array.isArray(raw.worldBooks) && Array.isArray(raw.stages)) {
    return ensureSettings(raw);
  }
  const seed = createSeedLibrary();
  if (raw?.guide) {
    seed.guide = {
      completed: Boolean(raw.guide.completed),
      disclaimerAccepted: Boolean(raw.guide.disclaimerAccepted),
      completedAt: raw.guide.completedAt || null,
    };
  }
  if (raw?.model) {
    seed.model.provider = raw.model.provider === "cloud" ? "cloud" : "local";
    if (raw.model.localBaseUrl) seed.model.localBaseUrl = String(raw.model.localBaseUrl);
    if (raw.model.localModel) seed.model.localModel = String(raw.model.localModel);
    if (raw.model.cloudBaseUrl) seed.model.cloudBaseUrl = String(raw.model.cloudBaseUrl);
    if (raw.model.cloudApiKey) seed.model.cloudApiKey = String(raw.model.cloudApiKey);
    if (raw.model.cloudModel) seed.model.cloudModel = String(raw.model.cloudModel);
    if (raw.model.localProbe) seed.model.localProbe = raw.model.localProbe;
  }
  return seed;
}

function player() {
  return {
    id: "player-guest",
    kind: "player",
    stageId: "",
    name: "旅人",
    summary: "走进哪一座舞台，就先以旅人的身份开口。",
    personality: "好奇，说话直接。",
    speechStyle: "短句。",
    avatarFile: "",
    fullBodyFile: "",
  };
}

function npc(id, stageId, name, folder, fileName, summary, personality, speechStyle) {
  return {
    id,
    kind: "npc",
    stageId,
    name,
    summary,
    personality,
    speechStyle,
    avatarFile: "",
    fullBodyFile: `assets/defaults/characters/女/${folder}/${fileName}`,
  };
}

function place(id, name, imageFile, triggers = []) {
  return {
    id,
    name,
    imageFile,
    nightImageFile: imageFile.replace("_白天", "_晚上"),
    triggers,
  };
}

function entry(id, title, body, keywords) {
  return { id, title, body, keywords, enabled: true };
}

function patch(id, title, body) {
  return { id, title, body, enabled: true, createdAt: SEEDED_AT };
}

function book(id, stageId, name, summary, entries, patches, locations) {
  return { id, stageId, name, summary, entries, patches, locations, updatedAt: SEEDED_AT };
}

function frostBook() {
  return book(
    "book-frost",
    "stage-frost",
    "霜印王国",
    "长冬未尽的北境。炉火、誓言，和还没结清的霜税。",
    [
      entry(
        "entry-frost-air",
        "氛围",
        "霜印王国停在长冬里。城镇的石路白天也结着薄霜，店铺把炉火对着门；村庄的烟压得很低，屋顶的雪要人自己铲。王宫大门的铜环冷得粘手，门内的地毯却是干的。人说话留一半在喉咙里，另一半交给炉火。夜里同一处只是把窗子关上，火还在，路更白。",
        ["霜", "炉火", "长冬", "氛围"],
      ),
      entry(
        "entry-frost-conflict",
        "冲突",
        "王室要南境今年的粮，村庄说去年的霜税还没结清，不能再交。Astrid 站在王宫大门和村路之间，盾是职务，耳朵却是自己的。Sigrid 记得每一笔旧账，也记得那首不许在税官面前唱完的歌。Elin 把数字摊在城镇的桌上，谁都别想把「大约」写进账里。有人说旧王的印还在某条冰河里，谁去捞，谁就得先决定站在哪一边。",
        ["霜税", "粮", "冲突", "冰河"],
      ),
      entry(
        "entry-frost-taboo",
        "禁忌",
        "不许在炉火前撒谎，谎会跟着烟留下来。不许直呼亡者的冬名。王宫内部未经传召不得拔剑，门前拔剑也一样被看成闯宫。不要把「霜印」当成可以临时改口的契约。",
        ["禁忌", "炉火", "冬名", "拔剑"],
      ),
    ],
    [patch("patch-frost-salt", "北境的盐", "村庄换盐的小路这一季结冰更早。这是后补的细节，不是另一本世界书。")],
    [
      place("loc-frost-town", "城镇", "assets/defaults/backgrounds/北欧/城镇/霜印城镇_白天.jpg"),
      place("loc-frost-village", "村庄", "assets/defaults/backgrounds/北欧/村庄/霜印村庄_白天.jpg"),
      place("loc-frost-gate", "王宫大门", "assets/defaults/backgrounds/北欧/王宫大门/霜印王宫大门_白天.jpg", [
        { id: "trig-frost-gate", name: "门前拔剑", keywords: ["拔剑", "闯宫"], imageFile: "" },
      ]),
      place("loc-frost-hall", "王宫内部", "assets/defaults/backgrounds/北欧/王宫内部/霜印王宫内部_白天.jpg"),
    ],
  );
}

function azureBook() {
  return book(
    "book-azure",
    "stage-azure",
    "青玄界",
    "山河还在问道。话本、真名，和一卷不许翻开的青册。",
    [
      entry(
        "entry-azure-air",
        "氛围",
        "青玄界的天光像没干的墨。城镇檐角挂着问道的幡，风一过，幡上的字就换一种读法。村庄夜里听得见溪水把人名往下游送。皇宫深处有一卷青册，封面凉，不许翻开。人与人之间先问一句「可说」，再说下一句。",
        ["青玄", "问道", "青册", "氛围"],
      ),
      entry(
        "entry-azure-conflict",
        "冲突",
        "暖璃想把散落的典故收成一本能核对的书。月曈偏要把没写完的传说当场讲活，讲到听的人忍不住接话。清言守着那条线：有些话说出口就会成真，不能为了热闹说第二遍。皇宫要封山清修，村庄还靠山路换盐。封与不封，青册都不许被拿来当令箭。",
        ["封山", "传说", "冲突", "青册"],
      ),
      entry(
        "entry-azure-taboo",
        "禁忌",
        "不许对月立空誓。不许在皇宫里把同一个人的真名连叫三次。问道可以，逼人把道说死不行。不要把仙门规矩写成给自己钻的漏洞。青册可以提起，不可以打开。",
        ["禁忌", "真名", "空誓", "青册"],
      ),
    ],
    [patch("patch-azure-ink", "未干的墨", "城镇西市有人卖没写完的话本。买的人要自己决定结局。这是同一本书的补丁。")],
    [
      place("loc-azure-town", "城镇", "assets/defaults/backgrounds/东方/城镇/青玄城镇_白天.jpg"),
      place("loc-azure-village", "村庄", "assets/defaults/backgrounds/东方/村庄/青玄村庄_白天.jpg"),
      place("loc-azure-palace", "皇宫", "assets/defaults/backgrounds/东方/皇宫/青玄皇宫_白天.jpg", [
        { id: "trig-azure-book", name: "青册被翻", keywords: ["翻开青册", "真名"], imageFile: "" },
      ]),
    ],
  );
}

function neonBook() {
  return book(
    "book-neon",
    "stage-neon",
    "霓穹市",
    "雨和霓虹底下的城。中心太亮，边缘和废区仍然有人生活。",
    [
      entry(
        "entry-neon-air",
        "氛围",
        "霓穹市的雨比霓虹先到。城市中心亮得不真实，玻璃后面全是冷气；公园把灯做成树的样子，商业中心的招牌比货先响。城市边缘的风是直的。废区的灯自己接，富人区的灯不闪，贫民区的灯有时共用一条线。办公室和客厅在高处，卧室、厨房、玄关是人真正把鞋子脱掉的地方。义体改造商店的招牌，夜里比白天吵。",
        ["霓虹", "雨", "霓穹", "氛围"],
      ),
      entry(
        "entry-neon-conflict",
        "冲突",
        "富人区要清走贫民区的摊，义体改造商店夹在两条街的中间，哪边的客人都得罪不起。初棠认得废区的后门，也认得城市中心哪扇门只对预约开。星璇嫌这座城不够好看，嘴上要走，活还是接完。雪璟画得比谁都快，原件不轻易给看。三个人对「这座城还值不值得留下」各有一句，谁也不替谁说完。",
        ["贫民区", "富人区", "冲突", "义体"],
      ),
      entry(
        "entry-neon-taboo",
        "禁忌",
        "不许未经同意读取别人的记忆插件。不许在义体改造商店里谈「出厂设置」。废区的火不要带进富人区的会客厅。不要把人当成可替换的零件。办公室里的话，出了玄关还算数。",
        ["禁忌", "出厂设置", "记忆", "义体"],
      ),
    ],
    [patch("patch-neon-rain", "雨停的十五分钟", "城市中心的霓虹会在雨停时同时闪一次。闪完才恢复各自的颜色。这是补丁，不是第二本世界书。")],
    [
      place("loc-neon-center", "城市中心", "assets/defaults/backgrounds/现代/城市中心/赛博城市中心_白天.jpg"),
      place("loc-neon-office", "办公室", "assets/defaults/backgrounds/现代/办公室/赛博办公室_白天.png"),
      place("loc-neon-living", "客厅", "assets/defaults/backgrounds/现代/客厅/赛博客厅_白天.png"),
      place("loc-neon-bedroom", "卧室", "assets/defaults/backgrounds/现代/卧室/赛博卧室_白天.jpg"),
      place("loc-neon-entry", "玄关", "assets/defaults/backgrounds/现代/玄关/赛博玄关_白天.jpg"),
      place("loc-neon-kitchen", "厨房", "assets/defaults/backgrounds/现代/厨房/赛博厨房_白天.jpg"),
      place("loc-neon-park", "公园", "assets/defaults/backgrounds/现代/公园/赛博公园_白天.jpg"),
      place("loc-neon-mall", "商业中心", "assets/defaults/backgrounds/现代/商业中心/赛博商业中心_白天.jpg"),
      place("loc-neon-edge", "城市边缘", "assets/defaults/backgrounds/现代/城市边缘/赛博城市边缘_白天.jpg"),
      place("loc-neon-waste", "废区", "assets/defaults/backgrounds/现代/废区/赛博废区_白天.jpg"),
      place("loc-neon-rich", "富人区", "assets/defaults/backgrounds/现代/富人区/赛博富人区_白天.jpg"),
      place("loc-neon-poor", "贫民区", "assets/defaults/backgrounds/现代/贫民区/赛博贫民区_白天.jpg"),
      place("loc-neon-clinic", "义体改造商店", "assets/defaults/backgrounds/现代/义体改造商店/赛博义体改造商店_白天.jpg", [
        { id: "trig-neon-factory", name: "出厂设置", keywords: ["出厂设置", "格式化记忆"], imageFile: "" },
      ]),
    ],
  );
}
