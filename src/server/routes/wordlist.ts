import { Router } from "express";
import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import multer from "multer";
import type { WordList, WordEntry } from "../../types/index.js";

const router = Router();
const DATA_DIR = path.resolve("data/wordlists");
const PUBLIC_DIR = path.resolve("public");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

function resolveUploadExt(
  originalName: string,
  mimeType: string,
  fallback: string,
): string {
  const ext = path.extname(originalName || "").toLowerCase();
  if (ext) return ext;

  const mimeMap: Record<string, string> = {
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/mp4": ".m4a",
    "audio/x-m4a": ".m4a",
    "audio/aac": ".aac",
    "audio/ogg": ".ogg",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "video/x-matroska": ".mkv",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/bmp": ".bmp",
  };

  return mimeMap[mimeType] || fallback;
}

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadList(id: string): WordList | null {
  const file = path.join(DATA_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function saveList(list: WordList): void {
  ensureDir();
  fs.writeFileSync(
    path.join(DATA_DIR, `${list.id}.json`),
    JSON.stringify(list, null, 2),
  );
}

function normalizeWordKey(word?: string): string {
  return (word || "").trim().toLowerCase();
}

function createWordEntry(input: Partial<WordEntry>, now: string): WordEntry {
  return {
    id: uuid(),
    word: input.word || "",
    phonetic: input.phonetic || "",
    chineseMeaning: input.chineseMeaning || "",
    englishMeaning: input.englishMeaning || "",
    patterns: input.patterns || [],
    patternTranslations: input.patternTranslations || [],
    examples: input.examples || [],
    status: (input.status as WordEntry["status"]) || "pending",
    assets: input.assets || {},
    createdAt: now,
    updatedAt: now,
  };
}

function ensureListMediaDirs(listId: string): void {
  fs.mkdirSync(path.join(PUBLIC_DIR, "audio", listId), { recursive: true });
  fs.mkdirSync(path.join(PUBLIC_DIR, "images", listId), { recursive: true });
  fs.mkdirSync(path.join(PUBLIC_DIR, "videos", listId), { recursive: true });
}

function ensureWordMediaDirs(listId: string, wordId: string): void {
  fs.mkdirSync(path.join(PUBLIC_DIR, "audio", listId, wordId), {
    recursive: true,
  });
  fs.mkdirSync(path.join(PUBLIC_DIR, "images", listId, wordId), {
    recursive: true,
  });
}

// 获取所有单词本
router.get("/", (_req, res) => {
  ensureDir();
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));
  const lists = files.map((f) => {
    const list = JSON.parse(
      fs.readFileSync(path.join(DATA_DIR, f), "utf-8"),
    ) as WordList;
    return {
      id: list.id,
      name: list.name,
      theme: list.theme,
      wordCount: list.words.length,
      createdAt: list.createdAt,
    };
  });
  res.json({ success: true, data: lists });
});

// 获取单个单词本
router.get("/:id", (req, res) => {
  const list = loadList(req.params.id);
  if (!list) return res.status(404).json({ success: false, error: "未找到" });
  res.json({ success: true, data: list });
});

// 创建单词本
router.post("/", (req, res) => {
  const { name, theme, words, config } = req.body;
  const now = new Date().toISOString();
  const list: WordList = {
    id: uuid(),
    name: name || "新单词本",
    theme: theme || "",
    config: config || undefined,
    words: (words || []).map((w: Partial<WordEntry>) => ({
      id: uuid(),
      word: w.word || "",
      phonetic: w.phonetic || "",
      chineseMeaning: w.chineseMeaning || "",
      englishMeaning: w.englishMeaning || "",
      patterns: w.patterns || [],
      patternTranslations: w.patternTranslations || [],
      examples: w.examples || [],
      status: "pending" as const,
      assets: {},
      createdAt: now,
      updatedAt: now,
    })),
    createdAt: now,
    updatedAt: now,
  };
  ensureListMediaDirs(list.id);
  for (const word of list.words) {
    ensureWordMediaDirs(list.id, word.id);
  }
  saveList(list);
  res.json({ success: true, data: list });
});

