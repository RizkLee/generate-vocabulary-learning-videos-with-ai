import { Router } from "express";
import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import type { WordList, WordEntry } from "../../types/index.js";

const router = Router();
const DATA_DIR = path.resolve("data/wordlists");

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
