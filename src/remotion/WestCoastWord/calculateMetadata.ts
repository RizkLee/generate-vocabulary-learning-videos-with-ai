import type { CalculateMetadataFunction } from "remotion";
import type { WestCoastWordProps } from "../../types/index";

const TITLE_ANIMATION_SEC = 3.0; // WheelPicker 85帧 ≈ 2.83s
const TITLE_PAUSE_SEC = 0.3;
const PATTERN_PAUSE_SEC = 0.6;
const SCENE_TRANSITION_SEC = 0.7;
const VIDEO_TRANSITION_SEC = 0.5;
const OUTRO_SEC = 1.0;

export const calculateVideoMetadata: CalculateMetadataFunction<
  WestCoastWordProps
> = async ({ props }) => {
  const { word, fps: propsFps } = props;
  const fps = propsFps || 30;
  const assets = word.assets;

  // 第1幕时长: 标题动画 + 中文TTS(开场白+释义) + 停顿 + 英文TTS
  const introD = assets.chineseIntroTtsDuration || 2.5;
  const wordD = assets.chineseWordTtsDuration || assets.chineseTtsDuration || 3;
  const englishD = assets.englishTtsDuration || 3;
  const chineseTotalD = introD + 0.2 + wordD;
  const scene1Sec =
    Math.max(TITLE_ANIMATION_SEC + TITLE_PAUSE_SEC, chineseTotalD) +
    englishD +
    0.5;

  // 第2幕时长
  const patternDurations = assets.patternTtsDurations || [2, 2, 2];
  const scene2Sec =
    SCENE_TRANSITION_SEC +
    patternDurations.reduce((sum, d) => sum + d, 0) +
    PATTERN_PAUSE_SEC * (patternDurations.length - 1) +
    0.5;

  // 第3幕时长
  const videoDurations = assets.exampleVideoDurations || [8, 8];
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
  const assets = word.assets;

  const introD = assets.chineseIntroTtsDuration || 2.5;
  const wordD = assets.chineseWordTtsDuration || assets.chineseTtsDuration || 3;
  const englishD = assets.englishTtsDuration || 3;
  const chineseTotalD = introD + 0.2 + wordD;
  const scene1Sec =
    Math.max(TITLE_ANIMATION_SEC + TITLE_PAUSE_SEC, chineseTotalD) +
    englishD +
    0.5;

  const patternDurations = assets.patternTtsDurations || [2, 2, 2];
  const scene2Sec =
    SCENE_TRANSITION_SEC +
    patternDurations.reduce((sum, d) => sum + d, 0) +
    PATTERN_PAUSE_SEC * (patternDurations.length - 1) +
    0.5;

  const videoDurations = assets.exampleVideoDurations || [8, 8];
  const scene3Sec =
    SCENE_TRANSITION_SEC +
    videoDurations.reduce((sum, d) => sum + d, 0) +
    VIDEO_TRANSITION_SEC * (videoDurations.length - 1) +
    OUTRO_SEC;

  return {
    scene1: { from: 0, duration: Math.ceil(scene1Sec * fps) },
    scene2: { from: Math.ceil(scene1Sec * fps), duration: Math.ceil(scene2Sec * fps) },
    scene3: { from: Math.ceil((scene1Sec + scene2Sec) * fps), duration: Math.ceil(scene3Sec * fps) },
    titleAnimationFrames: Math.ceil(TITLE_ANIMATION_SEC * fps),
    sceneTransitionFrames: Math.ceil(SCENE_TRANSITION_SEC * fps),
    patternPauseFrames: Math.ceil(PATTERN_PAUSE_SEC * fps),
    videoTransitionFrames: Math.ceil(VIDEO_TRANSITION_SEC * fps),
    outroFrames: Math.ceil(OUTRO_SEC * fps),
  };
}