// 更新单词本
router.put("/:id", (req, res) => {
  const list = loadList(req.params.id);
  if (!list) return res.status(404).json({ success: false, error: "未找到" });

  Object.assign(list, req.body, { updatedAt: new Date().toISOString() });
  saveList(list);
  res.json({ success: true, data: list });
});

// 替换单词本公共素材（bgm / background / scene4-tts / cover-background）
router.post("/:id/public-assets/:assetType", upload.single("file"), (req, res) => {
  const listId = Array.isArray(req.params.id)
    ? req.params.id[0]
    : req.params.id;
  const list = loadList(listId);
  if (!list) return res.status(404).json({ success: false, error: "未找到" });

  const file = req.file;
  if (!file) {
    return res.status(400).json({ success: false, error: "缺少上传文件" });
  }

  const assetType = Array.isArray(req.params.assetType)
    ? req.params.assetType[0]
    : req.params.assetType;
  let targetRel = "";
  let targetAbs = "";

  if (assetType === "bgm") {
    const ext = resolveUploadExt(file.originalname, file.mimetype, ".mp3");
    const allowed = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg"]);
    if (!allowed.has(ext)) {
      return res.status(400).json({ success: false, error: "BGM 仅支持音频文件" });
    }
    targetRel = `audio/${list.id}/bgm${ext}`;
    targetAbs = path.join(PUBLIC_DIR, "audio", list.id, `bgm${ext}`);
  } else if (assetType === "background") {
    const ext = resolveUploadExt(file.originalname, file.mimetype, ".mp4");
    const allowed = new Set([".mp4", ".mov", ".webm", ".mkv"]);
    if (!allowed.has(ext)) {
      return res.status(400).json({ success: false, error: "背景仅支持视频文件" });
    }
    targetRel = `videos/${list.id}/background${ext}`;
    targetAbs = path.join(PUBLIC_DIR, "videos", list.id, `background${ext}`);
  } else if (assetType === "scene4-tts") {
    const ext = resolveUploadExt(file.originalname, file.mimetype, ".wav");
    if (ext !== ".wav") {
      return res.status(400).json({
        success: false,
        error: "第四幕 TTS 仅支持 WAV 文件",
      });
    }
    targetRel = `audio/${list.id}/scene4_outro${ext}`;
    targetAbs = path.join(PUBLIC_DIR, "audio", list.id, `scene4_outro${ext}`);
  } else if (assetType === "cover-background") {
    const ext = resolveUploadExt(file.originalname, file.mimetype, ".png");
    const allowed = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp"]);
    if (!allowed.has(ext)) {
      return res.status(400).json({
        success: false,
        error: "封面背景仅支持图片文件",
      });
    }
    targetRel = `images/${list.id}/cover_background${ext}`;
    targetAbs = path.join(
      PUBLIC_DIR,
      "images",
      list.id,
      `cover_background${ext}`,
    );
  } else {
    return res.status(400).json({
      success: false,
      error: "assetType 仅支持 bgm、background、scene4-tts 或 cover-background",
    });
  }

  fs.mkdirSync(path.dirname(targetAbs), { recursive: true });
  fs.writeFileSync(targetAbs, file.buffer);

  list.config = list.config || {};
  list.config.media = list.config.media || {};
  list.config.cover = list.config.cover || {};
  if (assetType === "bgm") {
    list.config.media.bgmPath = targetRel;
  } else if (assetType === "background") {
    list.config.media.backgroundVideoPath = targetRel;
  } else if (assetType === "scene4-tts") {
    list.config.media.scene4OutroTtsPath = targetRel;
  } else if (assetType === "cover-background") {
    list.config.cover.backgroundImagePath = targetRel;
  }
  list.updatedAt = new Date().toISOString();
  saveList(list);

  res.json({ success: true, data: { path: targetRel, list } });
});

