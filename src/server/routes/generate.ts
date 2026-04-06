import { Router } from "express";
import fs from "fs";
import path from "path";
import type { WordList, WordEntry } from "../../types/index.js";
import { generateWordContent, generateWordList } from "../../services/gemini-content.js";
import {
  generateChineseTts,
  generateEnglishTts,
  type TtsOverrides,
} from "../../services/gemini-tts.js";
import { fetchAndSaveImage } from "../../services/pixabay.js";
import { generateExampleVideos, generateVideo } from "../../services/veo.js";
import { generateSubtitles } from "../../services/subtitle.js";
import { logCost, checkBudget, getCostSummary } from "../../services/cost-tracker.js";
import { loadConfig, renderTemplate, type AppConfig } from "../../services/config.js";
import {
  ensureScene4OutroTts,
  getScene4OutroRelPath,
  normalizeScene4OutroTtsSpeed,
} from "../../services/scene4-outro.js";

const router = Router();
const DATA_DIR = path.resolve("data/wordlists");
const PUBLIC_DIR = path.resolve("public");
const DEFAULT_TTS_SPEED = 1.25;
const MIN_TTS_SPEED = 0.8;
const MAX_TTS_SPEED = 1.6;
const MIN_AI_VIDEO_COUNT = 0;
const MAX_AI_VIDEO_COUNT = 2;

