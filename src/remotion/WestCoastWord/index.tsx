import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import type { WestCoastWordProps } from "../../types/index";
import { getSceneFrames } from "./calculateMetadata";
import { Scene1Title } from "./Scene1Title";
import { Scene2Patterns } from "./Scene2Patterns";
import { Scene3Examples } from "./Scene3Examples";

export const WestCoastWordVideo: React.FC<WestCoastWordProps> = (props) => {
  const { word, bgmSrc, fps } = props;
  const scenes = getSceneFrames(word, fps);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0a0a0f",
        fontFamily: "'Noto Serif SC', 'Noto Sans SC', serif",
      }}
    >
      {/* BGM - 贯穿全片 */}
      <Audio
        src={staticFile(bgmSrc)}
        volume={(f) => {
          // 第3幕降低 BGM 音量
          if (f >= scenes.scene3.from) return 0.12;
          // 开头渐入
          if (f < 15) return (f / 15) * 0.35;
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
      <Sequence
        from={scenes.scene3.from}
        durationInFrames={scenes.scene3.duration}
      >
        <Scene3Examples {...props} sceneFrames={scenes} />
      </Sequence>
    </AbsoluteFill>
  );
};
