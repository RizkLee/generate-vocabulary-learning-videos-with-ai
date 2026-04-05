import type { CalculateMetadataFunction } from "remotion";
import type { WestCoastWordProps } from "../../types/index";
import { WHEEL_ANIM_FRAMES } from "./WheelPicker";

const TITLE_ANIMATION_SEC = WHEEL_ANIM_FRAMES / 30;
const TITLE_PAUSE_SEC = 0.3;
const PATTERN_PAUSE_SEC = 0.6;
const SCENE_TRANSITION_SEC = 0.7;
const VIDEO_TRANSITION_SEC = 0.5;
const OUTRO_SEC = 1.0;
export const SCENE1_WORD_INFO_DELAY_FRAMES = 6;
const SCENE1_EN_AFTER_FLASH_DELAY_SEC = 0.15;
const SCENE1_EN_TO_CN_PAUSE_SEC = 0.3;
const SCENE1_END_PADDING_SEC = 0.35;
export const DEFAULT_TTS_SPEED = 1.25;
const MIN_TTS_SPEED = 0.8;
const MAX_TTS_SPEED = 1.6;

export function normalizeTtsSpeed(speed?: number): number {
  if (!Number.isFinite(speed)) return DEFAULT_TTS_SPEED;
  return Math.min(MAX_TTS_SPEED, Math.max(MIN_TTS_SPEED, Number(speed)));
}

function getEffectiveDuration(
  rawDuration: number | undefined,
  fallbackDuration: number,
  speed?: number,
): number {
  const base =
    Number.isFinite(rawDuration) && (rawDuration as number) > 0
      ? (rawDuration as number)
      : fallbackDuration;
  return base / normalizeTtsSpeed(speed);
}

export function getPatternEffectiveDurations(
  word: WestCoastWordProps["word"],
): number[] {
  const explicitCount = Math.max(
    word.patterns.length,
    word.assets.patternTtsDurations?.length || 0,
    word.assets.patternTtsPaths?.length || 0,
    word.assets.patternTtsSpeeds?.length || 0,
  );
  const count = explicitCount > 0 ? explicitCount : 3;

  return Array.from({ length: count }, (_, i) =>
    getEffectiveDuration(
      word.assets.patternTtsDurations?.[i],
      2,
      word.assets.patternTtsSpeeds?.[i],
    ),
  );
}

export function getScene1Timing(
  word: WestCoastWordProps["word"],
  fps: number,
) {
  const assets = word.assets;
  const englishStartSec =
    WHEEL_ANIM_FRAMES / fps + SCENE1_EN_AFTER_FLASH_DELAY_SEC;
  const speechStartFrame = Math.ceil(englishStartSec * fps);

  const hasEnglish = !!assets.englishTtsPath;
  const hasChinese = !!assets.chineseWordTtsPath || !!assets.chineseTtsPath;

  const englishSec = hasEnglish
    ? getEffectiveDuration(
        assets.englishTtsDuration,
        3,
        assets.englishTtsSpeed,
      )
    : 0;
  const chineseSec = hasChinese
    ? getEffectiveDuration(
        assets.chineseWordTtsDuration || assets.chineseTtsDuration,
        3,
        assets.chineseWordTtsSpeed,
      )
    : 0;

  const chineseStartSec =
    englishStartSec + englishSec + (hasEnglish && hasChinese ? SCENE1_EN_TO_CN_PAUSE_SEC : 0);
  const speechEndSec = chineseStartSec + chineseSec;

  const scene1Sec =
    Math.max(TITLE_ANIMATION_SEC + TITLE_PAUSE_SEC, speechEndSec) +
    SCENE1_END_PADDING_SEC;

  return {
    speechStartFrame,
    englishStartSec,
    chineseStartSec,
    englishSec,
    chineseSec,
    scene1Sec,
  };
}

export const calculateVideoMetadata: CalculateMetadataFunction<
  WestCoastWordProps
> = async ({ props }) => {
  const { word, fps: propsFps } = props;
  const fps = propsFps || 30;

  // 第1幕时长: 标题动效 -> 英文释义 -> 中文简明释义
  const { scene1Sec } = getScene1Timing(word, fps);

  // 第2幕时长
  const patternDurations = getPatternEffectiveDurations(word);
  const scene2Sec =
    SCENE_TRANSITION_SEC +
    patternDurations.reduce((sum, d) => sum + d, 0) +
    PATTERN_PAUSE_SEC * Math.max(0, patternDurations.length - 1) +
    0.5;

  // 第3幕时长
  const videoDurations = word.assets.exampleVideoDurations || [8, 8];
  const scene3Sec =
    SCENE_TRANSITION_SEC +
    videoDurations.reduce((sum, d) => sum + d, 0) +
    VIDEO_TRANSITION_SEC * (videoDurations.length - 1) +
    OUTRO_SEC;

  const totalSec = scene1Sec + scene2Sec + scene3Sec;
  const durationInFrames = Math.ceil(totalSec * fps);

  return {
    durationInFrames,
    fps,
    width: 1080,
    height: 1920,
    props: { ...props, fps },
  };
};

/** 计算各幕的帧偏移 */
export function getSceneFrames(word: WestCoastWordProps["word"], fps: number) {
  const { scene1Sec } = getScene1Timing(word, fps);

  const patternDurations = getPatternEffectiveDurations(word);
  const scene2Sec =
    SCENE_TRANSITION_SEC +
    patternDurations.reduce((sum, d) => sum + d, 0) +
    PATTERN_PAUSE_SEC * Math.max(0, patternDurations.length - 1) +
    0.5;

  const videoDurations = word.assets.exampleVideoDurations || [8, 8];
  const scene3Sec =
    SCENE_TRANSITION_SEC +
    videoDurations.reduce((sum, d) => sum + d, 0) +
    VIDEO_TRANSITION_SEC * (videoDurations.length - 1) +
    OUTRO_SEC;

  return {
    scene1: { from: 0, duration: Math.ceil(scene1Sec * fps) },
    scene2: { from: Math.ceil(scene1Sec * fps), duration: Math.ceil(scene2Sec * fps) },
    scene3: { from: Math.ceil((scene1Sec + scene2Sec) * fps), duration: Math.ceil(scene3Sec * fps) },
    titleAnimationFrames: WHEEL_ANIM_FRAMES,
    sceneTransitionFrames: Math.ceil(SCENE_TRANSITION_SEC * fps),
    patternPauseFrames: Math.ceil(PATTERN_PAUSE_SEC * fps),
    videoTransitionFrames: Math.ceil(VIDEO_TRANSITION_SEC * fps),
    outroFrames: Math.ceil(OUTRO_SEC * fps),
  };
}
