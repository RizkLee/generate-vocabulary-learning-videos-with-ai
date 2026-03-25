import { useCurrentFrame, useVideoConfig } from "remotion";
import type { SubtitleSegment } from "../../types/index";

interface SubtitlesProps {
  segments: SubtitleSegment[];
  videoStartFrame: number;
}

export const Subtitles: React.FC<SubtitlesProps> = ({
  segments,
  videoStartFrame,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const currentSegment = segments.find((seg) => {
    const segStartFrame = videoStartFrame + Math.floor(seg.startTime * fps);
    const segEndFrame = videoStartFrame + Math.ceil(seg.endTime * fps);
    return frame >= segStartFrame && frame < segEndFrame;
  });

  if (!currentSegment) return null;

  return (
    <div style={{ textAlign: "center" }}>
      {/* 英文字幕 */}
      <div
        style={{
          fontSize: 46,
          color: "#ffffff",
          fontFamily: "'Noto Serif SC', serif",
          lineHeight: 1.5,
          textShadow: "0 2px 12px rgba(0,0,0,0.9)",
        }}
      >
        {currentSegment.text}
      </div>
      {/* 中文翻译 */}
      <div
        style={{
          fontSize: 42,
          color: "#F5A623",
          fontFamily: "'Noto Sans SC', sans-serif",
          marginTop: 14,
          lineHeight: 1.5,
          textShadow: "0 2px 12px rgba(0,0,0,0.9)",
        }}
      >
        {currentSegment.translation}
      </div>
    </div>
  );
};
