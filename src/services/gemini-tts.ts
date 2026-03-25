import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";
import { loadConfig } from "./config.js";

let _ai: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!_ai) {
    const cfg = loadConfig();
    _ai = new GoogleGenAI({ vertexai: true, project: cfg.gcp.project, location: cfg.gcp.location });
  }
  return _ai;
}
export function resetTtsClient() { _ai = null; }

export interface TtsOverrides {
  model?: string;
  voiceName?: string;
  englishVoicePrompt?: string;
  chineseVoicePrompt?: string;
}

/** 将 raw PCM 16-bit 24kHz 单声道转为 WAV 文件 */
function pcmToWav(pcmBuffer: Buffer): Buffer {
  const sampleRate = 24000;
  const bitsPerSample = 16;
  const numChannels = 1;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const headerSize = 44;

  const wav = Buffer.alloc(headerSize + dataSize);

  // RIFF header
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write("WAVE", 8);

  // fmt chunk
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16); // chunk size
  wav.writeUInt16LE(1, 20); // PCM format
  wav.writeUInt16LE(numChannels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(byteRate, 28);
  wav.writeUInt16LE(blockAlign, 32);
  wav.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  wav.write("data", 36);
  wav.writeUInt32LE(dataSize, 40);
  pcmBuffer.copy(wav, 44);

  return wav;
}

/** 计算 PCM 音频时长(秒) */
function pcmDuration(pcmBuffer: Buffer): number {
  return pcmBuffer.length / (24000 * 2); // 24kHz, 16-bit = 2 bytes/sample
}

async function generateTts(
  text: string,
  voicePrompt: string,
  overrides?: TtsOverrides,
): Promise<{ pcmBuffer: Buffer; durationSec: number }> {
  const cfg = loadConfig();
  const fullText = `${voicePrompt}\n\nSay the following:\n${text}`;

  const response = await getAI().models.generateContent({
    model: overrides?.model || cfg.models.tts,
    contents: [{ role: "user", parts: [{ text: fullText }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: overrides?.voiceName || cfg.models.ttsVoice },
        },
      },
    },
  });

  const audioData =
    response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!audioData) {
    throw new Error("TTS 未返回音频数据");
  }

  const pcmBuffer = Buffer.from(audioData, "base64");
  const durationSec = pcmDuration(pcmBuffer);

  return { pcmBuffer, durationSec };
}

/** 生成英文 TTS 并保存为 WAV */
export async function generateEnglishTts(
  text: string,
  outputPath: string,
  overrides?: TtsOverrides,
): Promise<{ path: string; durationSec: number }> {
  const cfg = loadConfig();
  const { pcmBuffer, durationSec } = await generateTts(
    text,
    overrides?.englishVoicePrompt || cfg.prompts.englishVoice,
    overrides,
  );
  const wavBuffer = pcmToWav(pcmBuffer);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, wavBuffer);

  return { path: outputPath, durationSec };
}

/** 生成中文 TTS 并保存为 WAV */
export async function generateChineseTts(
  text: string,
  outputPath: string,
  overrides?: TtsOverrides,
): Promise<{ path: string; durationSec: number }> {
  const cfg = loadConfig();
  const { pcmBuffer, durationSec } = await generateTts(
    text,
    overrides?.chineseVoicePrompt || cfg.prompts.chineseVoice,
    overrides,
  );
  const wavBuffer = pcmToWav(pcmBuffer);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, wavBuffer);

  return { path: outputPath, durationSec };
}

/** 批量生成句式 TTS */
export async function generatePatternsTts(
  patterns: string[],
  outputDir: string,
  wordId: string,
  overrides?: TtsOverrides,
): Promise<{ paths: string[]; durations: number[] }> {
  const paths: string[] = [];
  const durations: number[] = [];

  for (let i = 0; i < patterns.length; i++) {
    const outputPath = path.join(outputDir, `${wordId}_pattern_${i}.wav`);
    const result = await generateEnglishTts(patterns[i], outputPath, overrides);
    paths.push(`audio/${wordId}_pattern_${i}.wav`);
    durations.push(result.durationSec);
  }

  return { paths, durations };
}
