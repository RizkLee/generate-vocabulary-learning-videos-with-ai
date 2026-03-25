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

const WHEEL_ITEMS = [
  "高考", "四级", "六级", "考研", "雅思", "托福", "GRE", "西海岸",
];
const TARGET_INDEX = 7;
const TARGET_COLOR = "#F5A623";

export const Scene1Title: React.FC<WestCoastWordProps> = ({
  word,
  bgVideoSrc,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const flashFrame = WHEEL_ANIM_FRAMES;

  // 背景视频淡入
  const bgOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });

  // 单词信息淡入 (闪光后)
  const wordInfoDelay = flashFrame + 25;
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
      {/* 闪光前：暗灰色背景 */}
      <AbsoluteFill
        style={{
          backgroundColor: "#1a1a1f",
          opacity: frame < flashFrame ? 1 : interpolate(
            frame, [flashFrame, flashFrame + 30], [1, 0],
            { extrapolateRight: "clamp" },
          ),
        }}
      />

      {/* 闪光后：背景视频淡入 */}
      <AbsoluteFill
        style={{
          opacity: frame < flashFrame ? 0 : interpolate(
            frame, [flashFrame, flashFrame + 30], [0, 1],
            { extrapolateRight: "clamp" },
          ),
        }}
      >
        <OffthreadVideo
          src={staticFile(bgVideoSrc)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "blur(10px) brightness(0.4)",
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

      {/* 中文 TTS - 开场白 (固定复用) */}
      {word.assets.chineseIntroTtsPath && (
        <Sequence from={0}>
          <Audio src={staticFile(word.assets.chineseIntroTtsPath)} volume={1} />
        </Sequence>
      )}
      {/* 中文 TTS - 单词释义 (每词不同) */}
      {word.assets.chineseWordTtsPath && (
        <Sequence
          from={Math.ceil(
            ((word.assets.chineseIntroTtsDuration || 3) + 0.2) * fps,
          )}
        >
          <Audio src={staticFile(word.assets.chineseWordTtsPath)} volume={1} />
        </Sequence>
      )}

      {/* 兼容旧格式: 单条中文 TTS */}
      {!word.assets.chineseIntroTtsPath && word.assets.chineseTtsPath && (
        <Sequence from={0}>
          <Audio src={staticFile(word.assets.chineseTtsPath)} volume={1} />
        </Sequence>
      )}

      {/* 英文 TTS - 中文TTS结束后播放 */}
      {word.assets.englishTtsPath && (
        <Sequence
          from={Math.ceil(
            ((word.assets.chineseIntroTtsDuration || 0) +
              (word.assets.chineseWordTtsDuration || word.assets.chineseTtsDuration || 4) +
              0.5) * fps,
          )}
        >
          <Audio src={staticFile(word.assets.englishTtsPath)} volume={1} />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};
