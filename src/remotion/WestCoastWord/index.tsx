import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import type { WestCoastWordProps } from "../../types/index";
import { getSceneFrames } from "./calculateMetadata";
import { Scene1Title } from "./Scene1Title";
import { Scene2Patterns } from "./Scene2Patterns";
import { Scene3Examples } from "./Scene3Examples";
import { Scene4Outro } from "./Scene4Outro";

export const WestCoastWordVideo: React.FC<WestCoastWordProps> = (props) => {
  const { word, bgmSrc, fps, previewMode } = props;
  const scenes = getSceneFrames(
    word,
    fps,
    previewMode,
    props.scene4OutroTtsDuration,
    props.scene4OutroTtsSpeed,
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0a0a0f",
        fontFamily: "'Noto Serif SC', 'Noto Sans SC', serif",
      }}
    >
      {/* BGM - 从第0帧起播，无淡入 */}
      <Audio
        src={staticFile(bgmSrc)}
        volume={(f) => {
          // 第3幕降低 BGM 音量
          if (scenes.hasScene3 && f >= scenes.scene3.from) return 0.12;
          return 0.35;
        }}
        loop
      />

      {/* 第1幕: 开场标题 */}
      <Sequence
        from={scenes.scene1.from}
        durationInFrames={scenes.scene1.duration}
      >
        <Scene1Title {...props} />
      </Sequence>

      {/* 第2幕: 句式 */}
      <Sequence
        from={scenes.scene2.from}
        durationInFrames={scenes.scene2.duration}
      >
        <Scene2Patterns {...props} sceneFrames={scenes} />
      </Sequence>

      {/* 第3幕: 例句视频 */}
      {scenes.scene3.duration > 0 && (
        <Sequence
          from={scenes.scene3.from}
          durationInFrames={scenes.scene3.duration}
        >
          <Scene3Examples {...props} sceneFrames={scenes} />
        </Sequence>
      )}

      {/* 第4幕: 评论区引导 + 上期封面 */}
      <Sequence
        from={scenes.scene4.from}
        durationInFrames={scenes.scene4.duration}
      >
        <Scene4Outro {...props} sceneFrames={scenes} />
      </Sequence>
    </AbsoluteFill>
  );
};
