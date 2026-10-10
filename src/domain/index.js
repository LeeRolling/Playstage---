/**
 * 功能层入口。
 * 世界书、人设、会话、存档、导入导出、模型设置、新手引导都在这里。
 * 本目录不引用界面，也不操作浏览器。界面只通过本地 HTTP 调用这些能力。
 */

import { createCharacter, removeCharacter, updateCharacter } from "./characters.js";
import { adviseFromVram, completeGuide, describePrerequisites, DISCLAIMER } from "./guide.js";
import { createSeedLibrary, migrateLibrary } from "./library.js";
import {
  armModelRetest,
  LOCAL_CONNECTED_NOTE,
  publicModel,
  recordProbe,
  updateCloudSlot,
  updateModel,
} from "./models.js";
import { createSave, loadSave, removeSave } from "./saves.js";
import { resolveScene } from "./scene.js";
import {
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
import { selectStage } from "./stages.js";
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
  adviseFromVram,
  armModelRetest,
  createSeedLibrary,
  describePrerequisites,
  DISCLAIMER,
  LOCAL_CONNECTED_NOTE,
  migrateLibrary,
  publicModel,
  recordProbe,
  sessionForm,
  sessionFormLabel,
  SPEAK_MODES,
};

export function toPublicLibrary(library) {
  const next = clone(library);
  next.model = publicModel(library.model);
  const session = getSession(next);
  next.view = {
    form: sessionForm(session),
    formLabel: sessionFormLabel(session),
    speakModeLabel: SPEAK_MODES[session.speakMode],
    disclaimer: DISCLAIMER,
    stagePicked: Boolean(library.stagePicked),
    scene: resolveScene(library),
  };
  return next;
}

export function dispatch(library, action) {
  switch (action.type) {
    case "stage.select":
      return plain(selectStage(library, action.stageId), "舞台已选定。这一场只请这三位。");
    case "world.update":
      return plain(updateWorldBook(library, action));
    case "world.addEntry":
      return plain(addEntry(library, action));
    case "world.addPatch":
      return plain(addPatch(library, action));
    case "world.togglePatch":
      return plain(togglePatch(library, action.patchId));
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
      return plain(updateCharacter(library, action.id, action.fields || {}));
    case "character.remove":
      return plain(removeCharacter(library, action.id), "这张人设已拿下。");
    case "session.setMode":
      return plain(setSpeakMode(library, action.mode));
    case "session.setPlayer":
      return plain(setPlayer(library, action.playerCardId));
    case "session.setNpcs":
      return plain(setNpcIds(library, action.npcIds));
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
      return plain(updateModel(library, action), "模型设置已写在本机。剧戏台仍不附带模型。");
    case "model.updateSlot":
      return plain(updateCloudSlot(library, action), "云端接口已记下。这一版还不会拿它来演戏。");
    case "model.recordProbe":
      return plain(recordProbe(library, action));
    case "guide.complete":
      return plain(completeGuide(library, action.disclaimerAccepted), "引导完成。模型仍要你自己准备。");
    default:
      throw new Error("不认识这个操作。");
  }
}

function plain(library, message) {
  return { library, message: message || "" };
}
