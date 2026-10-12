import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { adoptCharacterFolderSlots, resolveStoredPicture, retargetLibraryPictures, settleCharacterPortraits } from "./pictures.js";

test("后缀或文件夹写错时对上磁盘上的那张图，已有的文件不改、不删", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "playstage-pic-"));
  const village = path.join(root, "assets", "defaults", "backgrounds", "北欧", "村落");
  fs.mkdirSync(village, { recursive: true });
  fs.writeFileSync(path.join(village, "霜印村庄_白天.png"), "png-village");
  const media = path.join(root, "data", "media");
  fs.mkdirSync(media, { recursive: true });
  fs.writeFileSync(path.join(media, "img-astrid.jpg"), "keep-jpg");
  fs.writeFileSync(path.join(media, "img-sigrid.png"), "only-png");

  const exact = "assets/defaults/backgrounds/北欧/村庄/霜印村庄_白天.jpg";
  assert.equal(
    resolveStoredPicture(root, exact),
    "assets/defaults/backgrounds/北欧/村落/霜印村庄_白天.png",
  );
  const town = path.join(root, "assets", "defaults", "backgrounds", "北欧", "城镇");
  fs.mkdirSync(town, { recursive: true });
  fs.writeFileSync(path.join(town, "霜印城镇_白天.png"), "town-png");
  assert.equal(
    resolveStoredPicture(root, "assets/defaults/backgrounds/北欧/城镇/霜印城镇_白天.jpg"),
    "assets/defaults/backgrounds/北欧/城镇/霜印城镇_白天.png",
  );
  fs.writeFileSync(path.join(town, "霜印城镇_白天.jpg"), "town-jpg");
  assert.equal(
    resolveStoredPicture(root, "assets/defaults/backgrounds/北欧/城镇/霜印城镇_白天.jpg"),
    "assets/defaults/backgrounds/北欧/城镇/霜印城镇_白天.jpg",
  );
  assert.equal(resolveStoredPicture(root, "data/media/img-astrid.jpg"), "data/media/img-astrid.jpg");
  assert.equal(resolveStoredPicture(root, "data/media/img-sigrid.jpg"), "data/media/img-sigrid.png");
  assert.equal(fs.readFileSync(path.join(media, "img-astrid.jpg"), "utf8"), "keep-jpg");

  const library = {
    characters: [
      {
        id: "npc-astrid",
        avatarFile: "data/media/img-astrid.jpg",
        fullBodyFile: "data/media/img-sigrid.jpg",
        thinkingFile: "data/media/img-sigrid.jpg",
      },
    ],
    worldBooks: [
      {
        locations: [
          {
            imageFile: exact,
            nightImageFile: "assets/defaults/backgrounds/北欧/村庄/霜印村庄_晚上.jpg",
            triggers: [{ imageFile: "" }],
          },
        ],
      },
    ],
  };
  const retargeted = retargetLibraryPictures(library, root);
  assert.equal(retargeted.changed, true);
  assert.equal(retargeted.library.characters[0].avatarFile, "data/media/img-astrid.jpg");
  assert.equal(retargeted.library.characters[0].fullBodyFile, "data/media/img-sigrid.png");
  assert.equal(retargeted.library.characters[0].thinkingFile, "data/media/img-sigrid.png");
  assert.equal(
    retargeted.library.worldBooks[0].locations[0].imageFile,
    "assets/defaults/backgrounds/北欧/村落/霜印村庄_白天.png",
  );
  assert.equal(
    retargeted.library.worldBooks[0].locations[0].nightImageFile,
    "assets/defaults/backgrounds/北欧/村庄/霜印村庄_晚上.jpg",
  );
  assert.equal(library.characters[0].fullBodyFile, "data/media/img-sigrid.jpg");
  assert.equal(library.characters[0].thinkingFile, "data/media/img-sigrid.jpg");
});

test("同名文件有好几张时不瞎猜", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "playstage-pic-"));
  for (const folder of ["甲", "乙"]) {
    const dir = path.join(root, "assets", "defaults", "backgrounds", folder);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "重复_白天.png"), folder);
  }
  assert.equal(resolveStoredPicture(root, "assets/defaults/backgrounds/丙/重复_白天.jpg"), "");
});

test("单张暖璃.png 抄进立绘文件夹，空格会读到表情和动作里的编号图", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "playstage-slots-"));
  const dir = path.join(root, "assets", "defaults", "characters", "女", "东方");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "暖璃.png"), "portrait");
  fs.mkdirSync(path.join(dir, "暖璃", "表情"), { recursive: true });
  fs.writeFileSync(path.join(dir, "暖璃", "表情", "01.png"), "face");
  fs.mkdirSync(path.join(dir, "暖璃", "动作"), { recursive: true });
  fs.writeFileSync(path.join(dir, "暖璃", "动作", "03.jpg"), "act");

  const library = {
    characters: [
      {
        id: "npc-nuanli",
        name: "暖璃",
        fullBodyFile: "assets/defaults/characters/女/东方/暖璃/立绘/暖璃.png",
        expressionFiles: Array.from({ length: 10 }, () => ""),
        actionFiles: Array.from({ length: 11 }, () => ""),
      },
    ],
  };
  settleCharacterPortraits(library, root);
  assert.equal(fs.readFileSync(path.join(dir, "暖璃", "立绘", "暖璃.png"), "utf8"), "portrait");
  assert.equal(fs.readFileSync(path.join(dir, "暖璃.png"), "utf8"), "portrait");

  const adopted = adoptCharacterFolderSlots(library, root);
  assert.equal(adopted.changed, true);
  assert.equal(adopted.library.characters[0].expressionFiles.length, 10);
  assert.equal(adopted.library.characters[0].actionFiles.length, 11);
  assert.equal(adopted.library.characters[0].expressionFiles[0], "assets/defaults/characters/女/东方/暖璃/表情/01.png");
  assert.equal(adopted.library.characters[0].expressionFiles[1], "");
  assert.equal(adopted.library.characters[0].actionFiles[2], "assets/defaults/characters/女/东方/暖璃/动作/03.jpg");
  assert.equal(library.characters[0].expressionFiles[0], "");

  const filled = adopted.library.characters[0];
  filled.expressionFiles[0] = "data/media/暖璃/表情/自定义.png";
  const kept = adoptCharacterFolderSlots(adopted.library, root);
  assert.equal(kept.changed, false);
  assert.equal(kept.library.characters[0].expressionFiles[0], "data/media/暖璃/表情/自定义.png");
});
