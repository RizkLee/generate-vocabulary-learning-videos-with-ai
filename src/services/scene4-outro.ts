import fs from "fs";
import path from "path";
import { generateChineseTts, type TtsOverrides } from "./gemini-tts.js";

export const SCENE4_OUTRO_TEXT = "嘿，快去评论区练练手吧！";
export const DEFAULT_SCENE4_OUTRO_TTS_SPEED = 1;
export const MIN_SCENE4_OUTRO_TTS_SPEED = 0.8;
export const MAX_SCENE4_OUTRO_TTS_SPEED = 1.6;

export function normalizeScene4OutroTtsSpeed(speed?: number): number {
  if (!Number.isFinite(speed)) return DEFAULT_SCENE4_OUTRO_TTS_SPEED;
  return Math.min(
    MAX_SCENE4_OUTRO_TTS_SPEED,
    Math.max(MIN_SCENE4_OUTRO_TTS_SPEED, Number(speed)),
  );
}

export function getScene4OutroRelPath(
  listId: string,
  configuredPath?: string,
): string {
  if (configuredPath && configuredPath.trim()) {
    return configuredPath.replace(/\\/g, "/").replace(/^\/+/, "");
  }
  return path.posix.join("audio", listId, "scene4_outro.wav");
}

interface EnsureScene4OutroOptions {
  relativePath?: string;
  overrides?: TtsOverrides;
  forceRegenerate?: boolean;
  text?: string;
}

function resolveEnsureOptions(
  options?: TtsOverrides | EnsureScene4OutroOptions,
): EnsureScene4OutroOptions {
  if (!options) return {};

  const maybeEnsureOptions = options as EnsureScene4OutroOptions;
  if (
    "relativePath" in maybeEnsureOptions ||
    "overrides" in maybeEnsureOptions ||
    "forceRegenerate" in maybeEnsureOptions ||
    "text" in maybeEnsureOptions
  ) {
    return maybeEnsureOptions;
  }

  return { overrides: options as TtsOverrides };
}

const WAV_HEADER_BYTES = 44;
const PCM_SAMPLE_RATE = 24000;
const PCM_BYTES_PER_SAMPLE = 2;

function getWavDurationBySize(absPath: string): number {
  const stat = fs.statSync(absPath);
  const dataBytes = Math.max(0, stat.size - WAV_HEADER_BYTES);
  return dataBytes / (PCM_SAMPLE_RATE * PCM_BYTES_PER_SAMPLE);
}

export async function ensureScene4OutroTts(
  publicDir: string,
  options?: TtsOverrides | EnsureScene4OutroOptions,
): Promise<{
  relativePath: string;
  absolutePath: string;
  durationSec: number;
  generated: boolean;
}> {
  const ensureOptions = resolveEnsureOptions(options);
  const relativePath =
    ensureOptions.relativePath?.replace(/\\/g, "/") ||
    path.posix.join("audio", "shared", "scene4_comment_practice.wav");
  const absolutePath = path.join(publicDir, relativePath);

  if (!ensureOptions.forceRegenerate && fs.existsSync(absolutePath)) {
    return {
      relativePath,
      absolutePath,
      durationSec: getWavDurationBySize(absolutePath),
      generated: false,
    };
  }

  const generated = await generateChineseTts(
    ensureOptions.text || SCENE4_OUTRO_TEXT,
    absolutePath,
    ensureOptions.overrides,
  );

  return {
    relativePath,
    absolutePath,
    durationSec: generated.durationSec,
    generated: true,
  };
}
