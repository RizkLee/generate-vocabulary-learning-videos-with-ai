import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { WestCoastWordProps } from "../../types/index";
import type { getSceneFrames } from "./calculateMetadata";
import { Subtitles } from "./Subtitles";

interface Scene3Props extends WestCoastWordProps {
  sceneFrames: ReturnType<typeof getSceneFrames>;
}

export const Scene3Examples: React.FC<Scene3Props> = ({
  word,
  sceneFrames,
  previewMode,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { sceneTransitionFrames, videoTransitionFrames, outroFrames } =
    sceneFrames;

  // 整体淡入
  const fadeIn = interpolate(frame, [0, sceneTransitionFrames], [0, 1], {
    extrapolateRight: "clamp",
  });

  const explicitDurations = (word.assets.exampleVideoDurations || [])
    .filter((d): d is number => Number.isFinite(d) && d > 0);
  const legacyPathCount = word.assets.exampleVideoPaths?.length || 0;
  const videoDurations = explicitDurations.length > 0
    ? explicitDurations
    : legacyPathCount > 0
      ? Array.from({ length: legacyPathCount }, () => 8)
      : [];

  if (videoDurations.length === 0) return null;

  const videoStartFrames: number[] = [];
  let accum = sceneTransitionFrames;
  for (let i = 0; i < videoDurations.length; i++) {
    videoStartFrames.push(accum);
    accum += Math.ceil(videoDurations[i] * fps) + videoTransitionFrames;
  }

  const contentEndFrame = accum - videoTransitionFrames;
  const outroStart = contentEndFrame;
  const fadeOut = interpolate(
    frame,
    [outroStart, outroStart + outroFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill style={{ opacity: fadeIn * fadeOut }}>
      {/* 纯色背景 */}
      <AbsoluteFill>
        <div
          style={{
            width: "100%",
            height: "100%",
            background:
              "linear-gradient(180deg, #0d0d1a 0%, #1a1a2e 50%, #0d0d1a 100%)",
          }}
        />
      </AbsoluteFill>

      {/* 视频容器 */}
      {videoDurations.map((dur, i) => {
        const videoStart = videoStartFrames[i];
        const videoFrames = Math.ceil(dur * fps);

        const videoFadeIn = interpolate(
          frame,
          [videoStart, videoStart + 10],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
        const videoFadeOut = interpolate(
          frame,
          [videoStart + videoFrames - 10, videoStart + videoFrames],
          [1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );

        const visible =
          frame >= videoStart && frame < videoStart + videoFrames + 10;
        if (!visible) return null;

        const hasVideo = word.assets.exampleVideoPaths?.[i];

        return (
          <div key={i} style={{ opacity: videoFadeIn * videoFadeOut }}>
            {/* 16:9 视频框 - 更大的尺寸 */}
            <div
              style={{
                position: "absolute",
                top: 260,
                left: 40,
                right: 40,
                height: 563, // 1000 * 9/16 = 562.5
                borderRadius: 16,
                overflow: "hidden",
                boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
              }}
            >
              {hasVideo && !previewMode ? (
                <Sequence from={videoStart}>
                  {/* 使用 OffthreadVideo 解决帧率不一致问题 */}
                  <OffthreadVideo
                    src={staticFile(word.assets.exampleVideoPaths![i])}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                    volume={3.5}
                  />
                </Sequence>
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    background:
                      "linear-gradient(135deg, #2d2d44 0%, #1a1a2e 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "column",
                    gap: 16,
                  }}
                >
                  <div
                    style={{
                      fontSize: 28,
                      color: "rgba(255,255,255,0.3)",
                      fontFamily: "'Noto Sans SC', sans-serif",
                    }}
                  >
                    Example {i + 1}
                  </div>
                  <div
                    style={{
                      fontSize: 36,
                      color: "rgba(255,255,255,0.5)",
                      fontFamily: "'Noto Serif SC', serif",
                      padding: "0 40px",
                      textAlign: "center",
                      lineHeight: 1.6,
                    }}
                  >
                    {word.examples[i]?.english || ""}
                  </div>
                </div>
              )}
            </div>

            {/* 字幕区域 - 位置下移，文字放大 */}
            <div
              style={{
                position: "absolute",
                top: 870,
                left: 50,
                right: 50,
              }}
            >
              {word.assets.subtitleData?.[i] ? (
                <Subtitles
                  segments={word.assets.subtitleData[i]}
                  videoStartFrame={videoStart}
                />
              ) : (
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      fontSize: 40,
                      color: "#ffffff",
                      fontFamily: "'Noto Serif SC', serif",
                      lineHeight: 1.6,
                    }}
                  >
                    {word.examples[i]?.english || ""}
                  </div>
                  <div
                    style={{
                      fontSize: 34,
                      color: "#F5A623",
                      fontFamily: "'Noto Sans SC', sans-serif",
                      marginTop: 16,
                      lineHeight: 1.6,
                    }}
                  >
                    {word.examples[i]?.chinese || ""}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
