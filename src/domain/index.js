/**
 * 功能层入口。
 * 世界书、人设、会话、存档、导入导出、模型设置、新手引导都在这里。
 * 本目录不引用界面，也不操作浏览器。界面只通过本地 HTTP 调用这些能力。
 */

import {
  ACTION_SLOT_COUNT,
  createCharacter,
  characterFolderLayout,
  DEFAULT_STAGE_POSE,
  EXPRESSION_SLOT_COUNT,
  removeCharacter,
  STAGE_POSE_LIMITS,
  updateCharacter,
} from "./characters.js";
import { adviseFromVram, completeGuide, describePrerequisites, DISCLAIMER } from "./guide.js";
import { createSeedLibrary, migrateLibrary } from "./library.js";
import { buildActingMessages, planSpeakers } from "./acting.js";
import {
  actingTarget,
  armModelRetest,
  LOCAL_CONNECTED_NOTE,
  LOCAL_KEEP_ALIVE_PIN,
  LOCAL_KEEP_ALIVE_RELEASE,
  LOCAL_WARM_IDLE_MINUTES,
  localChatKeepAlive,
  localRouteProbe,
  publicModel,
  recordProbe,
  resolveRouteMode,
  shouldReleaseLocalWarm,
  updateCloudSlot,
  updateModel,
} from "./models.js";
import { createSave, loadSave, removeSave } from "./saves.js";
import { ensureCurrentLocation, resolveScene } from "./scene.js";
import { normalizeSettings, resolveUiSkin, skinName, UI_SKINS, updateSettings } from "./settings.js";
import {
  appendSystemLine,
  commitNpcReply,
  finishCoolDown,
  getSession,
  sendPlayerLine,
  sessionForm,
  sessionFormLabel,
  setLocation,
  setNpcIds,
  setPlayer,
  setSpeakMode,
  setTimeOfDay,
  SPEAK_MODES,
} from "./session.js";
import { beginNewRun, selectStage } from "./stages.js";
import { exportBundle, noteImport } from "./transfer.js";
import { clone } from "./util.js";
import {
  addEntry,
  addLocation,
  addPatch,
  addTrigger,
  setLocationImage,
  togglePatch,
  updateWorldBook,
} from "./world-book.js";

export {
  actingTarget,
  adviseFromVram,
  LOCAL_KEEP_ALIVE_PIN,
  LOCAL_KEEP_ALIVE_RELEASE,
  LOCAL_WARM_IDLE_MINUTES,
  localChatKeepAlive,
  localRouteProbe,
  resolveRouteMode,
  shouldReleaseLocalWarm,
  appendSystemLine,
  armModelRetest,
  buildActingMessages,
  commitNpcReply,
  createSeedLibrary,
  describePrerequisites,
  DISCLAIMER,
  finishCoolDown,
  LOCAL_CONNECTED_NOTE,
  migrateLibrary,
  planSpeakers,
  publicModel,
  recordProbe,
  sendPlayerLine,
  updateModel,
  sessionForm,
  sessionFormLabel,
  SPEAK_MODES,
};

export function toPublicLibrary(library) {
  const next = ensureCurrentLocation(clone(library));
  next.model = publicModel(library.model);
  const session = getSession(next);
  const settings = normalizeSettings(next.settings);
  const skinId = resolveUiSkin(library);
  next.view = {
    form: sessionForm(session),
    formLabel: sessionFormLabel(session),
    speakModeLabel: SPEAK_MODES[session.speakMode],
    disclaimer: DISCLAIMER,
    stagePicked: Boolean(library.stagePicked),
    scene: resolveScene(next),
    skin: {
      id: skinId,
      name: skinName(skinId),
      mode: settings.uiSkinMode,
      chosen: settings.uiSkin,
    },
    skins: UI_SKINS.map((item) => ({ id: item.id, name: item.name })),
    stagePose: {
      defaults: { ...DEFAULT_STAGE_POSE },
      limits: {
        x: { ...STAGE_POSE_LIMITS.x },
        y: { ...STAGE_POSE_LIMITS.y },
        scale: { ...STAGE_POSE_LIMITS.scale },
      },
    },
    visualSlots: {
      expressions: EXPRESSION_SLOT_COUNT,
      actions: ACTION_SLOT_COUNT,
    },
  };
  for (const person of next.characters || []) {
    person.mediaFolders = characterFolderLayout(person);
  }
  return next;
}

