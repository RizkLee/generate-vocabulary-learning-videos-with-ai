import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import type { WordEntry, WordList } from "../types/index";

const FFMPEG_PATH = process.env.FFMPEG_PATH || "ffmpeg";
const DEFAULT_HIGHLIGHT_COLOR = "#F5A623";

interface CoverTextConfig {
  titlePrefix: string;
  titleHighlight: string;
  titleSuffix: string;
  highlightColor: string;
}

export interface CoverGenerationResult {
  cover4x3Path: string;
  cover16x9Path: string;
}

function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

function toPublicRel(...parts: string[]): string {
  return path.posix.join(
    ...parts
      .filter((p) => !!p)
      .map((p) => p.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")),
  );
}

function escapeDrawtextText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/%/g, "\\%")
    .replace(/\n/g, " ");
}

function escapeFilterPath(filePath: string): string {
  return toPosix(filePath).replace(/:/g, "\\:");
}

function approxTextWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const ch of text) {
    width += /[\x20-\x7E]/.test(ch) ? fontSize * 0.56 : fontSize;
  }
  return Math.round(width);
}

function pickFontPath(candidates: string[]): string | undefined {
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

function buildDrawtext(params: {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  fontFile?: string;
}): string {
  const parts = [
    `text='${escapeDrawtextText(params.text)}'`,
    `x=${params.x}`,
    `y=${params.y}`,
    `fontsize=${params.fontSize}`,
    `fontcolor=${params.color}`,
    "shadowcolor=black@0.45",
    "shadowx=2",
    "shadowy=2",
    "line_spacing=4",
  ];
  if (params.fontFile) {
    parts.push(`fontfile='${escapeFilterPath(params.fontFile)}'`);
  }
  return `drawtext=${parts.join(":")}`;
}

function resolveInputPath(candidate: string): string | null {
  if (!candidate.trim()) return null;

  const normalized = candidate.trim();
  const checks = [
    normalized,
    path.resolve(normalized),
    path.resolve("public", normalized),
    path.resolve("Material", normalized),
  ];

  for (const p of checks) {
    if (fs.existsSync(p)) return p;
  }

  return null;
}

function ensureDefaultBackgroundInPublic(): string {
  const publicPath = path.resolve("public/images/video-cover.png");
  if (fs.existsSync(publicPath)) return publicPath;

  const materialPath = path.resolve("Material/video-cover.png");
  fs.mkdirSync(path.dirname(publicPath), { recursive: true });

  if (fs.existsSync(materialPath)) {
    fs.copyFileSync(materialPath, publicPath);
    return publicPath;
  }

  execFileSync(
    FFMPEG_PATH,
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=#1a1a1f:s=1920x1080",
      "-frames:v",
      "1",
      publicPath,
    ],
    { stdio: "pipe" },
  );
  return publicPath;
}

function getCoverTextConfig(list: WordList): CoverTextConfig {
  const coverCfg = list.config?.cover;
  return {
    titlePrefix: coverCfg?.titlePrefix || "每天一个",
    titleHighlight: coverCfg?.titleHighlight || "西海岸",
    titleSuffix: coverCfg?.titleSuffix || "单词",
    highlightColor: coverCfg?.highlightColor || DEFAULT_HIGHLIGHT_COLOR,
  };
}

function resolveBackgroundPath(list: WordList): string {
  const configured = list.config?.cover?.backgroundImagePath;
  if (configured) {
    const p = resolveInputPath(configured);
    if (p) return p;
  }
  return ensureDefaultBackgroundInPublic();
}

