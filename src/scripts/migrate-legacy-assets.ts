import fs from "fs";
import path from "path";
import type { WordList } from "../types/index.js";

type LegacyAssets = WordList["words"][number]["assets"] & {
  coverImage43Path?: string;
  coverImage169Path?: string;
};

interface MigrationCounters {
  moved: number;
  copied: number;
  missing: number;
  updatedPaths: number;
  unchangedPaths: number;
  listsUpdated: number;
  wordsTouched: number;
}

const DATA_DIR = path.resolve("data", "wordlists");
const PUBLIC_DIR = path.resolve("public");

function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

function toPublicRel(...parts: string[]): string {
  return path.posix.join(
    ...parts
      .filter((p) => !!p)
      .map((p) => p.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")),
  );
}

function normalizeAssetRel(assetPath: string): string {
  let rel = toPosix(assetPath).replace(/^\/+/, "");
  if (rel.startsWith("public/")) {
    rel = rel.slice("public/".length);
  }
  return rel;
}

function extOrDefault(relPath: string | undefined, fallbackExt: string): string {
  const ext = relPath ? path.posix.extname(relPath) : "";
  return ext || fallbackExt;
}

function firstExistingRel(candidates: string[]): string | undefined {
  for (const rel of candidates) {
    if (fs.existsSync(path.join(PUBLIC_DIR, rel))) return rel;
  }
  return undefined;
}

function ensureWordDirs(listId: string, wordId: string): void {
  fs.mkdirSync(path.join(PUBLIC_DIR, "audio", listId, wordId), {
    recursive: true,
  });
  fs.mkdirSync(path.join(PUBLIC_DIR, "images", listId, wordId), {
    recursive: true,
  });
}

function ensureListVideoDir(listId: string): void {
  fs.mkdirSync(path.join(PUBLIC_DIR, "videos", listId), { recursive: true });
}

function moveFileCrossDevice(srcAbs: string, dstAbs: string): void {
  try {
    fs.renameSync(srcAbs, dstAbs);
  } catch (err: any) {
    if (err?.code !== "EXDEV") throw err;
    fs.copyFileSync(srcAbs, dstAbs);
    fs.unlinkSync(srcAbs);
  }
}

function migratePhysicalFile(params: {
  sourceRel: string;
  targetRel: string;
  mode: "move" | "copy";
  counters: MigrationCounters;
}): void {
  const { sourceRel, targetRel, mode, counters } = params;
  const src = path.join(PUBLIC_DIR, sourceRel);
  const dst = path.join(PUBLIC_DIR, targetRel);

  if (toPosix(sourceRel) === toPosix(targetRel)) return;

  fs.mkdirSync(path.dirname(dst), { recursive: true });

  const srcExists = fs.existsSync(src);
  const dstExists = fs.existsSync(dst);

  if (!srcExists) {
    if (!dstExists) counters.missing += 1;
    return;
  }

  if (dstExists) {
    if (mode === "move") {
      try {
        fs.unlinkSync(src);
      } catch {
        // 若删除失败不影响迁移结果
      }
    }
    return;
  }

  if (mode === "copy") {
    fs.copyFileSync(src, dst);
    counters.copied += 1;
    return;
  }

  moveFileCrossDevice(src, dst);
  counters.moved += 1;
}

function migratePath(params: {
  currentPath: string | undefined;
  targetPath: string;
  mode?: "move" | "copy";
  counters: MigrationCounters;
}): string | undefined {
  const { currentPath, targetPath, counters } = params;
  const mode = params.mode || "move";
  if (!currentPath) return undefined;

  const sourceRel = normalizeAssetRel(currentPath);
  const targetRel = normalizeAssetRel(targetPath);

  if (sourceRel !== targetRel) {
    migratePhysicalFile({ sourceRel, targetRel, mode, counters });
    counters.updatedPaths += 1;
  } else {
    counters.unchangedPaths += 1;
  }

  return targetRel;
}

function migrateList(list: WordList, counters: MigrationCounters): boolean {
  let changed = false;

  ensureListVideoDir(list.id);

  for (const word of list.words) {
    const assets = word.assets as LegacyAssets;
    let touchedWord = false;

    ensureWordDirs(list.id, word.id);

    const newChineseIntro = toPublicRel("audio", list.id, word.id, "chinese_intro.wav");
    const migratedChineseIntro = migratePath({
      currentPath: assets.chineseIntroTtsPath,
      targetPath: newChineseIntro,
      mode: "copy", // 旧版常为共享文件，按词条复制以满足新目录规范
      counters,
    });
    if (migratedChineseIntro && assets.chineseIntroTtsPath !== migratedChineseIntro) {
      assets.chineseIntroTtsPath = migratedChineseIntro;
      changed = true;
      touchedWord = true;
    }

    const newChineseWord = toPublicRel("audio", list.id, word.id, "chinese_word.wav");
    const migratedChineseWord = migratePath({
      currentPath: assets.chineseWordTtsPath,
      targetPath: newChineseWord,
      counters,
    });
    if (migratedChineseWord && assets.chineseWordTtsPath !== migratedChineseWord) {
      assets.chineseWordTtsPath = migratedChineseWord;
      changed = true;
      touchedWord = true;
    }

    const newChinese = toPublicRel("audio", list.id, word.id, "chinese.wav");
    const migratedChinese = migratePath({
      currentPath: assets.chineseTtsPath,
      targetPath: newChinese,
      counters,
    });
    if (migratedChinese && assets.chineseTtsPath !== migratedChinese) {
      assets.chineseTtsPath = migratedChinese;
      changed = true;
      touchedWord = true;
    }

    const newEnglish = toPublicRel("audio", list.id, word.id, "english.wav");
    const migratedEnglish = migratePath({
      currentPath: assets.englishTtsPath,
      targetPath: newEnglish,
      counters,
    });
    if (migratedEnglish && assets.englishTtsPath !== migratedEnglish) {
      assets.englishTtsPath = migratedEnglish;
      changed = true;
      touchedWord = true;
    }

    if (Array.isArray(assets.patternTtsPaths)) {
      const nextPatternPaths = assets.patternTtsPaths.map((p, idx) => {
        const target = toPublicRel("audio", list.id, word.id, `pattern_${idx}.wav`);
        return migratePath({ currentPath: p, targetPath: target, counters }) || target;
      });
      if (JSON.stringify(nextPatternPaths) !== JSON.stringify(assets.patternTtsPaths)) {
        assets.patternTtsPaths = nextPatternPaths;
        changed = true;
        touchedWord = true;
      }
    }

    const imageCurrent =
      assets.imagePath ||
      firstExistingRel([
        toPublicRel("images", `${word.id}.jpg`),
        toPublicRel("images", `${word.id}.jpeg`),
        toPublicRel("images", `${word.id}.png`),
        toPublicRel("images", `${word.id}.webp`),
      ]);
    if (imageCurrent) {
      const ext = extOrDefault(imageCurrent, ".jpg");
      const target = toPublicRel("images", list.id, word.id, `image${ext}`);
      const migrated = migratePath({ currentPath: imageCurrent, targetPath: target, counters });
      if (migrated && assets.imagePath !== migrated) {
        assets.imagePath = migrated;
        changed = true;
        touchedWord = true;
      }
    }

    if (Array.isArray(assets.exampleVideoPaths)) {
      const nextVideoPaths = assets.exampleVideoPaths.map((p, idx) => {
        const ext = extOrDefault(p, ".mp4");
        const target = toPublicRel("videos", list.id, `${word.id}_example_${idx}${ext}`);
        return migratePath({ currentPath: p, targetPath: target, counters }) || target;
      });
      if (JSON.stringify(nextVideoPaths) !== JSON.stringify(assets.exampleVideoPaths)) {
        assets.exampleVideoPaths = nextVideoPaths;
        changed = true;
        touchedWord = true;
      }
    }

    const cover43Current =
      assets.videoCover4x3Path ||
      assets.coverImage43Path ||
      firstExistingRel([
        toPublicRel("images", `${word.id}_cover_4_3.jpg`),
        toPublicRel("images", `${word.id}_cover_4_3.jpeg`),
        toPublicRel("images", `${word.id}_cover_4_3.png`),
      ]);
    if (cover43Current) {
      const ext = extOrDefault(cover43Current, ".jpg");
      const target = toPublicRel("images", list.id, word.id, `cover_4_3${ext}`);
      const migrated = migratePath({ currentPath: cover43Current, targetPath: target, counters });
      if (migrated && assets.videoCover4x3Path !== migrated) {
        assets.videoCover4x3Path = migrated;
        changed = true;
        touchedWord = true;
      }
      if (assets.coverImage43Path !== undefined && assets.coverImage43Path !== migrated) {
        assets.coverImage43Path = migrated;
        changed = true;
        touchedWord = true;
      }
    }

    const cover169Current =
      assets.videoCover16x9Path ||
      assets.coverImage169Path ||
      firstExistingRel([
        toPublicRel("images", `${word.id}_cover_16_9.jpg`),
        toPublicRel("images", `${word.id}_cover_16_9.jpeg`),
        toPublicRel("images", `${word.id}_cover_16_9.png`),
      ]);
    if (cover169Current) {
      const ext = extOrDefault(cover169Current, ".jpg");
      const target = toPublicRel("images", list.id, word.id, `cover_16_9${ext}`);
      const migrated = migratePath({ currentPath: cover169Current, targetPath: target, counters });
      if (migrated && assets.videoCover16x9Path !== migrated) {
        assets.videoCover16x9Path = migrated;
        changed = true;
        touchedWord = true;
      }
      if (assets.coverImage169Path !== undefined && assets.coverImage169Path !== migrated) {
        assets.coverImage169Path = migrated;
        changed = true;
        touchedWord = true;
      }
    }

    if (touchedWord) {
      counters.wordsTouched += 1;
      word.updatedAt = new Date().toISOString();
    }
  }

  if (changed) {
    list.updatedAt = new Date().toISOString();
  }

  return changed;
}

function main(): void {
  if (!fs.existsSync(DATA_DIR)) {
    console.log("[migrate-assets] 未找到 data/wordlists，跳过");
    return;
  }

  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();

  const counters: MigrationCounters = {
    moved: 0,
    copied: 0,
    missing: 0,
    updatedPaths: 0,
    unchangedPaths: 0,
    listsUpdated: 0,
    wordsTouched: 0,
  };

  for (const file of files) {
    const abs = path.join(DATA_DIR, file);
    const list = JSON.parse(fs.readFileSync(abs, "utf-8")) as WordList;

    const changed = migrateList(list, counters);
    if (changed) {
      fs.writeFileSync(abs, JSON.stringify(list, null, 2));
      counters.listsUpdated += 1;
      console.log(`[migrate-assets] updated ${file}`);
    } else {
      console.log(`[migrate-assets] unchanged ${file}`);
    }
  }

  console.log("\n[migrate-assets] done");
  console.log(`  lists updated : ${counters.listsUpdated}`);
  console.log(`  words touched : ${counters.wordsTouched}`);
  console.log(`  files moved   : ${counters.moved}`);
  console.log(`  files copied  : ${counters.copied}`);
  console.log(`  missing files : ${counters.missing}`);
  console.log(`  paths updated : ${counters.updatedPaths}`);
  console.log(`  paths same    : ${counters.unchangedPaths}`);
}

main();
