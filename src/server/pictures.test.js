import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveStoredPicture, retargetLibraryPictures } from "./pictures.js";

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
      { id: "npc-astrid", avatarFile: "data/media/img-astrid.jpg", fullBodyFile: "data/media/img-sigrid.jpg" },
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
  assert.equal(
    retargeted.library.worldBooks[0].locations[0].imageFile,
    "assets/defaults/backgrounds/北欧/村落/霜印村庄_白天.png",
  );
  assert.equal(
    retargeted.library.worldBooks[0].locations[0].nightImageFile,
    "assets/defaults/backgrounds/北欧/村庄/霜印村庄_晚上.jpg",
  );
  assert.equal(library.characters[0].fullBodyFile, "data/media/img-sigrid.jpg");
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
