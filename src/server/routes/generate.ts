import { Router } from "express";
import fs from "fs";
import path from "path";
import type { WordList, WordEntry } from "../../types/index.js";
import { generateWordContent, generateWordList } from "../../services/gemini-content.js";
import {
  generateChineseTts,
  generateEnglishTts,
  generatePatternsTts,
} from "../../services/gemini-tts.js";
import { fetchAndSaveImage } from "../../services/pixabay.js";
import { generateExampleVideos, generateVideo } from "../../services/veo.js";
import { generateSubtitles } from "../../services/subtitle.js";
import { logCost, checkBudget, getCostSummary } from "../../services/cost-tracker.js";
import { loadConfig, renderTemplate, type AppConfig } from "../../services/config.js";

const router = Router();
const DATA_DIR = path.resolve("data/wordlists");
const PUBLIC_DIR = path.resolve("public");

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
    const { theme, count } = req.body;
    const words = await generateWordList(theme, count || 10);
    logCost("gemini-flash", "generateWordList", 0.005, "batch");
    res.json({ success: true, data: words });
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

    const audioDir = path.join(PUBLIC_DIR, "audio");
    const cfg = getEffectiveConfig(list);
    const ttsOverrides = {
      model: cfg.models.tts,
      voiceName: cfg.models.ttsVoice,
      englishVoicePrompt: cfg.prompts.englishVoice,
      chineseVoicePrompt: cfg.prompts.chineseVoice,
    };

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
    word.assets.chineseIntroTtsPath = "audio/chinese_intro.wav";
    word.assets.chineseIntroTtsDuration = introDuration;

    // 中文 TTS - 单词释义 (每词不同)
    const wordChineseText = renderTemplate(cfg.prompts.chineseWordTemplate, { chineseMeaning: word.chineseMeaning });
    const chineseWord = await generateChineseTts(
      wordChineseText,
      path.join(audioDir, `${word.id}_chinese_word.wav`),
      ttsOverrides,
    );
    word.assets.chineseWordTtsPath = `audio/${word.id}_chinese_word.wav`;
    word.assets.chineseWordTtsDuration = chineseWord.durationSec;

    // 英文 TTS
    const englishText = renderTemplate(cfg.prompts.englishWordTemplate, { word: word.word, englishMeaning: word.englishMeaning });
    const english = await generateEnglishTts(
      englishText,
      path.join(audioDir, `${word.id}_english.wav`),
      ttsOverrides,
    );
    word.assets.englishTtsPath = `audio/${word.id}_english.wav`;
    word.assets.englishTtsDuration = english.durationSec;

    // 句式 TTS
    const patterns = await generatePatternsTts(
      word.patterns,
      audioDir,
      word.id,
      ttsOverrides,
    );
    word.assets.patternTtsPaths = patterns.paths;
    word.assets.patternTtsDurations = patterns.durations;

    logCost("gemini-tts", "generateAllTts", 0.05, word.id);
    word.updatedAt = new Date().toISOString();
    saveList(list);
    res.json({ success: true, data: word });
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

    const audioDir = path.join(PUBLIC_DIR, "audio");
    const cfg = getEffectiveConfig(list);
    const ttsType = req.params.ttsType;
    const ttsOverrides = {
      model: cfg.models.tts,
      voiceName: cfg.models.ttsVoice,
      englishVoicePrompt: cfg.prompts.englishVoice,
      chineseVoicePrompt: cfg.prompts.chineseVoice,
    };

    if (ttsType === "chinese_word") {
      const text = renderTemplate(cfg.prompts.chineseWordTemplate, { chineseMeaning: word.chineseMeaning });
      const r = await generateChineseTts(text, path.join(audioDir, `${word.id}_chinese_word.wav`), ttsOverrides);
      word.assets.chineseWordTtsPath = `audio/${word.id}_chinese_word.wav`;
      word.assets.chineseWordTtsDuration = r.durationSec;
    } else if (ttsType === "english") {
      const text = renderTemplate(cfg.prompts.englishWordTemplate, { word: word.word, englishMeaning: word.englishMeaning });
      const r = await generateEnglishTts(text, path.join(audioDir, `${word.id}_english.wav`), ttsOverrides);
      word.assets.englishTtsPath = `audio/${word.id}_english.wav`;
      word.assets.englishTtsDuration = r.durationSec;
    } else if (ttsType.startsWith("pattern_")) {
      const idx = parseInt(ttsType.split("_")[1]);
      if (idx >= 0 && idx < word.patterns.length) {
        const r = await generateEnglishTts(word.patterns[idx], path.join(audioDir, `${word.id}_pattern_${idx}.wav`), ttsOverrides);
        if (!word.assets.patternTtsPaths) word.assets.patternTtsPaths = [];
        if (!word.assets.patternTtsDurations) word.assets.patternTtsDurations = [];
        word.assets.patternTtsPaths[idx] = `audio/${word.id}_pattern_${idx}.wav`;
        word.assets.patternTtsDurations[idx] = r.durationSec;
      }
    } else if (ttsType === "chinese_intro") {
      const r = await generateChineseTts(cfg.prompts.chineseIntro, path.join(audioDir, "chinese_intro.wav"), ttsOverrides);
      word.assets.chineseIntroTtsPath = "audio/chinese_intro.wav";
      word.assets.chineseIntroTtsDuration = r.durationSec;
    }

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

    const outputPath = path.join(PUBLIC_DIR, "images", `${word.id}.jpg`);
    const result = await fetchAndSaveImage(
      word.word,
      outputPath,
      "african american expression",
    );

    if (result) {
      word.assets.imagePath = `images/${word.id}.jpg`;
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
    if (!confirmed) {
      const budget = checkBudget(2.4);
      return res.json({
        success: false,
        error: "需要确认",
        data: {
          estimatedCost: 2.4,
          budgetRemaining: budget.remaining,
          budgetOk: budget.ok,
        },
      });
    }

    const list = loadList(req.params.listId);
    if (!list) return res.status(404).json({ success: false, error: "未找到" });

    const word = findWord(list, req.params.wordId);
    if (!word) return res.status(404).json({ success: false, error: "单词未找到" });

    const videoDir = path.join(PUBLIC_DIR, "videos");
    const cfg = getEffectiveConfig(list);
    const result = await generateExampleVideos(
      word.word,
      word.examples,
      videoDir,
      word.id,
      {
        model: cfg.models.video,
        promptTemplate: cfg.prompts.veoVideo,
      },
    );

    word.assets.exampleVideoPaths = result.paths;
    word.assets.exampleVideoDurations = result.durations;
    logCost("veo", "generateExampleVideos", 2.4, word.id);
    word.updatedAt = new Date().toISOString();
    saveList(list);
    res.json({ success: true, data: word });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 重生成单条示例视频
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
    const videoDir = path.join(PUBLIC_DIR, "videos");
    const outputPath = path.join(videoDir, `${word.id}_example_${exampleIndex}.mp4`);
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
    word.assets.exampleVideoPaths[exampleIndex] = `videos/${word.id}_example_${exampleIndex}.mp4`;
    word.assets.exampleVideoDurations[exampleIndex] = result.durationSec;
    word.updatedAt = new Date().toISOString();
    saveList(list);

    logCost("veo", `generateSingleExampleVideo_${exampleIndex}`, 1.2, word.id);
    res.json({ success: true, data: word });
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
    const audioDir = path.join(PUBLIC_DIR, "audio");
    const ttsOverrides = {
      model: cfg.models.tts,
      voiceName: cfg.models.ttsVoice,
      englishVoicePrompt: cfg.prompts.englishVoice,
      chineseVoicePrompt: cfg.prompts.chineseVoice,
    };
    const chineseText = renderTemplate(cfg.prompts.chineseWordTemplate, { chineseMeaning: word.chineseMeaning });
    const chinese = await generateChineseTts(
      chineseText,
      path.join(audioDir, `${word.id}_chinese.wav`),
      ttsOverrides,
    );
    word.assets.chineseTtsPath = `audio/${word.id}_chinese.wav`;
    word.assets.chineseTtsDuration = chinese.durationSec;

    const englishText = renderTemplate(cfg.prompts.englishWordTemplate, { word: word.word, englishMeaning: word.englishMeaning });
    const english = await generateEnglishTts(
      englishText,
      path.join(audioDir, `${word.id}_english.wav`),
      ttsOverrides,
    );
    word.assets.englishTtsPath = `audio/${word.id}_english.wav`;
    word.assets.englishTtsDuration = english.durationSec;

    const patterns = await generatePatternsTts(word.patterns, audioDir, word.id, ttsOverrides);
    word.assets.patternTtsPaths = patterns.paths;
    word.assets.patternTtsDurations = patterns.durations;
    logCost("gemini-tts", "generateAllTts", 0.05, word.id);

    // Step 3: 图片
    const outputPath = path.join(PUBLIC_DIR, "images", `${word.id}.jpg`);
    const imgResult = await fetchAndSaveImage(word.word, outputPath, "african american expression");
    if (imgResult) word.assets.imagePath = `images/${word.id}.jpg`;

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
