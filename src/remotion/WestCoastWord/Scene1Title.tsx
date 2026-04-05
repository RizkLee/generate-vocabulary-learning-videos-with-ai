import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { WestCoastWordProps } from "../../types/index";
import { WheelPicker, FlashEffect, WHEEL_ANIM_FRAMES } from "./WheelPicker";
import {
  getScene1Timing,
  normalizeTtsSpeed,
  SCENE1_WORD_INFO_DELAY_FRAMES,
} from "./calculateMetadata";

const WHEEL_ITEMS = [
  "四级", "高考", "考研", "雅思", "", "西海岸",
];
const TARGET_INDEX = 5;
const TARGET_COLOR = "#F5A623";

export const Scene1Title: React.FC<WestCoastWordProps> = ({
  word,
  bgVideoSrc,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scene1Timing = getScene1Timing(word, fps);

  const flashFrame = WHEEL_ANIM_FRAMES;
  const bgBrightness = interpolate(
    frame,
    [0, flashFrame, flashFrame + 24],
    [0.28, 0.28, 0.4],
    { extrapolateRight: "clamp" },
  );

  // 背景视频淡入
  const bgOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });

  // 单词信息淡入 (闪光后)
  const wordInfoDelay = flashFrame + SCENE1_WORD_INFO_DELAY_FRAMES;
  const wordInfoOpacity = interpolate(
    frame,
    [wordInfoDelay, wordInfoDelay + 15],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const wordInfoY = interpolate(
    frame,
    [wordInfoDelay, wordInfoDelay + 15],
    [30, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill>
      {/* 背景视频：从开场即播放 */}
      <AbsoluteFill
        style={{
          opacity: 1,
        }}
      >
        <OffthreadVideo
          src={staticFile(bgVideoSrc)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: `blur(10px) brightness(${bgBrightness})`,
          }}
          muted
        />
      </AbsoluteFill>

      {/* 闪光效果 */}
      <FlashEffect triggerFrame={flashFrame} />

      {/* 标题区域 - 左对齐 */}
      <div
        style={{
          position: "absolute",
          top: 260,
          left: 70,
          right: 70,
        }}
      >
        {/* 主标题 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 0,
          }}
        >
          <span
            style={{
              fontSize: 96,
              fontWeight: 900,
              color: "#ffffff",
              fontFamily: "'Noto Sans SC', sans-serif",
            }}
          >
            每天1个
          </span>
          <WheelPicker
            items={WHEEL_ITEMS}
            targetIndex={TARGET_INDEX}
            targetColor={TARGET_COLOR}
            fontSize={96}
          />
          <span
            style={{
              fontSize: 96,
              fontWeight: 900,
              color: "#ffffff",
              fontFamily: "'Noto Sans SC', sans-serif",
            }}
          >
            单词
          </span>
        </div>

        {/* 单词信息 */}
        <div
          style={{
            marginTop: 100,
            opacity: wordInfoOpacity,
            transform: `translateY(${wordInfoY}px)`,
          }}
        >
          {/* 单词 */}
          <div
            style={{
              fontSize: 128,
              fontWeight: 900,
              color: "#ffffff",
              fontFamily: "'Noto Serif SC', serif",
              letterSpacing: 4,
            }}
          >
            {word.word}
          </div>

          {/* 音标 */}
          <div
            style={{
              fontSize: 48,
              color: "rgba(255,255,255,0.6)",
              marginTop: 16,
              fontFamily: "monospace",
            }}
          >
            {word.phonetic}
          </div>

          {/* 英文释义 */}
          <div
            style={{
              fontSize: 44,
              color: "rgba(255,255,255,0.85)",
              marginTop: 36,
              fontFamily: "'Noto Serif SC', serif",
              lineHeight: 1.5,
            }}
          >
            {word.englishMeaning}
          </div>

          {/* 中文释义 */}
          <div
            style={{
              fontSize: 56,
              color: TARGET_COLOR,
              marginTop: 24,
              fontWeight: 700,
              fontFamily: "'Noto Sans SC', sans-serif",
            }}
          >
            {word.chineseMeaning}
          </div>
        </div>
      </div>

      {/* 英文 TTS：闪光后等待 0.1s 再播报 */}
      {word.assets.englishTtsPath && (
        <Sequence
          from={Math.ceil(scene1Timing.englishStartSec * fps)}
        >
          <Audio
            src={staticFile(word.assets.englishTtsPath)}
            volume={1}
            playbackRate={normalizeTtsSpeed(word.assets.englishTtsSpeed)}
          />
        </Sequence>
      )}

      {/* 中文 TTS：英文后停顿 0.3s 再播“中文简明释义” */}
      {(word.assets.chineseWordTtsPath || word.assets.chineseTtsPath) && (
        <Sequence from={Math.ceil(scene1Timing.chineseStartSec * fps)}>
          <Audio
            src={staticFile(word.assets.chineseWordTtsPath || word.assets.chineseTtsPath!)}
            volume={1}
            playbackRate={normalizeTtsSpeed(word.assets.chineseWordTtsSpeed)}
          />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};