function renderCover(params: {
  backgroundPath: string;
  outputPath: string;
  width: number;
  height: number;
  word: WordEntry;
  textConfig: CoverTextConfig;
}): void {
  const { backgroundPath, outputPath, width, height, word, textConfig } = params;

  const sansBold = pickFontPath([
    "C:/Windows/Fonts/msyhbd.ttc",
    "C:/Windows/Fonts/simhei.ttf",
  ]);
  const serifBold = pickFontPath([
    "C:/Windows/Fonts/georgiab.ttf",
    "C:/Windows/Fonts/timesbd.ttf",
    "C:/Windows/Fonts/msyhbd.ttc",
  ]);
  const mono = pickFontPath([
    "C:/Windows/Fonts/consola.ttf",
    "C:/Windows/Fonts/CascadiaMono.ttf",
    "C:/Windows/Fonts/msyh.ttc",
  ]);

  // 标题改为两行: 第一行「每天一个」, 第二行「西海岸单词」
  const titleSize = Math.round(width * 0.074);
  const wordSize = Math.round(width * 0.11);
  const phoneticSize = Math.round(width * 0.042);

  const left = Math.round(width * 0.055);
  const titleTop = Math.round(height * 0.075);
  const titleLineGap = Math.max(12, Math.round(titleSize * 0.32));
  const titleSegmentGap = Math.max(6, Math.round(titleSize * 0.06));

  const line1Y = titleTop;
  const line2Y = titleTop + titleSize + titleLineGap;
  const line2HighlightX = left;
  const line2SuffixX =
    line2HighlightX +
    approxTextWidth(textConfig.titleHighlight, titleSize) +
    titleSegmentGap;

  const wordTop = line2Y + titleSize + Math.round(height * 0.07);
  const phoneticTop = wordTop + wordSize + Math.round(height * 0.018);

  const filter = [
    `scale=${width}:${height}:force_original_aspect_ratio=increase`,
    `crop=${width}:${height}`,
    "boxblur=5:1",
    "eq=brightness=-0.22:saturation=0.95",
    buildDrawtext({
      text: textConfig.titlePrefix,
      x: left,
      y: line1Y,
      fontSize: titleSize,
      color: "#ffffff",
      fontFile: sansBold,
    }),
    buildDrawtext({
      text: textConfig.titleHighlight,
      x: line2HighlightX,
      y: line2Y,
      fontSize: titleSize,
      color: textConfig.highlightColor,
      fontFile: sansBold,
    }),
    buildDrawtext({
      text: textConfig.titleSuffix,
      x: line2SuffixX,
      y: line2Y,
      fontSize: titleSize,
      color: "#ffffff",
      fontFile: sansBold,
    }),
    buildDrawtext({
      text: word.word,
      x: left,
      y: wordTop,
      fontSize: wordSize,
      color: "#ffffff",
      fontFile: serifBold,
    }),
    buildDrawtext({
      text: word.phonetic || "",
      x: left,
      y: phoneticTop,
      fontSize: phoneticSize,
      color: "#D0CBC6",
      fontFile: mono,
    }),
  ].join(",");

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  execFileSync(
    FFMPEG_PATH,
    [
      "-y",
      "-i",
      backgroundPath,
      "-vf",
      filter,
      "-frames:v",
      "1",
      outputPath,
    ],
    { stdio: "pipe" },
  );
}

export function generateWordCovers(
  list: WordList,
  word: WordEntry,
  publicRootAbs: string,
): CoverGenerationResult {
  const bg = resolveBackgroundPath(list);
  const textConfig = getCoverTextConfig(list);

  const outputDirAbs = path.join(publicRootAbs, "images", list.id, word.id);

  const out4x3Abs = path.join(outputDirAbs, "cover_4_3.jpg");
  const out16x9Abs = path.join(outputDirAbs, "cover_16_9.jpg");

  renderCover({
    backgroundPath: bg,
    outputPath: out4x3Abs,
    width: 1600,
    height: 1200,
    word,
    textConfig,
  });

  renderCover({
    backgroundPath: bg,
    outputPath: out16x9Abs,
    width: 1920,
    height: 1080,
    word,
    textConfig,
  });

  return {
    cover4x3Path: toPublicRel("images", list.id, word.id, "cover_4_3.jpg"),
    cover16x9Path: toPublicRel("images", list.id, word.id, "cover_16_9.jpg"),
  };
}
