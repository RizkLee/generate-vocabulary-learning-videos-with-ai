import { Router } from "express";
import path from "path";
import fs from "fs";
import type { RenderJob, WordList } from "../../types/index.js";
import { v4 as uuid } from "uuid";
import { generateWordCovers } from "../../services/cover.js";
import {
  ensureScene4OutroTts,
  getScene4OutroRelPath,
  normalizeScene4OutroTtsSpeed,
} from "../../services/scene4-outro.js";

const router = Router();
const DATA_DIR = path.resolve("data/wordlists");
const OUTPUT_DIR = path.resolve("output");
const PUBLIC_DIR = path.resolve("public");

// 渲染任务存储 (内存)
const renderJobs = new Map<string, RenderJob>();

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

// 提交渲染任务
router.post("/:listId/:wordId", async (req, res) => {
  try {
    const list = loadList(req.params.listId);
    if (!list) return res.status(404).json({ success: false, error: "未找到" });

    const word = list.words.find((w) => w.id === req.params.wordId);
    if (!word) return res.status(404).json({ success: false, error: "单词未找到" });

    const job: RenderJob = {
      id: uuid(),
      wordId: word.id,
      status: "queued",
      progress: 0,
      startedAt: new Date().toISOString(),
    };
    renderJobs.set(job.id, job);

    // 异步执行渲染
    renderWord(job, list.id, word.id).catch((err) => {
      job.status = "error";
      job.error = err.message;
    });

    res.json({ success: true, data: job });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 查询渲染进度
router.get("/jobs/:jobId", (req, res) => {
  const job = renderJobs.get(req.params.jobId);
  if (!job)
    return res.status(404).json({ success: false, error: "任务未找到" });
  res.json({ success: true, data: job });
});

// 列出所有渲染任务
router.get("/jobs", (_req, res) => {
  const jobs = Array.from(renderJobs.values()).sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
  res.json({ success: true, data: jobs });
});

// 下载渲染成品
router.get("/output/:wordId", (req, res) => {
  const file = path.join(OUTPUT_DIR, `${req.params.wordId}.mp4`);
  if (!fs.existsSync(file))
    return res.status(404).json({ success: false, error: "文件未找到" });
  res.sendFile(file);
});

// 重新生成视频封面（4:3 + 16:9）
router.post("/cover/:listId/:wordId", (req, res) => {
  try {
    const list = loadList(req.params.listId);
    if (!list) return res.status(404).json({ success: false, error: "未找到" });

    const word = list.words.find((w) => w.id === req.params.wordId);
    if (!word) return res.status(404).json({ success: false, error: "单词未找到" });

    const result = generateWordCovers(list, word, PUBLIC_DIR);
    word.assets.videoCover4x3Path = result.cover4x3Path;
    word.assets.videoCover16x9Path = result.cover16x9Path;
    word.updatedAt = new Date().toISOString();
    list.updatedAt = word.updatedAt;
    saveList(list);

    res.json({ success: true, data: word });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

/** 执行实际渲染 */
async function renderWord(
  job: RenderJob,
  listId: string,
  wordId: string,
): Promise<void> {
  job.status = "bundling";
  job.progress = 0.1;

  // 动态导入 Remotion (避免顶层导入影响非渲染场景)
  const { bundle } = await import("@remotion/bundler");
  const { renderMedia, selectComposition } = await import(
    "@remotion/renderer"
  );

  const entryPoint = path.resolve("src/remotion/index.ts");
  const serveUrl = await bundle({ entryPoint });

  job.status = "rendering";
  job.progress = 0.2;

  const list = loadList(listId);
  if (!list) throw new Error("单词本未找到");
  const word = list.words.find((w) => w.id === wordId);
  if (!word) throw new Error("单词未找到");

  const bgVideoSrc =
    list.config?.media?.backgroundVideoPath || "videos/background.mp4";
  const bgmSrc = list.config?.media?.bgmPath || "audio/bgm.mp3";
  const scene4OutroPath = getScene4OutroRelPath(
    list.id,
    list.config?.media?.scene4OutroTtsPath,
  );
  const scene4OutroSpeed = normalizeScene4OutroTtsSpeed(
    list.config?.media?.scene4OutroTtsSpeed,
  );
  const scene4Outro = await ensureScene4OutroTts(PUBLIC_DIR, {
    relativePath: scene4OutroPath,
  });

  const currentWordIndex = list.words.findIndex((w) => w.id === wordId);
  const prevWord =
    currentWordIndex > 0 ? list.words[currentWordIndex - 1] : undefined;

  const lastExampleVideoSrc =
    word.assets.exampleVideoPaths?.length
      ? word.assets.exampleVideoPaths[word.assets.exampleVideoPaths.length - 1]
      : undefined;

  const inputProps = {
    word,
    bgVideoSrc,
    bgmSrc,
    fps: 30,
    previewMode: false,
    scene4OutroTtsPath: scene4Outro.relativePath,
    scene4OutroTtsDuration: scene4Outro.durationSec,
    scene4OutroTtsSpeed: scene4OutroSpeed,
    scene4PrevCoverSrc: prevWord?.assets.videoCover16x9Path,
    scene4PrevWord: prevWord?.word,
    scene4LastExampleVideoSrc: lastExampleVideoSrc,
  };

  const composition = await selectComposition({
    serveUrl,
    id: "WestCoastWord",
    inputProps,
    browserExecutable: CHROME_PATH,
  });

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, `${wordId}.mp4`);

  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: outputPath,
    inputProps,
    browserExecutable: CHROME_PATH,
    onProgress: ({ progress }) => {
      job.progress = 0.2 + progress * 0.8;
    },
  });

  job.status = "done";
  job.progress = 1;
  job.outputPath = outputPath;
  job.completedAt = new Date().toISOString();

  // 更新单词状态
  const updatedList = loadList(listId);
  if (updatedList) {
    const updatedWord = updatedList.words.find((w) => w.id === wordId);
    if (updatedWord) {
      updatedWord.status = "rendered";
      updatedWord.updatedAt = new Date().toISOString();

      try {
        const coverResult = generateWordCovers(
          updatedList,
          updatedWord,
          PUBLIC_DIR,
        );
        updatedWord.assets.videoCover4x3Path = coverResult.cover4x3Path;
        updatedWord.assets.videoCover16x9Path = coverResult.cover16x9Path;
      } catch (err: any) {
        console.warn(`[Render] 自动生成封面失败，跳过: ${err.message}`);
      }

      updatedList.updatedAt = updatedWord.updatedAt;
      saveList(updatedList);
    }
  }
}

export default router;
