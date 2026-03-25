# 西海岸单词 — 短视频批量生成器

一款本地运行的 Web 应用，可批量生成"每天1个西海岸单词"风格的英语学习竖屏短视频（~20秒，1080×1920）。视频风格极简大气，带有西海岸黑人文化特色的 AI 配音和 AI 生成的例句真人视频。

## 功能概览

- **AI 单词本生成**：使用 Gemini Flash 按主题批量生成单词/短语内容（音标、释义、句式、例句）
- **AI 语音合成**：使用 Gemini TTS（Achird 音色）生成中英文配音，带有西海岸口音特色
- **AI 视频生成**：使用 Veo 3.1 Fast 生成真人出镜的例句视频
- **智能字幕**：AI 转录 + 校验，生成精确时间戳的中英双语字幕
- **图片搜索**：Pixabay API 自动搜索单词相关插图
- **视频渲染**：Remotion 将所有素材合成为竖屏短视频
- **资源管理**：Web UI 中预览、替换、重新生成任意单个素材
- **配置中心**：支持“全局默认 + 单词本覆盖”两层配置（模型与提示词可按词库单独设置）
- **文本可编辑与细粒度重生成**：可在“素材”页手动编辑单词、释义、句式、例句，并按整词/模块/单条进行 AI 重生成
- **实时素材刷新**：重生成音频、图片、视频后，页面会自动展示最新预览（无需手动刷新）

## 技术栈

| 组件 | 技术 |
|------|------|
| 视频合成 | Remotion 4.x (React) |
| 前端 UI | React 19 + Vite 6 |
| 后端 API | Express 5 |
| AI 内容 | Google Gemini 2.5 Flash (Vertex AI) |
| AI 语音 | Gemini TTS (`gemini-2.5-flash-preview-tts`, Achird) |
| AI 视频 | Veo 3.1 Fast (`veo-3.1-fast-generate-001`) |
| 图片 | Pixabay API |
| AI 字幕 | Gemini Flash 转录 + 校验 |

## 项目结构

```

## 技术说明文档

- 详尽技术栈与项目结构说明：`docs/TECH_STACK_AND_STRUCTURE.md`
- 脱敏配置样例：`data/config.example.json`

建议在协作或上传仓库前，优先阅读上述文档并使用样例配置初始化本地环境。
ShortVideos_Claude/
├── src/
│   ├── client/                     # React Web UI
│   │   ├── components/
│   │   │   ├── WordListManager.tsx  # 单词本管理
│   │   │   ├── BatchControls.tsx    # 批量生成控制
│   │   │   ├── AssetManager.tsx     # 资源预览/替换
│   │   │   ├── CostEstimator.tsx    # 费用追踪
│   │   │   └── ConfigEditor.tsx     # 配置编辑器
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── remotion/                    # 视频组合
│   │   ├── WestCoastWord/
│   │   │   ├── index.tsx            # 主组合（3幕结构）
│   │   │   ├── Scene1Title.tsx      # 第1幕：开场标题
│   │   │   ├── Scene2Patterns.tsx   # 第2幕：句式展示
│   │   │   ├── Scene3Examples.tsx   # 第3幕：例句视频
│   │   │   ├── WheelPicker.tsx      # 滚轮动画
│   │   │   ├── Subtitles.tsx        # 字幕组件
│   │   │   └── calculateMetadata.ts # 时长计算
│   │   ├── Root.tsx
│   │   └── index.ts
│   ├── server/                      # Express 后端
│   │   ├── index.ts
│   │   └── routes/
│   │       ├── wordlist.ts          # 单词本 CRUD
│   │       ├── generate.ts          # 内容/资源生成
│   │       ├── render.ts            # 视频渲染
│   │       └── config.ts            # 配置管理
│   ├── services/                    # API 封装
│   │   ├── config.ts               # 配置加载
│   │   ├── proxy-init.ts           # 代理初始化
│   │   ├── gemini-tts.ts           # TTS 服务
│   │   ├── gemini-content.ts       # 内容生成
│   │   ├── veo.ts                  # 视频生成
│   │   ├── pixabay.ts              # 图片搜索
│   │   ├── subtitle.ts            # 字幕生成
│   │   └── cost-tracker.ts         # 费用追踪
│   └── types/
│       └── index.ts
├── data/
│   ├── config.json                  # 全局配置（API Key、Prompt 等）
│   ├── wordlists/                   # 单词本 JSON 文件
│   └── cost-log.json                # 费用记录
├── public/                          # Remotion 静态资源
│   ├── audio/                       # TTS 音频 + BGM
│   ├── images/                      # 插图
│   └── videos/                      # 背景视频 + AI 视频
├── Material/                        # 用户素材（BGM、背景视频）
├── output/                          # 渲染成品
├── package.json
├── tsconfig.json
├── remotion.config.ts
└── vite.config.ts
```