// 删除单词本
router.delete("/:id", (req, res) => {
  const file = path.join(DATA_DIR, `${req.params.id}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  res.json({ success: true });
});

// 添加单词到单词本
router.post("/:id/words", (req, res) => {
  const list = loadList(req.params.id);
  if (!list) return res.status(404).json({ success: false, error: "未找到" });

  const incomingKey = normalizeWordKey(req.body.word);
  if (!incomingKey) {
    return res.status(400).json({ success: false, error: "单词不能为空" });
  }
  const existingSet = new Set(list.words.map((w) => normalizeWordKey(w.word)));
  if (existingSet.has(incomingKey)) {
    return res.status(409).json({ success: false, error: "单词已存在，已跳过" });
  }

  const now = new Date().toISOString();
  const newWord = createWordEntry(req.body, now);

  list.words.push(newWord);
  ensureListMediaDirs(list.id);
  ensureWordMediaDirs(list.id, newWord.id);
  list.updatedAt = now;
  saveList(list);
  res.json({ success: true, data: newWord });
});

// 批量添加单词到单词本（自动跳过重复词）
router.post("/:id/words/batch-add", (req, res) => {
  const list = loadList(req.params.id);
  if (!list) return res.status(404).json({ success: false, error: "未找到" });

  const payload = Array.isArray(req.body?.words) ? req.body.words : [];
  if (payload.length === 0) {
    return res.status(400).json({ success: false, error: "缺少 words 数组" });
  }

  const now = new Date().toISOString();
  const existingSet = new Set(list.words.map((w) => normalizeWordKey(w.word)));
  const addedWords: WordEntry[] = [];
  const skippedWords: string[] = [];

  for (const item of payload as Partial<WordEntry>[]) {
    const key = normalizeWordKey(item.word);
    if (!key || existingSet.has(key)) {
      if (item.word) skippedWords.push(item.word);
      continue;
    }

    const newWord = createWordEntry(item, now);
    addedWords.push(newWord);
    existingSet.add(key);
  }

  if (addedWords.length > 0) {
    list.words.push(...addedWords);
    ensureListMediaDirs(list.id);
    for (const word of addedWords) {
      ensureWordMediaDirs(list.id, word.id);
    }
    list.updatedAt = now;
    saveList(list);
  }

  res.json({
    success: true,
    data: {
      addedWords,
      skippedWords,
      addedCount: addedWords.length,
      skippedCount: skippedWords.length,
    },
  });
});

// 批量删除单词
router.post("/:id/words/batch-delete", (req, res) => {
  const list = loadList(req.params.id);
  if (!list) return res.status(404).json({ success: false, error: "未找到" });

  const wordIds = Array.isArray(req.body?.wordIds)
    ? req.body.wordIds.filter((id: unknown) => typeof id === "string" && id)
    : [];
  if (wordIds.length === 0) {
    return res.status(400).json({ success: false, error: "缺少 wordIds" });
  }

  const idSet = new Set(wordIds);
  const before = list.words.length;
  list.words = list.words.filter((w) => !idSet.has(w.id));
  const deletedCount = before - list.words.length;

  list.updatedAt = new Date().toISOString();
  saveList(list);

  res.json({
    success: true,
    data: {
      deletedCount,
      remainingCount: list.words.length,
    },
  });
});

// 删除单个单词
router.delete("/:id/words/:wordId", (req, res) => {
  const list = loadList(req.params.id);
  if (!list) return res.status(404).json({ success: false, error: "未找到" });

  const wordIndex = list.words.findIndex((w) => w.id === req.params.wordId);
  if (wordIndex === -1) {
    return res.status(404).json({ success: false, error: "单词未找到" });
  }

  const [deletedWord] = list.words.splice(wordIndex, 1);
  list.updatedAt = new Date().toISOString();
  saveList(list);

  res.json({ success: true, data: deletedWord });
});

// 更新单个单词
router.put("/:id/words/:wordId", (req, res) => {
  const list = loadList(req.params.id);
  if (!list) return res.status(404).json({ success: false, error: "未找到" });

  const wordIndex = list.words.findIndex((w) => w.id === req.params.wordId);
  if (wordIndex === -1)
    return res.status(404).json({ success: false, error: "单词未找到" });

  list.words[wordIndex] = {
    ...list.words[wordIndex],
    ...req.body,
    updatedAt: new Date().toISOString(),
  };
  list.updatedAt = new Date().toISOString();
  saveList(list);
  res.json({ success: true, data: list.words[wordIndex] });
});

// 导出单词本
router.get("/:id/export", (req, res) => {
  const list = loadList(req.params.id);
  if (!list) return res.status(404).json({ success: false, error: "未找到" });
  res.setHeader("Content-Type", "application/json");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${list.name}.json"`,
  );
  res.json(list);
});

export default router;
