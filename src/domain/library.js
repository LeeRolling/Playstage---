import { nowIso } from "./util.js";

export function createSeedLibrary() {
  return {
    worldBook: {
      id: "book-main",
      name: "空台",
      summary: "一座还没写完的戏台。舞台归世界书管，谁开口归人设卡管。死了的人先不要复活。",
      entries: [
        {
          id: "entry-rule",
          title: "戏台规矩",
          body: "上台的人按自己的人设说话。设定没写到的地方，用副本补丁慢慢补，不另开一本世界书。",
          keywords: ["戏台", "规矩"],
          enabled: true,
        },
      ],
      patches: [
        {
          id: "patch-lamp",
          title: "灯还没全亮",
          body: "侧幕有一盏灯，有时亮、有时不亮。这是后补的细节，不是第二本世界书。",
          enabled: true,
          createdAt: nowIso(),
        },
      ],
      locations: [
        { id: "loc-empty", name: "空舞台", imageFile: "" },
        { id: "loc-wing", name: "侧幕", imageFile: "" },
      ],
      updatedAt: nowIso(),
    },
    characters: [
      {
        id: "player-guest",
        kind: "player",
        name: "看客",
        summary: "坐在台下、有时被拉上台的人。",
        personality: "好奇，说话直接。",
        speechStyle: "短句。",
        avatarFile: "",
        fullBodyFile: "",
      },
      {
        id: "npc-announcer",
        kind: "npc",
        name: "报幕",
        summary: "负责把下一场说清楚的人。",
        personality: "清楚、克制，不抢别人的词。",
        speechStyle: "先报名字，再说事。",
        avatarFile: "",
        fullBodyFile: "",
      },
      {
        id: "npc-lamp",
        kind: "npc",
        name: "提灯",
        summary: "在侧幕提着灯的人。",
        personality: "话少，偶尔插一句。",
        speechStyle: "慢，一句一事。",
        avatarFile: "",
        fullBodyFile: "",
      },
    ],
    sessions: [
      {
        id: "session-main",
        name: "试演",
        worldBookId: "book-main",
        playerCardId: "player-guest",
        npcIds: ["npc-announcer", "npc-lamp"],
        speakMode: "turn",
        turnCursor: 0,
        messages: [
          {
            id: "msg-open",
            speakerId: "system",
            speakerName: "戏台",
            kind: "system",
            text: "试演开始。下面这句话是占位，还没有接上模型。你写一句，台上会有人用占位回复接话。",
            at: nowIso(),
          },
        ],
        state: {
          locationId: "loc-empty",
          alive: {
            "player-guest": true,
            "npc-announcer": true,
            "npc-lamp": true,
          },
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
    },
    guide: {
      completed: false,
      disclaimerAccepted: false,
      completedAt: null,
    },
  };
}