## 安装与启动

### 前置要求

- **Node.js** >= 18（已测试 v24.10.0）
- **FFmpeg**（Remotion 渲染必需）
- **Google Chrome**（Remotion 渲染使用）
- **Google Cloud SDK**（已登录：`gcloud auth login` + `gcloud auth application-default login`）
- 已启用的 GCP API：`aiplatform.googleapis.com`、`texttospeech.googleapis.com`
- 如在中国大陆使用，需设置 `HTTPS_PROXY` 环境变量

### 安装

```bash
git clone <repo-url>
cd ShortVideos_Claude
npm install
```

### 准备素材

将以下文件放入 `Material/` 目录（会被自动复制到 `public/`）：

- 背景视频（如 `216199_medium.mp4`）→ 复制到 `public/videos/background.mp4`
- BGM 音频（如 `.mp3`）→ 复制到 `public/audio/bgm.mp3`

### 启动服务

```bash
# 启动后端 API（端口 3000）
npm run dev:server

# 启动前端 UI（端口 5173）
npm run dev:client

# 启动 Remotion Studio 预览（端口 3100，可选）
npm run dev:remotion
```

打开浏览器访问 **http://localhost:5173**。

## 使用流程

### 1. 创建单词本

在"单词本"标签页中：

1. 输入单词本名称和主题（如"西海岸常用俚语"）
2. 点击"创建"
3. 选中创建的单词本

添加单词的两种方式：
- **手动添加**：在输入框中输入单词/短语，按 Enter
- **AI 批量生成**：设置数量，点击"AI 生成单词"，Gemini Flash 会自动生成包含所有字段的单词

### 2. 生成资源

在"生成"标签页中：

- **运行流水线（跳过 Veo）**：自动生成 TTS 音频 + Pixabay 图片（免费/极低成本）
- **完整流水线（含 Veo）**：额外生成 AI 例句视频 + 字幕（~$2.40/单词）

也可以对每个步骤单独执行：
1. 内容生成（Gemini Flash）— 免费
2. TTS 音频（Gemini TTS）— ~$0.05/单词
3. 图片搜索（Pixabay）— 免费
4. AI 视频（Veo 3.1）— ~$2.40/单词
5. 字幕生成（Gemini）— ~$0.01/单词
6. 渲染视频（本地）— 免费

### 3. 预览与调整资源

在"资源"标签页中：

- 展开每个单词卡片，查看所有已生成的资源
- 播放 TTS 音频、预览图片、观看 AI 视频
- 可手动编辑以下文本字段并保存：
  - `word`、`phonetic`、`chineseMeaning`、`englishMeaning`
  - `patterns`、`patternTranslations`
  - `examples`（英文 + 中文）
- 文本支持细粒度 AI 重生成：
  - `AI重生成整词内容`
  - `AI仅重生成句式`
  - `AI仅重生成例句`
  - `AI重生成该例句`（单条）
- 素材支持细粒度重生成：
  - 单条 TTS（开场白/中文介绍/英文发音/任一句式）
  - 单条示例视频（按 `exampleIndex`）
  - 单条字幕（按 `exampleIndex`）
- 重新生成后可重新渲染视频

### 4. 渲染视频

通过 API 或渲染脚本生成最终视频：

```bash
# 命令行渲染
npx tsx render.ts
```

成品视频输出到 `output/` 目录。

### 5. 修改配置

在"配置"标签页中可编辑：

- 作用域切换：
  - **全局默认**：影响所有单词本
  - **当前词库覆盖**：仅影响当前选中的单词本（留空字段会继承全局默认）
- API Key（Pixabay）
- GCP 项目/区域
- AI 模型名称
- 所有 Prompt（TTS 语音风格、内容生成、Veo 视频等）
- 视频参数（帧率、分辨率、BGM 音量等）
- 预算上限

## 细粒度重生成接口（新增）

除原有接口外，新增以下 API：

- `POST /api/generate/content-partial/:listId/:wordId`
  - `mode: "full" | "patterns" | "examples" | "example_single"`
  - `example_single` 时额外传 `exampleIndex`
- `POST /api/generate/video-single/:listId/:wordId/:exampleIndex`
  - 仅重生成指定例句视频
- `POST /api/generate/subtitle-single/:listId/:wordId/:exampleIndex`
  - 仅重生成指定视频字幕

这些接口用于避免整词全量重跑，节省时间和成本。

## 常见问题

- 前端提示 `Unexpected token '<' ... is not valid JSON`：
  - 通常是访问到了旧的 Vite 端口实例（返回了 HTML 404 页面）。
  - 请只保留一个前端实例并访问当前端口（默认 `5173`）。

