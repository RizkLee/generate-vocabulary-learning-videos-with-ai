import { GoogleGenAI } from "@google/genai";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { loadConfig, renderTemplate } from "./config.js";

const FFMPEG_PATH = process.env.FFMPEG_PATH || "ffmpeg";
const EXAMPLE_VIDEO_VOLUME_BOOST = 1.2;

let _ai: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!_ai) {
    const cfg = loadConfig();
    _ai = new GoogleGenAI({ vertexai: true, project: cfg.gcp.project, location: cfg.gcp.location });
  }
  return _ai;
}
export function resetVeoClient() { _ai = null; }

function boostVideoAudioVolume(videoPath: string, factor: number): void {
  const ext = path.extname(videoPath);
  const base = path.basename(videoPath, ext);
  const dir = path.dirname(videoPath);
  const boostedPath = path.join(dir, `${base}_boosted${ext}`);

  const cmd = `"${FFMPEG_PATH}" -y -i "${videoPath}" -filter:a "volume=${factor}" -c:v copy -c:a aac -movflags +faststart "${boostedPath}"`;
  execSync(cmd, { stdio: "pipe" });

  fs.renameSync(boostedPath, videoPath);
}

export interface VeoGenerationOverrides {
  model?: string;
  promptTemplate?: string;
}

/** 构建 Veo 视频生成 Prompt */
function buildVideoPrompt(
  word: string,
  exampleSentence: string,
  overrides?: VeoGenerationOverrides,
): string {
  const cfg = loadConfig();
  return renderTemplate(overrides?.promptTemplate || cfg.prompts.veoVideo, {
    word,
    exampleSentence,
    sentence: exampleSentence,
  });
}

/** 生成单个 Veo 视频 */
export async function generateVideo(
  word: string,
  exampleSentence: string,
  outputPath: string,
  overrides?: VeoGenerationOverrides,
): Promise<{ path: string; durationSec: number }> {
  const cfg = loadConfig();
  const prompt = buildVideoPrompt(word, exampleSentence, overrides);

  let operation = await getAI().models.generateVideos({
    model: overrides?.model || cfg.models.video,
    prompt,
    config: {
      aspectRatio: "16:9",
      numberOfVideos: 1,
      durationSeconds: 8,
      personGeneration: "allow_adult",
      generateAudio: true,
    },
  });

  // 轮询等待完成 (使用 getVideosOperation)
  while (!operation.done) {
    console.log(`  [Veo] 等待视频生成... (${operation.name?.split("/").pop()})`);
    await new Promise((resolve) => setTimeout(resolve, 15000));
    operation = await getAI().operations.getVideosOperation({ operation });
  }

  // 提取视频数据
  const videos = operation.response?.generatedVideos;
  console.log(`  [Veo] response keys:`, Object.keys(operation.response || {}));
  console.log(`  [Veo] videos count:`, videos?.length);
  if (videos?.[0]) {
    console.log(`  [Veo] video[0] keys:`, Object.keys(videos[0]));
    if (videos[0].video) {
      console.log(`  [Veo] video.video keys:`, Object.keys(videos[0].video));
    }
  } else {
    console.log(`  [Veo] Full response:`, JSON.stringify(operation, null, 2).slice(0, 1000));
  }
  if (!videos || videos.length === 0) {
    const raiCount = (operation.response as any)?.raiMediaFilteredCount;
    throw new Error(`Veo 未返回视频${raiCount ? ` (${raiCount} 个被内容审核过滤)` : ""}`);
  }

  const videoData = videos[0].video?.videoBytes;
  if (!videoData) {
    throw new Error("Veo 视频数据为空");
  }

  const videoBuffer = Buffer.from(videoData, "base64");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, videoBuffer);

  // 提升例句视频原始音量，避免最终合成时人声过小。
  try {
    boostVideoAudioVolume(outputPath, EXAMPLE_VIDEO_VOLUME_BOOST);
  } catch (err: any) {
    console.warn(`[Veo] 音量增强失败，使用原始音轨: ${err.message}`);
  }

  return { path: outputPath, durationSec: 8 };
}

/** 为一个单词生成所有例句视频 */
export async function generateExampleVideos(
  word: string,
  examples: Array<{ english: string }>,
  outputDir: string,
  wordId: string,
  overrides?: VeoGenerationOverrides,
): Promise<{ paths: string[]; durations: number[] }> {
  const paths: string[] = [];
  const durations: number[] = [];

  for (let i = 0; i < examples.length; i++) {
    const outputPath = path.join(outputDir, `${wordId}_example_${i}.mp4`);
    const result = await generateVideo(word, examples[i].english, outputPath, overrides);
    paths.push(`videos/${wordId}_example_${i}.mp4`);
    durations.push(result.durationSec);
  }

  return { paths, durations };
}
