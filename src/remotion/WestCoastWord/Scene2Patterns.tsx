import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { WestCoastWordProps } from "../../types/index";
import type { getSceneFrames } from "./calculateMetadata";

interface Scene2Props extends WestCoastWordProps {
  sceneFrames: ReturnType<typeof getSceneFrames>;
}

export const Scene2Patterns: React.FC<Scene2Props> = ({
  word,
  bgVideoSrc,
  sceneFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { sceneTransitionFrames, patternPauseFrames } = sceneFrames;

  // 整体淡入
  const fadeIn = interpolate(frame, [0, sceneTransitionFrames], [0, 1], {
    extrapolateRight: "clamp",
  });

  // 计算每个句式的播放起始帧
  const patternDurations = word.assets.patternTtsDurations || [2, 2, 2];
  const patternStartFrames: number[] = [];
  let accum = sceneTransitionFrames + 15;
  for (let i = 0; i < patternDurations.length; i++) {
    patternStartFrames.push(accum);
    accum += Math.ceil(patternDurations[i] * fps) + patternPauseFrames;
  }

  // 当前正在朗读的句式索引
  const currentPatternIndex = patternStartFrames.findIndex((start, i) => {
    const end =
      start +
      Math.ceil(patternDurations[i] * fps) +
      (i < patternDurations.length - 1 ? patternPauseFrames : 0);
    return frame >= start && frame < end;
  });

  return (
    <AbsoluteFill style={{ opacity: fadeIn }}>
      {/* 背景视频 (模糊 + 暗化) */}
      <AbsoluteFill>
        <OffthreadVideo
          src={staticFile(bgVideoSrc)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "blur(12px) brightness(0.35)",
          }}
          muted
        />
      </AbsoluteFill>

      {/* Pixabay 图片 (上方) */}
      <div
        style={{
          position: "absolute",
          top: 100,
          left: 60,
          right: 60,
          height: 560,
          borderRadius: 20,
          overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
        }}
      >
        {word.assets.imagePath ? (
          <Img
            src={staticFile(word.assets.imagePath)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 140,
              color: "rgba(255,255,255,0.3)",
              fontFamily: "'Noto Serif SC', serif",
            }}
          >
            {word.word}
          </div>
        )}
      </div>

      {/* 单词标题 */}
      <div
        style={{
          position: "absolute",
          top: 710,
          left: 0,
          right: 0,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 72,
            fontWeight: 900,
            color: "#F5A623",
            fontFamily: "'Noto Serif SC', serif",
          }}
        >
          {word.word}
        </div>
        <div
          style={{
            fontSize: 32,
            color: "rgba(255,255,255,0.5)",
            marginTop: 8,
            fontFamily: "monospace",
          }}
        >
          {word.phonetic}
        </div>
      </div>

      {/* 句式列表 - 居中对齐 */}
      <div
        style={{
          position: "absolute",
          top: 870,
          left: 60,
          right: 60,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 48,
        }}
      >
        {word.patterns.map((pattern, i) => {
          const isActive = i === currentPatternIndex;
          const patternAppear = spring({
            frame: Math.max(0, frame - patternStartFrames[i] + 10),
            fps,
            config: { damping: 20, stiffness: 100 },
            durationInFrames: 15,
          });

          return (
            <div
              key={i}
              style={{
                opacity:
                  frame >= patternStartFrames[i] - 10 ? patternAppear : 0,
                transform: `translateY(${interpolate(patternAppear, [0, 1], [20, 0])}px)`,
                textAlign: "center",
                width: "100%",
              }}
            >
              {/* 英文句式 */}
              <div
                style={{
                  fontSize: 50,
                  fontWeight: isActive ? 700 : 400,
                  color: isActive ? "#FFD700" : "rgba(255,255,255,0.9)",
                  fontFamily: "'Noto Serif SC', serif",
                  lineHeight: 1.5,
                }}
              >
                {pattern}
              </div>
              {/* 中文释义 */}
              <div
                style={{
                  fontSize: 40,
                  color: isActive
                    ? "rgba(255,215,0,0.75)"
                    : "rgba(255,255,255,0.5)",
                  fontFamily: "'Noto Sans SC', sans-serif",
                  marginTop: 10,
                  lineHeight: 1.4,
                }}
              >
                {word.patternTranslations?.[i] || word.chineseMeaning}
              </div>
            </div>
          );
        })}
      </div>

      {/* 句式 TTS 音频 */}
      {word.assets.patternTtsPaths?.map((p, i) => (
        <Sequence key={i} from={patternStartFrames[i]}>
          <Audio src={staticFile(p)} volume={1} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