## 单词本数据格式

单词本以 JSON 文件存储在 `data/wordlists/` 目录。每个单词条目包含以下字段：

```json
{
  "id": "唯一ID",
  "word": "vibe",
  "phonetic": "/vaɪb/",
  "chineseMeaning": "氛围，感觉",
  "englishMeaning": "a feeling or atmosphere",
  "patterns": [
    "The vibe is off today.",
    "I'm just vibing right now.",
    "This place has a chill vibe."
  ],
  "patternTranslations": [
    "今天气氛不对劲。",
    "我现在就是在随意享受着。",
    "这地方氛围很放松。"
  ],
  "examples": [
    {
      "english": "Yo, the vibe at the beach party was absolutely unreal, bro. Everybody was just flowing with the music.",
      "chinese": "哟，海滩派对的氛围简直不真实，兄弟。每个人都跟着音乐摇摆。"
    },
    {
      "english": "Man, I can't mess with that spot no more, the vibe is all wrong. It used to be so lit.",
      "chinese": "兄弟，我不能再去那个地方了，氛围全都不对了。以前那里超嗨。"
    }
  ],
  "status": "pending | content_ready | assets_ready | rendered",
  "assets": {
    "chineseIntroTtsPath": "audio/chinese_intro.wav",
    "chineseIntroTtsDuration": 3.41,
    "chineseWordTtsPath": "audio/w-vibe_chinese_word.wav",
    "chineseWordTtsDuration": 4.85,
    "englishTtsPath": "audio/w-vibe_english.wav",
    "englishTtsDuration": 6.21,
    "patternTtsPaths": ["audio/w-vibe_pattern_0.wav", "..."],
    "patternTtsDurations": [2.85, 2.45, 3.29],
    "imagePath": "images/w-vibe.jpg",
    "exampleVideoPaths": ["videos/w-vibe_example_0.mp4", "videos/w-vibe_example_1.mp4"],
    "exampleVideoDurations": [8, 8],
    "subtitleData": [[{"text": "...", "translation": "...", "startTime": 0, "endTime": 5.17}]]
  }
}
```

### 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `word` | 是 | 英文单词/短语/句式 |
| `phonetic` | 是 | 国际音标 |
| `chineseMeaning` | 是 | 简明中文释义 |
| `englishMeaning` | 是 | 英文释义 |
| `patterns` | 是 | 3 个常用句式 |
| `patternTranslations` | 是 | 3 个句式的中文翻译 |
| `examples` | 是 | 2 个例句（各含英文+中文，每个例句应包含两句连贯的话） |
| `status` | 自动 | 处理状态，由系统自动更新 |
| `assets` | 自动 | 生成的资源路径和元数据，由系统自动填充 |

## 视频结构（3 幕）

### 第 1 幕：开场标题（~7 秒）
- 背景：素材视频（模糊+暗化）
- 标题"每天1个___单词"，滚轮动画展示"高考→六级→雅思→西海岸"
- 闪光过渡，单词/音标/释义淡入
- 中文 TTS + 英文 TTS

### 第 2 幕：句式展示（~8 秒）
- 背景：素材视频（模糊+暗化）
- Pixabay 插图 + 3 个句式（含中文翻译）
- 英文 TTS 逐个朗读，当前句式亮黄色高亮

### 第 3 幕：例句视频（~16 秒）
- 纯色渐变背景
- 2 个 AI 生成的真人视频（16:9，淡入淡出过渡）
- 中英双语实时字幕
- BGM 音量自动降低

## 费用估算

| 服务 | 单价 | 每单词费用 |
|------|------|-----------|
| Gemini Flash（内容） | ~$0.001 | $0.001 |
| Gemini TTS（5 段） | ~$0.01 | $0.05 |
| Pixabay（图片） | 免费 | $0 |
| Veo 3.1 Fast（2×8s） | ~$0.15/s | $2.40 |
| Gemini（字幕） | ~$0.001 | $0.004 |
| **合计** | | **~$2.45** |

$50 预算约可生成 **~20 个单词**的完整视频。

## 代理配置

在中国大陆使用时，需设置代理环境变量：

```bash
export HTTPS_PROXY=http://127.0.0.1:10808
```

应用会自动检测并配置代理（覆写 `globalThis.fetch`）。

## 注意事项

- Veo 3.1 仅支持 16:9 和 9:16 宽高比
- `@google-cloud/vertexai` 已弃用，本项目使用 `@google/genai` SDK
- Gemini TTS 输出 raw PCM 24kHz 16-bit 单声道，需手动转换为 WAV
- FFmpeg 路径可通过 `FFMPEG_PATH` 环境变量指定
- Remotion 渲染使用本地 Chrome，路径在 `render.ts` 中配置
