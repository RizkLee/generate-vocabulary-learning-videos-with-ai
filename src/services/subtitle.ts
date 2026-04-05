import { GoogleGenAI } from "@google/genai";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import type { SubtitleSegment } from "../types/index";
import { loadConfig } from "./config.js";

let _ai: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!_ai) {
    const cfg = loadConfig();
    _ai = new GoogleGenAI({ vertexai: true, project: cfg.gcp.project, location: cfg.gcp.location });
  }
  return _ai;
}
export function resetSubtitleClient() { _ai = null; }

const FFMPEG_PATH = process.env.FFMPEG_PATH || "ffmpeg";
const MAX_SUBTITLE_GAP_SEC = 0.2;
const TIMESTAMP_PRECISION = 3;

/** 从文本中提取 JSON（处理可能的 markdown 包裹） */
function extractJson(text: string): string {
  const match = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  return match ? match[1].trim() : text.trim();
}

/** 从 MP4 提取音频为 WAV */
function extractAudio(videoPath: string): string {
  const audioPath = videoPath.replace(/\.mp4$/, "_audio.wav");
  execSync(
    `"${FFMPEG_PATH}" -y -i "${videoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioPath}"`,
    { stdio: "pipe" },
  );
  return audioPath;
}

/**
 * 收紧相邻字幕片段之间的时间间隔。
 * 若 gap > 0.2s，则将下一句 startTime 修正为上一句 endTime + 0.2s。
 */
function tightenSubtitleTimeline(segments: SubtitleSegment[]): SubtitleSegment[] {
  if (!Array.isArray(segments) || segments.length <= 1) return segments;

  const next = segments.map((seg) => ({
    ...seg,
    startTime: Number(seg.startTime),
    endTime: Number(seg.endTime),
  }));

  for (let i = 1; i < next.length; i++) {
    const prev = next[i - 1];
    const curr = next[i];

    if (!Number.isFinite(prev.endTime) || !Number.isFinite(curr.startTime)) {
      continue;
    }

    const gap = curr.startTime - prev.endTime;
    if (gap > MAX_SUBTITLE_GAP_SEC + 1e-6) {
      const adjustedStart = Number(
        (prev.endTime + MAX_SUBTITLE_GAP_SEC).toFixed(TIMESTAMP_PRECISION),
      );

      curr.startTime = adjustedStart;

      // 兜底保护：避免异常数据导致 startTime 超过 endTime
      if (Number.isFinite(curr.endTime) && curr.startTime > curr.endTime) {
        curr.startTime = curr.endTime;
      }
    }
  }

  return next;
}

/** 带重试的 Gemini 调用 */
async function callWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 60000,
): Promise<T> {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      const is429 = err.message?.includes("429") || err.message?.includes("RESOURCE_EXHAUSTED");
      if (is429 && i < maxRetries) {
        console.log(`  [Subtitle] 429 限流，等待 ${delayMs / 1000}s 后重试... (${i + 1}/${maxRetries})`);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error("max retries exceeded");
}

/** 使用 Gemini 转录音频并获取时间戳 */
async function transcribeAudio(
  audioPath: string,
  modelOverride?: string,
): Promise<string> {
  const cfg = loadConfig();
  const audioBytes = fs.readFileSync(audioPath);
  const base64Audio = audioBytes.toString("base64");

  const response = await getAI().models.generateContent({
    model: modelOverride || cfg.models.subtitle,
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: "audio/wav",
              data: base64Audio,
            },
          },
          {
            text: `Transcribe this audio with timestamps. For each sentence, provide:
- The exact text spoken
- Start time in seconds
- End time in seconds

Output in JSON format:
[{"text": "sentence", "startTime": 0.0, "endTime": 2.5}, ...]`,
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
    },
  });

  return response.text || "[]";
}

/** 使用 Gemini 校验字幕与原文 */
async function verifySubtitles(
  transcription: string,
  originalEnglish: string,
  originalChinese: string,
  modelOverride?: string,
): Promise<SubtitleSegment[]> {
  const cfg = loadConfig();
  const response = await getAI().models.generateContent({
    model: modelOverride || cfg.models.subtitle,
    contents: `请校验以下 AI 转录的字幕，与原文例句进行对比，修正错别字词。

原文英文：${originalEnglish}
原文中文翻译：${originalChinese}

AI 转录结果：${transcription}

请输出校验后的字幕数据，保持时间戳不变，修正文本错误，并添加中文翻译。
输出纯 JSON 数组格式（不要 markdown 代码块）：
[{"text": "corrected English", "translation": "中文翻译", "startTime": 0.0, "endTime": 2.5}, ...]`,
  });

  const text = response.text;
  if (!text) return [];
  return JSON.parse(extractJson(text));
}

/** 为单个视频生成字幕 */
export async function generateSubtitles(
  videoPath: string,
  originalEnglish: string,
  originalChinese: string,
  modelOverride?: string,
): Promise<SubtitleSegment[]> {
  // 1. 提取音频
  const audioPath = extractAudio(videoPath);

  // 2. 转录 (带重试)
  const transcription = await callWithRetry(() => transcribeAudio(audioPath, modelOverride));

  // 3. 校验 (带重试)
  const verifiedSegments = await callWithRetry(() =>
    verifySubtitles(transcription, originalEnglish, originalChinese, modelOverride),
  );

  const segments = tightenSubtitleTimeline(verifiedSegments);

  // 清理临时音频文件
  try {
    fs.unlinkSync(audioPath);
  } catch {}

  return segments;
}
