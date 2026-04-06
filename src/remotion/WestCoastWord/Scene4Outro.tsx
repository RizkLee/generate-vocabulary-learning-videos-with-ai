import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { WestCoastWordProps } from "../../types/index";
import type { getSceneFrames } from "./calculateMetadata";

interface Scene4Props extends WestCoastWordProps {
  sceneFrames: ReturnType<typeof getSceneFrames>;
}

const CTA_TEXT = "快去评论区练练手吧！";

export const Scene4Outro: React.FC<Scene4Props> = ({
  scene4OutroTtsPath,
  scene4OutroTtsSpeed,
  scene4PrevCoverSrc,
  scene4PrevWord,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enterFrames = Math.max(12, Math.round(0.45 * fps));

  const sceneFadeIn = interpolate(frame, [0, enterFrames], [0.82, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const ctaOpacity = interpolate(frame, [4, enterFrames + 4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const ctaTranslateY = interpolate(frame, [0, enterFrames], [24, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const lowerBlockOpacity = interpolate(
    frame,
    [Math.round(enterFrames * 0.6), enterFrames + 12],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  return (
    <AbsoluteFill style={{ opacity: sceneFadeIn }}>
      <AbsoluteFill>
        <div
          style={{
            width: "100%",
            height: "100%",
            background:
              "radial-gradient(circle at 50% 28%, rgba(30,30,50,0.45) 0%, rgba(10,10,18,0.94) 50%, rgba(7,7,12,1) 100%)",
          }}
        />
      </AbsoluteFill>

      <div
        style={{
          position: "absolute",
          top: "45%",
          left: "50%",
          transform: `translate(-50%, calc(-50% + ${ctaTranslateY}px))`,
          width: "90%",
          textAlign: "center",
          opacity: ctaOpacity,
        }}
      >
        <div
          style={{
            fontFamily: "'Noto Sans SC', sans-serif",
            fontSize: 76,
            fontWeight: 800,
            color: "#F8F0E6",
            letterSpacing: 1,
            lineHeight: 1.25,
            textShadow: "0 8px 28px rgba(0,0,0,0.45)",
          }}
        >
          {CTA_TEXT}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 120,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
          opacity: lowerBlockOpacity,
        }}
      >
        <div
          style={{
            fontFamily: "'Noto Sans SC', sans-serif",
            fontSize: 38,
            fontWeight: 700,
            color: "#FFD08A",
            textShadow: "0 6px 20px rgba(0,0,0,0.4)",
          }}
        >
          上期视频 👇
        </div>

        <div
          style={{
            width: 760,
            height: 428,
            borderRadius: 20,
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.18)",
            boxShadow: "0 18px 52px rgba(0,0,0,0.5)",
            background:
              "linear-gradient(135deg, rgba(34,34,52,0.95) 0%, rgba(16,16,26,0.98) 100%)",
          }}
        >
          {scene4PrevCoverSrc ? (
            <Img
              src={staticFile(scene4PrevCoverSrc)}
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
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                fontFamily: "'Noto Sans SC', sans-serif",
                fontSize: 34,
                color: "rgba(255,255,255,0.62)",
                padding: "0 40px",
                lineHeight: 1.45,
              }}
            >
              暂无上期封面
            </div>
          )}
        </div>

        {scene4PrevWord && (
          <div
            style={{
              fontFamily: "'Noto Serif SC', serif",
              fontSize: 32,
              color: "rgba(255,255,255,0.78)",
            }}
          >
            {scene4PrevWord}
          </div>
        )}
      </div>

      {scene4OutroTtsPath && (
        <Audio
          src={staticFile(scene4OutroTtsPath)}
          volume={1}
          playbackRate={scene4OutroTtsSpeed || 1}
        />
      )}
    </AbsoluteFill>
  );
};
