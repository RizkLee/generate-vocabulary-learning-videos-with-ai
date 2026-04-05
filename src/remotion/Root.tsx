import { Composition } from "remotion";
import { WestCoastWordVideo } from "./WestCoastWord/index";
import { calculateVideoMetadata } from "./WestCoastWord/calculateMetadata";
import type { WestCoastWordProps } from "../types/index";

const defaultWord: WestCoastWordProps["word"] = {
  id: "demo",
  word: "vibe",
  phonetic: "/vaɪb/",
  chineseMeaning: "氛围，感觉",
  englishMeaning: "a feeling or atmosphere",
  patterns: [
    "The vibe is off today.",
    "I'm just vibing right now.",
    "This place has a chill vibe.",
  ],
  patternTranslations: [
    "今天的感觉不太对。",
    "我现在就是随性放松一下。",
    "这个地方的氛围很松弛。",
  ],
  examples: [
    {
      english:
        "Yo, the vibe at the beach party was absolutely unreal, bro. Everybody was just flowing with the music and having the time of their lives.",
      chinese:
        "哟，海滩派对的氛围简直不真实，兄弟。每个人都跟着音乐摇摆，度过了最美好的时光。",
    },
    {
      english:
        "Man, I can't mess with that spot no more, the vibe is all wrong. It used to be so lit but now it's just dead in there.",
      chinese:
        "兄弟，我不能再去那个地方了，氛围全都不对了。以前那里超嗨，但现在完全没人气。",
    },
  ],
  status: "assets_ready",
  assets: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="WestCoastWord"
      component={WestCoastWordVideo}
      durationInFrames={600}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        word: defaultWord,
        bgVideoSrc: "videos/background.mp4",
        bgmSrc: "audio/bgm.mp3",
        fps: 30,
        previewMode: true,
      }}
      calculateMetadata={calculateVideoMetadata}
    />
  );
};
