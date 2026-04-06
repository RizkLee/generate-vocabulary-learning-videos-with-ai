// ===== 核心数据类型 =====

export interface SubtitleSegment {
  text: string;
  translation: string;
  startTime: number; // 秒
  endTime: number;
}

export interface WordAssets {
  chineseTtsPath?: string;
  chineseTtsDuration?: number;
  chineseIntroTtsPath?: string;      // "每天1个西海岸单词" 固定开场白
  chineseIntroTtsDuration?: number;
  chineseIntroTtsSpeed?: number;
  chineseWordTtsPath?: string;       // "今天要学习的单词是：xxx" 每词不同
  chineseWordTtsDuration?: number;
  chineseWordTtsSpeed?: number;
  englishTtsPath?: string;
  englishTtsDuration?: number;
  englishTtsSpeed?: number;
  patternTtsPaths?: string[];
  patternTtsDurations?: number[];
  patternTtsSpeeds?: number[];
  imagePath?: string;
  exampleVideoPaths?: string[];
  exampleVideoDurations?: number[];
  subtitleData?: SubtitleSegment[][];
  videoCover4x3Path?: string;
  videoCover16x9Path?: string;
}

export type WordStatus =
  | "pending"
  | "content_ready"
  | "assets_ready"
  | "rendered";

export interface WordEntry {
  id: string;
  word: string;
  phonetic: string;
  chineseMeaning: string;
  englishMeaning: string;
  patterns: string[];
  patternTranslations: string[];     // 句式中文翻译
  examples: Array<{
    english: string;
    chinese: string;
  }>;
  status: WordStatus;
  assets: WordAssets;
  createdAt: string;
  updatedAt: string;
}

export interface WordListConfigOverride {
  models?: Partial<{
    tts: string;
    ttsVoice: string;
    contentGeneration: string;
    subtitle: string;
    video: string;
  }>;
  prompts?: Partial<{
    englishVoice: string;
    chineseVoice: string;
    contentGeneration: string;
    veoVideo: string;
    chineseIntro: string;
    chineseWordTemplate: string;
    englishWordTemplate: string;
  }>;
  cover?: Partial<{
    backgroundImagePath: string;
    titlePrefix: string;
    titleHighlight: string;
    titleSuffix: string;
    highlightColor: string;
  }>;
  media?: Partial<{
    bgmPath: string;
    backgroundVideoPath: string;
    scene4OutroTtsPath: string;
    scene4OutroTtsSpeed: number;
  }>;
}

export interface WordList {
  id: string;
  name: string;
  theme: string;
  config?: WordListConfigOverride;
  words: WordEntry[];
  createdAt: string;
  updatedAt: string;
}

// ===== Remotion Props =====

export interface WestCoastWordProps extends Record<string, unknown> {
  word: WordEntry;
  bgVideoSrc: string;
  bgmSrc: string;
  fps: number;
  previewMode: boolean;
  scene4OutroTtsPath?: string;
  scene4OutroTtsDuration?: number;
  scene4OutroTtsSpeed?: number;
  scene4PrevCoverSrc?: string;
  scene4PrevWord?: string;
  scene4LastExampleVideoSrc?: string;
}

// ===== 费用追踪 =====

export interface CostEntry {
  service: "gemini-flash" | "gemini-tts" | "veo" | "pixabay" | "stt";
  operation: string;
  cost: number;
  timestamp: string;
  wordId: string;
}

export interface CostSummary {
  total: number;
  budget: number;
  remaining: number;
  entries: CostEntry[];
}

// ===== 渲染任务 =====

export type RenderJobStatus =
  | "queued"
  | "bundling"
  | "rendering"
  | "done"
  | "error";

export interface RenderJob {
  id: string;
  wordId: string;
  status: RenderJobStatus;
  progress: number;
  outputPath?: string;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

// ===== API 响应 =====

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
