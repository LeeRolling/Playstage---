import fs from "node:fs";
import path from "node:path";
import { createSeedLibrary, migrateLibrary } from "../domain/index.js";

export function openStore(dataDir) {
  const file = path.join(dataDir, "library.json");

  function load() {
    if (!fs.existsSync(file)) {
      const seed = createSeedLibrary();
      save(seed);
      return seed;
    }
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      const migrated = migrateLibrary(raw);
      if (migrated !== raw) save(migrated);
      return migrated;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error("data/library.json 读不了。可以先把这个文件挪走，再重新启动，剧戏台会写出一份新的试演。");
      }
      throw error;
    }
  }

  function save(library) {
    fs.mkdirSync(dataDir, { recursive: true });
    const temporary = `${file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(library, null, 2));
    fs.renameSync(temporary, file);
  }

  return { file, load, save };
}
