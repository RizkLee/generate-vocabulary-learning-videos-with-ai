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

// 替换单词本公共素材（bgm / background）
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
  } else {
    return res.status(400).json({ success: false, error: "assetType 仅支持 bgm 或 background" });
  }

  fs.mkdirSync(path.dirname(targetAbs), { recursive: true });
  fs.writeFileSync(targetAbs, file.buffer);

  list.config = list.config || {};
  list.config.media = list.config.media || {};
  if (assetType === "bgm") {
    list.config.media.bgmPath = targetRel;
  } else {
    list.config.media.backgroundVideoPath = targetRel;
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

  const now = new Date().toISOString();
  const newWord: WordEntry = {
    id: uuid(),
    word: req.body.word || "",
    phonetic: req.body.phonetic || "",
    chineseMeaning: req.body.chineseMeaning || "",
    englishMeaning: req.body.englishMeaning || "",
    patterns: req.body.patterns || [],
    patternTranslations: req.body.patternTranslations || [],
    examples: req.body.examples || [],
    status: "pending",
    assets: {},
    createdAt: now,
    updatedAt: now,
  };

  list.words.push(newWord);
  ensureListMediaDirs(list.id);
  ensureWordMediaDirs(list.id, newWord.id);
  list.updatedAt = now;
  saveList(list);
  res.json({ success: true, data: newWord });
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
