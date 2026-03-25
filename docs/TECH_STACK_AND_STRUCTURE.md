# 技术栈与项目结构详解

本文档聚焦项目的工程结构、关键技术选型、运行链路与易出错细节，适合作为开发/部署前的技术说明。

## 1. 总体架构

项目是一个本地运行的全栈应用，采用“前后端分离 + 本地文件存储 + Remotion 渲染”的模式：

1. 前端（Vite + React）负责词库管理、配置编辑、素材预览和流水线触发。
2. 后端（Express）负责调用 Gemini/Veo/Pixabay、组织资源生成、写入词库 JSON。
3. Remotion 负责把音频、图片、AI 示例视频、字幕合成为最终竖屏短视频。
4. 数据以 JSON 和本地媒体文件形式保存，不依赖数据库。

## 2. 技术栈说明

| 层 | 技术 | 作用 |
| --- | --- | --- |
| 前端 | React 19 + Vite 6 + TypeScript | 管理词库、流程控制、素材编辑与预览 |
| 后端 | Express 5 + TypeScript | API 路由、AI 调用编排、文件落盘 |
| AI 文本 | Google Gemini 2.5 Flash | 单词释义/句式/例句生成、字幕校验 |
| AI 语音 | Gemini TTS | 中文开场、中文解释、英文发音、句式朗读 |
| AI 视频 | Veo 3.1 Fast | 例句真人短视频生成 |
| 字幕 | Gemini + FFmpeg | 音频提取、转录、对齐和中英字幕结构化 |
| 视频合成 | Remotion 4.x | 3幕动画编排、最终 MP4 输出 |
| 媒体处理 | FFmpeg | 音频抽取、音量增益等后处理 |

## 3. 关键目录结构

```text
src/
  client/                      # Web UI
    App.tsx                    # 顶层页面与标签页切换
    components/
      WordListPage.tsx         # 单词本管理
      GeneratePage.tsx         # 流水线执行
      AssetsPage.tsx           # 素材预览/编辑/细粒度重生成
      SettingsPage.tsx         # 全局/词库覆盖配置
  server/
    index.ts                   # Express 启动入口
    routes/
      wordlist.ts              # 单词本 CRUD
      generate.ts              # 内容/TTS/图片/视频/字幕生成
      render.ts                # Remotion 渲染任务
      config.ts                # 配置读写与客户端重置
  services/
    config.ts                  # data/config.json 读写
    gemini-content.ts          # 内容生成与 JSON 解析
    gemini-tts.ts              # TTS 生成
    veo.ts                     # Veo 生成 + 音量增强
    subtitle.ts                # 字幕转录/校验
    pixabay.ts                 # 图片检索与下载
    cost-tracker.ts            # 成本记录
  remotion/
    WestCoastWord/             # 3幕视频组件

data/
  config.json                  # 运行配置（敏感信息，不建议提交）
  wordlists/*.json             # 词库数据
  cost-log.json                # 成本记录

public/
  audio/ images/ videos/       # 生成素材目录（渲染输入）

output/                        # 最终渲染视频（渲染输出）
```

## 4. 运行链路（从词到视频）

1. 创建或导入词库（`/api/wordlists`）。
2. 生成内容（`/api/generate/content` 或 `content-partial`）。
3. 生成 TTS（`/api/generate/tts` / `tts-single`）。
4. 生成图片（`/api/generate/image`）。
5. 生成示例视频（`/api/generate/video` / `video-single`）。
6. 生成字幕（`/api/generate/subtitles` / `subtitle-single`）。
7. Remotion 渲染（`/api/render`）。

## 5. 配置体系（全局 + 词库覆盖）

### 5.1 全局配置

`data/config.json` 提供默认模型、提示词、GCP 参数、代理与预算。

### 5.2 词库覆盖

每个词库可选 `config` 字段，仅覆盖：

1. `models`（tts、ttsVoice、contentGeneration、subtitle、video）
2. `prompts`（englishVoice、chineseVoice、contentGeneration、veoVideo、模板等）

合并策略：词库覆盖优先，空值自动回退全局。

## 6. 易出错细节（重点）

### 6.1 GCP 与 Vertex AI

1. 必须正确登录并设置 ADC：
   - `gcloud auth login`
   - `gcloud auth application-default login`
2. `project` 与 `location` 必须与已开通的 Vertex AI 匹配。
3. 未开通 API 常见报错：
   - `aiplatform.googleapis.com` 未启用
   - 权限不足（Service Usage / Vertex AI）

### 6.2 代理配置（中国大陆高频问题）

1. 若无法访问 Google API，先确认本地代理可用。
2. 项目支持在设置页配置 `proxy.host/port/enabled`。
3. 也可通过环境变量设置：`HTTPS_PROXY=http://127.0.0.1:10808`。
4. 修改代理后建议重启后端，使请求客户端状态一致。

### 6.3 前端端口与 API 代理

1. Vite 默认 `5173`，若被占用会自动切到 `5174/5175`。
2. 若浏览器命中旧端口实例，可能出现：
   - 接口返回 HTML 404
   - 控制台报 `Unexpected token '<' ... is not valid JSON`
3. 建议只保留一个前端实例，并固定访问同一端口。

### 6.4 FFmpeg 依赖

1. 字幕提取与视频音量增强依赖 FFmpeg。
2. 若系统找不到 ffmpeg，可设置 `FFMPEG_PATH` 指向可执行文件。
3. Veo 视频已在服务层增加约 `1.2x` 音量增益后处理；若失败会回退原始音轨并打印 warning。

### 6.5 本地文件缓存

1. 生成素材后，浏览器可能缓存旧资源。
2. 前端已使用资源版本参数（基于 `updatedAt`）减少缓存问题。
3. 若仍异常，建议清空浏览器缓存并确认素材路径是否变化。

## 7. 成本与稳定性建议

1. 优先使用细粒度重生成（`content-partial`、`video-single`、`subtitle-single`）降低成本。
2. Veo 成本最高，建议先人工编辑文本后再生成视频。
3. 批量执行时注意预算上限，避免一次性触发大量视频生成。

## 8. 开发与调试建议

1. 后端日志优先看 `src/server/routes/generate.ts` 的调用链。
2. 内容 JSON 异常优先看 `src/services/gemini-content.ts` 的解析逻辑。
3. 字幕异常优先检查 FFmpeg 与音频提取中间文件。
4. 渲染异常优先看 `src/remotion/WestCoastWord/*` 的时序与资源路径。

---

若要把该文档分享给协作者，建议同时提供一份脱敏版 `data/config.example.json`，避免泄露 API Key / GCP 项目信息。
