import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { characterArtRelativePath, resolveStoredPicture, retargetLibraryPictures, saveUploadedPicture } from "./pictures.js";

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

test("表情路径也按同名图对上，原来的文件不删", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "playstage-art-"));
  const face = path.join(root, "assets", "characters", "暖璃", "表情");
  fs.mkdirSync(face, { recursive: true });
  fs.writeFileSync(path.join(face, "expr_smile.png"), "smile-png");
  fs.writeFileSync(path.join(face, "用户原图.png"), "keep-original");
  const library = {
    characters: [
      {
        id: "npc-nuanli",
        expressions: {
          expr_smile: "assets/characters/暖璃/表情/expr_smile.jpg",
          expr_sad: "assets/characters/暖璃/表情/expr_sad.png",
        },
        actions: { pose_wave: "" },
      },
    ],
  };
  const retargeted = retargetLibraryPictures(library, root);
  assert.equal(retargeted.changed, true);
  assert.equal(retargeted.library.characters[0].expressions.expr_smile, "assets/characters/暖璃/表情/expr_smile.png");
  assert.equal(retargeted.library.characters[0].expressions.expr_sad, "assets/characters/暖璃/表情/expr_sad.png");
  assert.equal(retargeted.library.characters[0].actions.pose_wave, "");
  assert.equal(fs.readFileSync(path.join(face, "用户原图.png"), "utf8"), "keep-original");
  assert.equal(library.characters[0].expressions.expr_smile, "assets/characters/暖璃/表情/expr_smile.jpg");
});

test("新的表情和动作写进角色文件夹，不覆盖旁边的原图", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "playstage-save-"));
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const library = { characters: [{ id: "npc-nuanli", name: "暖璃" }] };
  const face = saveUploadedPicture(root, { dataUrl: png, kind: "expression", characterId: "npc-nuanli", slotId: "expr_smile" }, library);
  assert.equal(face.path, "assets/characters/暖璃/表情/expr_smile.png");
  const pose = saveUploadedPicture(root, { dataUrl: png, kind: "action", characterId: "npc-nuanli", slotId: "pose_wave" }, library);
  assert.equal(pose.path, "assets/characters/暖璃/动作/pose_wave.png");
  const original = path.join(root, "assets", "characters", "暖璃", "表情", "用户原图.png");
  fs.writeFileSync(original, "keep-original");
  const again = saveUploadedPicture(root, { dataUrl: png, kind: "expression", characterId: "npc-nuanli", slotId: "expr_laugh" }, library);
  assert.equal(again.path, "assets/characters/暖璃/表情/expr_laugh.png");
  assert.equal(fs.readFileSync(original, "utf8"), "keep-original");
  assert.equal(fs.existsSync(path.join(root, "assets", "characters", "暖璃", "立绘")), false);

  const loose = saveUploadedPicture(root, { dataUrl: png }, library);
  assert.match(loose.path, /^data\/media\/img-.*\.png$/);
  assert.equal(fs.existsSync(path.join(root, loose.path)), true);

  assert.equal(
    characterArtRelativePath({ name: "../暖璃", id: "", kind: "expression", slotId: "expr_neutral", ext: "png" }),
    "assets/characters/暖璃/表情/expr_neutral.png",
  );
  assert.equal(
    characterArtRelativePath({ name: "CON", id: "npc-nuanli", kind: "action", slotId: "pose_stand", ext: "png" }),
    "assets/characters/npc-nuanli/动作/pose_stand.png",
  );
  assert.equal(characterArtRelativePath({ name: "暖璃", id: "npc-nuanli", kind: "expression", slotId: "中立", ext: "png" }), "");
  assert.throws(
    () => saveUploadedPicture(root, { dataUrl: png, kind: "expression", characterId: "npc-nuanli", slotId: "../expr_smile" }, library),
    /没有对上/,
  );
  assert.equal(fs.existsSync(path.join(root, "expr_smile.png")), false);
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
