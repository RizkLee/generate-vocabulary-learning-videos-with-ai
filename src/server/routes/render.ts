import { Router } from "express";
import path from "path";
import fs from "fs";
import type { RenderJob, WordList } from "../../types/index.js";
import { v4 as uuid } from "uuid";

const router = Router();
const DATA_DIR = path.resolve("data/wordlists");
const OUTPUT_DIR = path.resolve("output");

// 渲染任务存储 (内存)
const renderJobs = new Map<string, RenderJob>();

function loadList(listId: string): WordList | null {
  const file = path.join(DATA_DIR, `${listId}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8"));
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

  const inputProps = {
    word,
    bgVideoSrc: "videos/background.mp4",
    bgmSrc: "audio/bgm.mp3",
    fps: 30,
    previewMode: false,
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
      fs.writeFileSync(
        path.join(DATA_DIR, `${listId}.json`),
        JSON.stringify(updatedList, null, 2),
      );
    }
  }
}

export default router;