export function dispatch(library, action) {
  switch (action.type) {
    case "stage.select":
      return plain(selectStage(library, action.stageId), "舞台已选定。这一场只请这三位。");
    case "run.begin":
      return plain(beginNewRun(library), "这一场已从头准备。请选择一个世界。");
    case "run.start":
      return plain(selectStage(beginNewRun(library), action.stageId), "舞台已选定。这一场只请这三位。");
    case "world.update":
      return plain(updateWorldBook(library, action), "这本世界书已保存。");
    case "world.addEntry":
      return plain(addEntry(library, action), "条目已加上。");
    case "world.addPatch":
      return plain(addPatch(library, action), "补丁已加上。");
    case "world.togglePatch":
      return plain(togglePatch(library, action.patchId), "补丁已更新。");
    case "world.addLocation":
      return plain(addLocation(library, action), "地点已记下。可以接着给它配白天和夜晚的图。");
    case "world.setLocationImage":
      return plain(
        setLocationImage(library, action.locationId, action.imageFile, action.slot, action.triggerId),
        "地点的图已记下。",
      );
    case "world.addTrigger":
      return plain(addTrigger(library, action), "特殊情景已记下。没配图时会先沿用地点背景。");
    case "character.create": {
      const created = createCharacter(library, action.kind);
      return plain(created.library, "已添一张新人设，可以现在就改。");
    }
    case "character.update":
      return plain(updateCharacter(library, action.id, action.fields || {}), "人设已保存。");
    case "character.remove":
      return plain(removeCharacter(library, action.id), "这张人设已拿下。");
    case "session.setMode":
      return plain(setSpeakMode(library, action.mode));
    case "session.setPlayer":
      return plain(setPlayer(library, action.playerCardId), "玩家人设已换上。");
    case "session.setNpcs":
      return plain(setNpcIds(library, action.npcIds), "上台的人已记下。");
    case "session.setLocation":
      return plain(setLocation(library, action.locationId));
    case "session.setTime":
      return plain(setTimeOfDay(library, action.timeOfDay));
    case "session.send":
      return plain(sendPlayerLine(library, action.text));
    case "save.create":
      return plain(createSave(library, action.name), "已存档。档在这台电脑上。");
    case "save.load":
      return plain(loadSave(library, action.saveId), "已读档。台上回到这个档的进度。");
    case "save.remove":
      return plain(removeSave(library, action.saveId), "这个档已删除。");
    case "transfer.export":
      return exportBundle(library, action.kind);
    case "transfer.import":
      return noteImport(library, action);
    case "model.update":
      return plain(updateModel(library, action), modelSavedMessage(action));
    case "model.updateSlot":
      return plain(updateCloudSlot(library, action), "云端接口已记下。上台时用的是你在上面选中的那一家。");
    case "model.recordProbe":
      return plain(recordProbe(library, action));
    case "guide.complete":
      return plain(completeGuide(library, action.disclaimerAccepted), "引导完成。模型仍要你自己准备。");
    case "settings.update":
      return plain(updateSettings(library, action), settingsMessage(action));
    default:
      throw new Error("不认识这个操作。");
  }
}

function plain(library, message) {
  return { library: ensureCurrentLocation(library), message: message || "" };
}

function modelSavedMessage(action) {
  if (action?.routeMode === "auto") {
    return "已按自动接话保存：本机连得上就用本机，否则用填好的云端。《剧戏台》仍不会自带任何AI模型。";
  }
  if (action?.routeMode === "cloud") {
    return "已改成只用云端。《剧戏台》仍不会自带任何AI模型。";
  }
  if (action?.routeMode === "local" || action?.provider === "local") {
    return "本地模型已经加载到《剧戏台》中，《剧戏台》仍不会自带任何AI模型。";
  }
  if (action?.provider === "zhipu" || action?.provider === "qwen" || action?.provider === "cloud") {
    return "云端设置已经写在这台电脑上。《剧戏台》仍不会自带任何AI模型。";
  }
  return "模型设置已写在这台电脑上。《剧戏台》仍不会自带任何AI模型。";
}

function settingsMessage(action) {
  const sprite = action.spriteScale != null && action.spriteScale !== "";
  const dialog = action.dialogScale != null && action.dialogScale !== "";
  const skin = (action.uiSkin != null && action.uiSkin !== "") || (action.uiSkinMode != null && action.uiSkinMode !== "");
  const touched = [sprite, dialog, skin].filter(Boolean).length;
  if (touched > 1) return "台上的偏好已留在这台电脑上。";
  if (sprite) return "立绘大小已留在这台电脑上。";
  if (dialog) return "对话框高度已留在这台电脑上。";
  if (skin && action.uiSkinMode === "auto" && (action.uiSkin == null || action.uiSkin === "")) {
    return "皮肤会跟着当前舞台走。";
  }
  if (skin) return "皮肤已留在这台电脑上。";
  return "台上的大小已留在这台电脑上。";
}