function toPublicRel(...parts: string[]): string {
  return path.posix.join(
    ...parts
      .filter((p) => !!p)
      .map((p) => p.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")),
  );
}

function getWordAudioDir(listId: string, wordId: string): string {
  return path.join(PUBLIC_DIR, "audio", listId, wordId);
}

function getWordImageDir(listId: string, wordId: string): string {
  return path.join(PUBLIC_DIR, "images", listId, wordId);
}

function getListVideoDir(listId: string): string {
  return path.join(PUBLIC_DIR, "videos", listId);
}

function audioRel(listId: string, wordId: string, fileName: string): string {
  return toPublicRel("audio", listId, wordId, fileName);
}

function imageRel(listId: string, wordId: string, fileName: string): string {
  return toPublicRel("images", listId, wordId, fileName);
}

function videoRel(listId: string, fileName: string): string {
  return toPublicRel("videos", listId, fileName);
}

function loadList(listId: string): WordList | null {
  const file = path.join(DATA_DIR, `${listId}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function saveList(list: WordList): void {
  fs.writeFileSync(
    path.join(DATA_DIR, `${list.id}.json`),
    JSON.stringify(list, null, 2),
  );
}

function findWord(list: WordList, wordId: string): WordEntry | undefined {
  return list.words.find((w) => w.id === wordId);
}

function normalizeWordKey(word?: string): string {
  return (word || "").trim().toLowerCase();
}

function normalizeAiVideoCount(value: unknown, fallback = 2): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(
    MAX_AI_VIDEO_COUNT,
    Math.max(MIN_AI_VIDEO_COUNT, Math.floor(parsed)),
  );
}

function getEffectiveConfig(list: WordList): AppConfig {
  const globalConfig = loadConfig();
  const listConfig = list.config;
  if (!listConfig) return globalConfig;

  const cleanModels = Object.fromEntries(
    Object.entries(listConfig.models || {}).filter(([, v]) => typeof v === "string" && v.trim()),
  );
  const cleanPrompts = Object.fromEntries(
    Object.entries(listConfig.prompts || {}).filter(([, v]) => typeof v === "string" && v.trim()),
  );

  return {
    ...globalConfig,
    models: {
      ...globalConfig.models,
      ...cleanModels,
    },
    prompts: {
      ...globalConfig.prompts,
      ...cleanPrompts,
    },
  };
}

function clampTtsSpeed(speed?: number): number {
  if (!Number.isFinite(speed)) return DEFAULT_TTS_SPEED;
  return Math.min(MAX_TTS_SPEED, Math.max(MIN_TTS_SPEED, Number(speed)));
}

function ensurePatternTtsSpeeds(existing: number[] | undefined, count: number): number[] {
  const next = Array.from({ length: count }, (_, idx) =>
    clampTtsSpeed(existing?.[idx]),
  );
  return next;
}

function ensureWordTtsSpeeds(word: WordEntry): void {
  word.assets.chineseIntroTtsSpeed = clampTtsSpeed(
    word.assets.chineseIntroTtsSpeed,
  );
  word.assets.chineseWordTtsSpeed = clampTtsSpeed(
    word.assets.chineseWordTtsSpeed,
  );
  word.assets.englishTtsSpeed = clampTtsSpeed(word.assets.englishTtsSpeed);
  word.assets.patternTtsSpeeds = ensurePatternTtsSpeeds(
    word.assets.patternTtsSpeeds,
    word.patterns.length,
  );
}

async function generatePatternTtsAssets(params: {
  listId: string;
  wordId: string;
  patterns: string[];
  audioDir: string;
  overrides?: TtsOverrides;
}): Promise<{ paths: string[]; durations: number[] }> {
  const { listId, wordId, patterns, audioDir, overrides } = params;
  const paths: string[] = [];
  const durations: number[] = [];

  for (let i = 0; i < patterns.length; i++) {
    const fileName = `pattern_${i}.wav`;
    const outputPath = path.join(audioDir, fileName);
    const result = await generateEnglishTts(patterns[i], outputPath, overrides);
    paths.push(audioRel(listId, wordId, fileName));
    durations.push(result.durationSec);
  }

  return { paths, durations };
}

// 生成单词内容 (Gemini Flash)
router.post("/content/:listId/:wordId", async (req, res) => {
  try {
    const list = loadList(req.params.listId);
    if (!list) return res.status(404).json({ success: false, error: "单词本未找到" });

    const word = findWord(list, req.params.wordId);
    if (!word) return res.status(404).json({ success: false, error: "单词未找到" });

    const cfg = getEffectiveConfig(list);
    const content = await generateWordContent(word.word, {
      model: cfg.models.contentGeneration,
      prompt: cfg.prompts.contentGeneration,
    });
    Object.assign(word, content, {
      status: "content_ready",
      updatedAt: new Date().toISOString(),
    });

    logCost("gemini-flash", "generateWordContent", 0.001, word.id);
    saveList(list);
    res.json({ success: true, data: word });
  } catch (err: any) {
    const msg = err.cause?.message ? `${err.message} (${err.cause.message})` : err.message;
    res.status(500).json({ success: false, error: msg });
  }
});

// 局部重生成内容（整词/仅句式/仅例句/单条例句）
router.post("/content-partial/:listId/:wordId", async (req, res) => {
  try {
    const list = loadList(req.params.listId);
    if (!list) return res.status(404).json({ success: false, error: "单词本未找到" });

    const word = findWord(list, req.params.wordId);
    if (!word) return res.status(404).json({ success: false, error: "单词未找到" });

    const mode = req.body?.mode || "full";
    const exampleIndex = Number(req.body?.exampleIndex);

    const cfg = getEffectiveConfig(list);
    const regenerated = await generateWordContent(word.word, {
      model: cfg.models.contentGeneration,
      prompt: cfg.prompts.contentGeneration,
    });

    if (mode === "patterns") {
      word.patterns = regenerated.patterns || word.patterns;
      word.patternTranslations = regenerated.patternTranslations || word.patternTranslations;
    } else if (mode === "examples") {
      word.examples = regenerated.examples || word.examples;
    } else if (mode === "example_single") {
      if (!Number.isInteger(exampleIndex) || exampleIndex < 0 || exampleIndex >= word.examples.length) {
        return res.status(400).json({ success: false, error: "exampleIndex 无效" });
      }
      const candidate = regenerated.examples?.[exampleIndex] || regenerated.examples?.[0];
      if (!candidate) {
        return res.status(500).json({ success: false, error: "AI 未返回有效例句" });
      }
      word.examples[exampleIndex] = candidate;
    } else {
      Object.assign(word, {
        word: regenerated.word || word.word,
        phonetic: regenerated.phonetic || word.phonetic,
        chineseMeaning: regenerated.chineseMeaning || word.chineseMeaning,
        englishMeaning: regenerated.englishMeaning || word.englishMeaning,
        patterns: regenerated.patterns || word.patterns,
        patternTranslations: regenerated.patternTranslations || word.patternTranslations,
        examples: regenerated.examples || word.examples,
      });
    }

    if (word.status === "pending") word.status = "content_ready";
    word.updatedAt = new Date().toISOString();
    saveList(list);

    logCost("gemini-flash", `regenerateContent_${mode}`, 0.001, word.id);
    res.json({ success: true, data: word });
  } catch (err: any) {
    const msg = err.cause?.message ? `${err.message} (${err.cause.message})` : err.message;
    res.status(500).json({ success: false, error: msg });
  }
});

// AI 批量生成单词列表
router.post("/wordlist", async (req, res) => {
  try {
    const { theme, count, listId } = req.body;
    const requestedCount = Math.max(1, Number(count) || 10);

    let existingWords: string[] = [];
    if (typeof listId === "string" && listId.trim()) {
      const list = loadList(listId);
      if (list) {
        existingWords = list.words
          .map((w) => (w.word || "").trim())
          .filter(Boolean)
          .slice(0, 300);
      }
    }

    const generatedWords = await generateWordList(theme, requestedCount, {
      avoidWords: existingWords,
    });

    // 生成后做二次检查：若与当前单词本重合则丢弃（等价于删除生成冲突词）
    const existingSet = new Set(existingWords.map(normalizeWordKey));
    const batchSet = new Set<string>();
    const words = generatedWords.filter((w) => {
      const key = normalizeWordKey(w.word);
      if (!key) return false;
      if (existingSet.has(key)) return false;
      if (batchSet.has(key)) return false;
      batchSet.add(key);
      return true;
    });

    const removedCount = generatedWords.length - words.length;
    logCost("gemini-flash", "generateWordList", 0.005, "batch");
    res.json({
      success: true,
      data: words,
      meta: {
        requestedCount,
        generatedCount: generatedWords.length,
        returnedCount: words.length,
        removedDuplicateCount: removedCount,
      },
    });
  } catch (err: any) {
    const msg = err.cause?.message ? `${err.message} (${err.cause.message})` : err.message;
    res.status(500).json({ success: false, error: msg });
  }
});

// 生成 TTS
router.post("/tts/:listId/:wordId", async (req, res) => {
  try {
    const list = loadList(req.params.listId);
    if (!list) return res.status(404).json({ success: false, error: "未找到" });

    const word = findWord(list, req.params.wordId);
    if (!word) return res.status(404).json({ success: false, error: "单词未找到" });

    const audioDir = getWordAudioDir(list.id, word.id);
    const cfg = getEffectiveConfig(list);
    const ttsOverrides = {
      model: cfg.models.tts,
      voiceName: cfg.models.ttsVoice,
      englishVoicePrompt: cfg.prompts.englishVoice,
      chineseVoicePrompt: cfg.prompts.chineseVoice,
    };

    const scene4OutroPath = getScene4OutroRelPath(
      list.id,
      list.config?.media?.scene4OutroTtsPath,
    );
    const sharedScene4Outro = await ensureScene4OutroTts(PUBLIC_DIR, {
      relativePath: scene4OutroPath,
      overrides: ttsOverrides,
    });
    if (sharedScene4Outro.generated) {
      logCost("gemini-tts", "generateSharedScene4Outro", 0.01, "shared-scene4");
    }

    // 中文 TTS - 开场白 (固定复用，只生成一次)
    const introPath = path.join(audioDir, "chinese_intro.wav");
    if (!fs.existsSync(introPath)) {
      const intro = await generateChineseTts(
        cfg.prompts.chineseIntro,
        introPath,
        ttsOverrides,
      );
      console.log(`  [TTS] 开场白生成完成: ${intro.durationSec.toFixed(1)}s`);
    }
    // 读取已有的开场白时长
    const introStat = fs.statSync(introPath);
    const introSize = introStat.size - 44; // WAV header = 44 bytes
    const introDuration = introSize / (24000 * 2);
    word.assets.chineseIntroTtsPath = audioRel(list.id, word.id, "chinese_intro.wav");
    word.assets.chineseIntroTtsDuration = introDuration;

    // 中文 TTS - 单词释义 (每词不同)
    // 第1幕中文语音改为只读“中文简明释义”，不再带冗长前缀
    const wordChineseText = word.chineseMeaning;
    const chineseWord = await generateChineseTts(
      wordChineseText,
      path.join(audioDir, "chinese_word.wav"),
      ttsOverrides,
    );
    word.assets.chineseWordTtsPath = audioRel(list.id, word.id, "chinese_word.wav");
    word.assets.chineseWordTtsDuration = chineseWord.durationSec;

    // 英文 TTS
    const englishText = renderTemplate(cfg.prompts.englishWordTemplate, { word: word.word, englishMeaning: word.englishMeaning });
    const english = await generateEnglishTts(
      englishText,
      path.join(audioDir, "english.wav"),
      ttsOverrides,
    );
    word.assets.englishTtsPath = audioRel(list.id, word.id, "english.wav");
    word.assets.englishTtsDuration = english.durationSec;

    // 句式 TTS
    const patterns = await generatePatternTtsAssets({
      listId: list.id,
      wordId: word.id,
      patterns: word.patterns,
      audioDir,
      overrides: ttsOverrides,
    });
    word.assets.patternTtsPaths = patterns.paths;
    word.assets.patternTtsDurations = patterns.durations;
    ensureWordTtsSpeeds(word);

    logCost("gemini-tts", "generateAllTts", 0.05, word.id);
    word.updatedAt = new Date().toISOString();
    saveList(list);
    res.json({ success: true, data: word });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 重新生成第4幕公共 TTS（词本级）
router.post("/scene4-outro-tts/:listId", async (req, res) => {
  try {
    const list = loadList(req.params.listId);
    if (!list) return res.status(404).json({ success: false, error: "未找到" });

    const cfg = getEffectiveConfig(list);
    const ttsOverrides = {
      model: cfg.models.tts,
      voiceName: cfg.models.ttsVoice,
      englishVoicePrompt: cfg.prompts.englishVoice,
      chineseVoicePrompt: cfg.prompts.chineseVoice,
    };

    const speed = normalizeScene4OutroTtsSpeed(
      req.body?.speed ?? list.config?.media?.scene4OutroTtsSpeed,
    );
    const scene4OutroPath = getScene4OutroRelPath(
      list.id,
      list.config?.media?.scene4OutroTtsPath,
    );

    const regenerated = await ensureScene4OutroTts(PUBLIC_DIR, {
      relativePath: scene4OutroPath,
      overrides: ttsOverrides,
      forceRegenerate: true,
    });

    list.config = list.config || {};
    list.config.media = list.config.media || {};
    list.config.media.scene4OutroTtsPath = regenerated.relativePath;
    list.config.media.scene4OutroTtsSpeed = speed;
    list.updatedAt = new Date().toISOString();
    saveList(list);

    logCost("gemini-tts", "regenerateScene4OutroTts", 0.01, "shared-scene4");
    res.json({
      success: true,
      data: {
        path: regenerated.relativePath,
        durationSec: regenerated.durationSec,
        speed,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 重新生成单条 TTS
router.post("/tts-single/:listId/:wordId/:ttsType", async (req, res) => {
  try {
    const list = loadList(req.params.listId);
    if (!list) return res.status(404).json({ success: false, error: "未找到" });
    const word = findWord(list, req.params.wordId);
    if (!word) return res.status(404).json({ success: false, error: "单词未找到" });

    const audioDir = getWordAudioDir(list.id, word.id);
    const cfg = getEffectiveConfig(list);
    const ttsType = req.params.ttsType;
    const ttsOverrides = {
      model: cfg.models.tts,
      voiceName: cfg.models.ttsVoice,
      englishVoicePrompt: cfg.prompts.englishVoice,
      chineseVoicePrompt: cfg.prompts.chineseVoice,
    };

    if (ttsType === "chinese_word") {
      const text = word.chineseMeaning;
      const r = await generateChineseTts(text, path.join(audioDir, "chinese_word.wav"), ttsOverrides);
      word.assets.chineseWordTtsPath = audioRel(list.id, word.id, "chinese_word.wav");
      word.assets.chineseWordTtsDuration = r.durationSec;
    } else if (ttsType === "english") {
      const text = renderTemplate(cfg.prompts.englishWordTemplate, { word: word.word, englishMeaning: word.englishMeaning });
      const r = await generateEnglishTts(text, path.join(audioDir, "english.wav"), ttsOverrides);
      word.assets.englishTtsPath = audioRel(list.id, word.id, "english.wav");
      word.assets.englishTtsDuration = r.durationSec;
    } else if (ttsType.startsWith("pattern_")) {
      const idx = parseInt(ttsType.split("_")[1]);
      if (idx >= 0 && idx < word.patterns.length) {
        const fileName = `pattern_${idx}.wav`;
        const r = await generateEnglishTts(word.patterns[idx], path.join(audioDir, fileName), ttsOverrides);
        if (!word.assets.patternTtsPaths) word.assets.patternTtsPaths = [];
        if (!word.assets.patternTtsDurations) word.assets.patternTtsDurations = [];
        word.assets.patternTtsPaths[idx] = audioRel(list.id, word.id, fileName);
        word.assets.patternTtsDurations[idx] = r.durationSec;
      }
    } else if (ttsType === "chinese_intro") {
      const r = await generateChineseTts(cfg.prompts.chineseIntro, path.join(audioDir, "chinese_intro.wav"), ttsOverrides);
      word.assets.chineseIntroTtsPath = audioRel(list.id, word.id, "chinese_intro.wav");
      word.assets.chineseIntroTtsDuration = r.durationSec;
    }

    ensureWordTtsSpeeds(word);

    logCost("gemini-tts", `regenerate_${ttsType}`, 0.01, word.id);
    word.updatedAt = new Date().toISOString();
    saveList(list);
    res.json({ success: true, data: word });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 搜索并下载 Pixabay 图片
router.post("/image/:listId/:wordId", async (req, res) => {
  try {
    const list = loadList(req.params.listId);
    if (!list) return res.status(404).json({ success: false, error: "未找到" });

    const word = findWord(list, req.params.wordId);
    if (!word) return res.status(404).json({ success: false, error: "单词未找到" });

    const imageDir = getWordImageDir(list.id, word.id);
    const outputPath = path.join(imageDir, "image.jpg");
    const result = await fetchAndSaveImage(
      word.word,
      outputPath,
      "african american expression",
    );

    if (result) {
      word.assets.imagePath = imageRel(list.id, word.id, "image.jpg");
      word.updatedAt = new Date().toISOString();
      saveList(list);
    }

    res.json({ success: true, data: word });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 生成 Veo 例句视频 (高费用，需确认)
router.post("/video/:listId/:wordId", async (req, res) => {
  try {
    const { confirmed } = req.body;
    const requestedVideoCount = normalizeAiVideoCount(req.body?.videoCount, 2);

    const list = loadList(req.params.listId);
    if (!list) return res.status(404).json({ success: false, error: "未找到" });

    const word = findWord(list, req.params.wordId);
    if (!word) return res.status(404).json({ success: false, error: "单词未找到" });

    const targetVideoCount = Math.min(requestedVideoCount, word.examples.length);
    const estimatedCost = Number((targetVideoCount * 1.2).toFixed(3));

    if (!confirmed && estimatedCost > 0) {
      const budget = checkBudget(estimatedCost);
      return res.json({
        success: false,
        error: "需要确认",
        data: {
          requestedVideoCount,
          targetVideoCount,
          estimatedCost,
          budgetRemaining: budget.remaining,
          budgetOk: budget.ok,
        },
      });
    }

    if (targetVideoCount === 0) {
      word.assets.exampleVideoPaths = [];
      word.assets.exampleVideoDurations = [];
      word.assets.subtitleData = [];
      word.updatedAt = new Date().toISOString();
      saveList(list);
      return res.json({
        success: true,
        data: word,
        meta: {
          requestedVideoCount,
          generatedVideoCount: 0,
          subtitleAutoRegenerated: true,
          subtitleAutoError: undefined,
          skippedScene3: true,
        },
      });
    }

    const videoDir = getListVideoDir(list.id);
    const cfg = getEffectiveConfig(list);
    const targetExamples = word.examples.slice(0, targetVideoCount);
    const result = await generateExampleVideos(
      word.word,
      targetExamples,
      videoDir,
      word.id,
      {
        model: cfg.models.video,
        promptTemplate: cfg.prompts.veoVideo,
      },
      path.posix.join("videos", list.id),
    );

    word.assets.exampleVideoPaths = result.paths;
    word.assets.exampleVideoDurations = result.durations;

    let subtitleAutoRegenerated = false;
    let subtitleAutoError: string | undefined;

    try {
      const subtitleData = [];
      for (let i = 0; i < result.paths.length; i++) {
        const videoPath = path.join(PUBLIC_DIR, result.paths[i]);
        const segments = await generateSubtitles(
          videoPath,
          targetExamples[i].english,
          targetExamples[i].chinese,
          cfg.models.subtitle,
        );
        subtitleData.push(segments);
      }
      word.assets.subtitleData = subtitleData;
      subtitleAutoRegenerated = true;
      logCost("stt", "autoGenerateSubtitlesAfterVideoRegenerate", 0.004, word.id);
    } catch (subtitleErr: any) {
      subtitleAutoError = subtitleErr?.message || "字幕自动重生失败";
      // 批量重生视频后若字幕自动同步失败，清空旧字幕避免整体时序错位
      delete word.assets.subtitleData;
    }

    logCost("veo", "generateExampleVideos", estimatedCost, word.id);
    word.updatedAt = new Date().toISOString();
    saveList(list);
    res.json({
      success: true,
      data: word,
      meta: {
        requestedVideoCount,
        generatedVideoCount: result.paths.length,
        estimatedCost,
        subtitleAutoRegenerated,
        subtitleAutoError,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 重生成单条示例视频（自动同步重生对应字幕）
router.post("/video-single/:listId/:wordId/:exampleIndex", async (req, res) => {
  try {
    const { confirmed } = req.body;
    if (!confirmed) {
      const budget = checkBudget(1.2);
      return res.json({
        success: false,
        error: "需要确认",
        data: {
          estimatedCost: 1.2,
          budgetRemaining: budget.remaining,
          budgetOk: budget.ok,
        },
      });
    }

    const list = loadList(req.params.listId);
    if (!list) return res.status(404).json({ success: false, error: "未找到" });

    const word = findWord(list, req.params.wordId);
    if (!word) return res.status(404).json({ success: false, error: "单词未找到" });

    const exampleIndex = Number(req.params.exampleIndex);
    if (!Number.isInteger(exampleIndex) || exampleIndex < 0 || exampleIndex >= word.examples.length) {
      return res.status(400).json({ success: false, error: "exampleIndex 无效" });
    }

    const cfg = getEffectiveConfig(list);
    const videoDir = getListVideoDir(list.id);
    const outputFileName = `${word.id}_example_${exampleIndex}.mp4`;
    const outputPath = path.join(videoDir, outputFileName);
    const result = await generateVideo(
      word.word,
      word.examples[exampleIndex].english,
      outputPath,
      {
        model: cfg.models.video,
        promptTemplate: cfg.prompts.veoVideo,
      },
    );

    if (!word.assets.exampleVideoPaths) word.assets.exampleVideoPaths = [];
    if (!word.assets.exampleVideoDurations) word.assets.exampleVideoDurations = [];
    word.assets.exampleVideoPaths[exampleIndex] = videoRel(list.id, outputFileName);
    word.assets.exampleVideoDurations[exampleIndex] = result.durationSec;

    let subtitleAutoRegenerated = false;
    let subtitleAutoError: string | undefined;

    try {
      const refreshedVideoPath = path.join(
        PUBLIC_DIR,
        word.assets.exampleVideoPaths[exampleIndex],
      );
      const segments = await generateSubtitles(
        refreshedVideoPath,
        word.examples[exampleIndex].english,
        word.examples[exampleIndex].chinese,
        cfg.models.subtitle,
      );
      if (!word.assets.subtitleData) word.assets.subtitleData = [];
      word.assets.subtitleData[exampleIndex] = segments;
      subtitleAutoRegenerated = true;
      logCost("stt", `autoGenerateSubtitleAfterVideoRegenerate_${exampleIndex}`, 0.002, word.id);
    } catch (subtitleErr: any) {
      subtitleAutoError = subtitleErr?.message || "字幕自动重生失败";
      // 自动字幕失败时删除旧字幕，避免沿用过期时间戳导致错位
      if (word.assets.subtitleData?.[exampleIndex]) {
        delete word.assets.subtitleData[exampleIndex];
      }
    }

    word.updatedAt = new Date().toISOString();
    saveList(list);

    logCost("veo", `generateSingleExampleVideo_${exampleIndex}`, 1.2, word.id);
    res.json({
      success: true,
      data: word,
      meta: {
        subtitleAutoRegenerated,
        subtitleAutoError,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 生成字幕
router.post("/subtitles/:listId/:wordId", async (req, res) => {
  try {
    const list = loadList(req.params.listId);
    if (!list) return res.status(404).json({ success: false, error: "未找到" });

    const word = findWord(list, req.params.wordId);
    if (!word) return res.status(404).json({ success: false, error: "单词未找到" });

    if (!word.assets.exampleVideoPaths?.length) {
      return res.status(400).json({ success: false, error: "请先生成视频" });
    }

    const cfg = getEffectiveConfig(list);
    const subtitleData = [];
    for (let i = 0; i < word.assets.exampleVideoPaths.length; i++) {
      const videoPath = path.join(PUBLIC_DIR, word.assets.exampleVideoPaths[i]);
      const segments = await generateSubtitles(
        videoPath,
        word.examples[i].english,
        word.examples[i].chinese,
        cfg.models.subtitle,
      );
      subtitleData.push(segments);
    }

    word.assets.subtitleData = subtitleData;
    logCost("stt", "generateSubtitles", 0.004, word.id);
    word.status = "assets_ready";
    word.updatedAt = new Date().toISOString();
    saveList(list);
    res.json({ success: true, data: word });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 重生成单条字幕
router.post("/subtitle-single/:listId/:wordId/:exampleIndex", async (req, res) => {
  try {
    const list = loadList(req.params.listId);
    if (!list) return res.status(404).json({ success: false, error: "未找到" });

    const word = findWord(list, req.params.wordId);
    if (!word) return res.status(404).json({ success: false, error: "单词未找到" });

    const exampleIndex = Number(req.params.exampleIndex);
    if (!Number.isInteger(exampleIndex) || exampleIndex < 0) {
      return res.status(400).json({ success: false, error: "exampleIndex 无效" });
    }
    if (!word.assets.exampleVideoPaths?.[exampleIndex]) {
      return res.status(400).json({ success: false, error: "该条视频不存在，请先生成视频" });
    }
    if (!word.examples?.[exampleIndex]) {
      return res.status(400).json({ success: false, error: "该条例句不存在" });
    }

    const cfg = getEffectiveConfig(list);
    const videoPath = path.join(PUBLIC_DIR, word.assets.exampleVideoPaths[exampleIndex]);
    const segments = await generateSubtitles(
      videoPath,
      word.examples[exampleIndex].english,
      word.examples[exampleIndex].chinese,
      cfg.models.subtitle,
    );

    if (!word.assets.subtitleData) word.assets.subtitleData = [];
    word.assets.subtitleData[exampleIndex] = segments;
    word.updatedAt = new Date().toISOString();
    saveList(list);

    logCost("stt", `generateSingleSubtitle_${exampleIndex}`, 0.002, word.id);
    res.json({ success: true, data: word });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 完整流水线 (除 Veo 外)
router.post("/pipeline/:listId/:wordId", async (req, res) => {
  try {
    const list = loadList(req.params.listId);
    if (!list) return res.status(404).json({ success: false, error: "未找到" });

    const word = findWord(list, req.params.wordId);
    if (!word) return res.status(404).json({ success: false, error: "单词未找到" });
    const cfg = getEffectiveConfig(list);

    // Step 1: 内容生成
    if (word.status === "pending") {
      const content = await generateWordContent(word.word, {
        model: cfg.models.contentGeneration,
        prompt: cfg.prompts.contentGeneration,
      });
      Object.assign(word, content);
      word.status = "content_ready";
      logCost("gemini-flash", "generateWordContent", 0.001, word.id);
    }

    // Step 2: TTS
    const audioDir = getWordAudioDir(list.id, word.id);
    const ttsOverrides = {
      model: cfg.models.tts,
      voiceName: cfg.models.ttsVoice,
      englishVoicePrompt: cfg.prompts.englishVoice,
      chineseVoicePrompt: cfg.prompts.chineseVoice,
    };

    const scene4OutroPath = getScene4OutroRelPath(
      list.id,
      list.config?.media?.scene4OutroTtsPath,
    );
    const sharedScene4Outro = await ensureScene4OutroTts(PUBLIC_DIR, {
      relativePath: scene4OutroPath,
      overrides: ttsOverrides,
    });
    if (sharedScene4Outro.generated) {
      logCost("gemini-tts", "generateSharedScene4Outro", 0.01, "shared-scene4");
    }

    const chineseText = word.chineseMeaning;
    const chinese = await generateChineseTts(
      chineseText,
      path.join(audioDir, "chinese.wav"),
      ttsOverrides,
    );
    word.assets.chineseTtsPath = audioRel(list.id, word.id, "chinese.wav");
    word.assets.chineseTtsDuration = chinese.durationSec;

    const englishText = renderTemplate(cfg.prompts.englishWordTemplate, { word: word.word, englishMeaning: word.englishMeaning });
    const english = await generateEnglishTts(
      englishText,
      path.join(audioDir, "english.wav"),
      ttsOverrides,
    );
    word.assets.englishTtsPath = audioRel(list.id, word.id, "english.wav");
    word.assets.englishTtsDuration = english.durationSec;

    const patterns = await generatePatternTtsAssets({
      listId: list.id,
      wordId: word.id,
      patterns: word.patterns,
      audioDir,
      overrides: ttsOverrides,
    });
    word.assets.patternTtsPaths = patterns.paths;
    word.assets.patternTtsDurations = patterns.durations;
    ensureWordTtsSpeeds(word);
    logCost("gemini-tts", "generateAllTts", 0.05, word.id);

    // Step 3: 图片
    const imageDir = getWordImageDir(list.id, word.id);
    const outputPath = path.join(imageDir, "image.jpg");
    const imgResult = await fetchAndSaveImage(word.word, outputPath, "african american expression");
    if (imgResult) word.assets.imagePath = imageRel(list.id, word.id, "image.jpg");

    word.status = "assets_ready";
    word.updatedAt = new Date().toISOString();
    saveList(list);
    res.json({ success: true, data: word, note: "Veo 视频需单独生成" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取费用摘要
router.get("/cost", (_req, res) => {
  res.json({ success: true, data: getCostSummary() });
});

export default router;
