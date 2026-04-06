import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Mic, Image, Film, Subtitles, Clapperboard, MonitorPlay,
  ChevronDown, ChevronUp, Loader2, CheckCircle2, XCircle, Circle, Play,
  SquareCheck, Square,
} from "lucide-react";
import type { WordList, WordEntry } from "../../types/index";

interface Props {
  wordList: WordList;
  onRefresh: () => void;
}

type StepKey = "tts" | "image" | "video" | "subtitles" | "render";
interface StepDef {
  key: StepKey;
  label: string;
  desc: string;
  cost: string;
  icon: React.ReactNode;
}

const STEPS: StepDef[] = [
  { key: "tts", label: "生成 TTS 音频", desc: "中英文配音、句式朗读", cost: "~$0.05", icon: <Mic size={18} /> },
  { key: "image", label: "搜索插图", desc: "Pixabay 搜索匹配图片", cost: "免费", icon: <Image size={18} /> },
  { key: "video", label: "生成 AI 视频", desc: "Veo 3.1 生成例句视频", cost: "~$2.40", icon: <Film size={18} /> },
  { key: "subtitles", label: "生成字幕", desc: "语音识别 + 校对", cost: "~$0.01", icon: <Subtitles size={18} /> },
  { key: "render", label: "渲染成片", desc: "Remotion 渲染最终视频", cost: "本地", icon: <Clapperboard size={18} /> },
];

const MAX_QUOTA_RETRY = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractErrorText(payload: any): string {
  if (!payload) return "";
  if (typeof payload === "string") return payload;
  if (typeof payload.error === "string") return payload.error;
  try {
    return JSON.stringify(payload.error || payload);
  } catch {
    return String(payload.error || payload);
  }
}

function isQuotaExceededError(message: string): boolean {
  const text = (message || "").toLowerCase();
  return (
    text.includes("resource_exhausted") ||
    text.includes("quota exceeded") ||
    text.includes("global_generate_content_requests") ||
    text.includes("\"code\":429") ||
    text.includes(" status\":\"resource_exhausted\"")
  );
}

const statusMap: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "待处理", color: "#8A8580", bg: "#F0EDE8" },
  content_ready: { label: "内容就绪", color: "#5B7DB1", bg: "#EBF0F7" },
  assets_ready: { label: "资源就绪", color: "#C8956C", bg: "#FDF3EB" },
  rendered: { label: "已渲染", color: "#6B9E6B", bg: "#EDF5ED" },
};

interface LogEntry {
  time: string;
  word: string;
  step: string;
  status: "info" | "success" | "error" | "progress";
  message: string;
}

export const GeneratePage: React.FC<Props> = ({ wordList, onRefresh }) => {
  const [selectionMode, setSelectionMode] = useState<"batch" | "manual">("batch");
  const [batchCount, setBatchCount] = useState(2);
  const [videoCount, setVideoCount] = useState(2);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState<StepKey | null>(null);
  const [currentWord, setCurrentWord] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [expandedStep, setExpandedStep] = useState<StepKey | null>(null);
  const [stepResults, setStepResults] = useState<Record<string, "idle" | "running" | "done" | "error">>({});
  const [renderPreviewOrder, setRenderPreviewOrder] = useState<string[]>([]);
  const [renderPreviewVersions, setRenderPreviewVersions] = useState<Record<string, string>>({});
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // 未渲染的词条
  const unrenderedWords = useMemo(
    () => wordList.words.filter((w) => w.status !== "rendered"),
    [wordList.words],
  );

  // 当前要处理的词条列表
  const wordsToProcess = useMemo(() => {
    if (selectionMode === "batch") {
      return unrenderedWords.slice(0, batchCount);
    }
    return wordList.words.filter((w) => selectedIds.has(w.id));
  }, [selectionMode, batchCount, unrenderedWords, selectedIds, wordList.words]);

  const toggleWord = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addLog = (word: string, step: string, status: LogEntry["status"], message: string) => {
    setLogs((prev) => [...prev, {
      time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
      word, step, status, message,
    }]);
  };

  const markRenderedPreview = (wordId: string) => {
    const version = new Date().toISOString();
    setRenderPreviewVersions((prev) => ({ ...prev, [wordId]: version }));
    setRenderPreviewOrder((prev) => [wordId, ...prev.filter((id) => id !== wordId)]);
  };

  const getEndpoint = (step: StepKey, wordId: string) => {
    if (step === "render") return `/api/render/${wordList.id}/${wordId}`;
    return `/api/generate/${step}/${wordList.id}/${wordId}`;
  };

  const runStep = async (
    step: StepKey,
    word: WordEntry,
    options?: { videoCount?: number },
  ): Promise<boolean> => {
    const endpoint = getEndpoint(step, word.id);
    const effectiveVideoCount = options?.videoCount ?? videoCount;
    const body = step === "video"
      ? JSON.stringify({ confirmed: true, videoCount: effectiveVideoCount })
      : undefined;

    addLog(word.word, step, "progress", `正在执行...`);
    setStepResults((p) => ({ ...p, [`${word.id}-${step}`]: "running" }));

    try {
      let data: any = null;

      for (let retry = 0; retry <= MAX_QUOTA_RETRY; retry++) {
        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          });
          data = await res.json();

          if (data.success) break;

          const errorText = extractErrorText(data);
          const shouldRetry =
            step !== "render" &&
            retry < MAX_QUOTA_RETRY &&
            isQuotaExceededError(errorText);

          if (shouldRetry) {
            const waitSec = 12 + retry * 8;
            addLog(
              word.word,
              step,
              "progress",
              `触发配额限制，${waitSec}s 后自动重试 (${retry + 1}/${MAX_QUOTA_RETRY})`,
            );
            await sleep(waitSec * 1000);
            continue;
          }

          addLog(word.word, step, "error", errorText || "失败");
          setStepResults((p) => ({ ...p, [`${word.id}-${step}`]: "error" }));
          return false;
        } catch (err: any) {
          const errorText = err?.message || "请求失败";
          const shouldRetry =
            step !== "render" &&
            retry < MAX_QUOTA_RETRY &&
            isQuotaExceededError(errorText);

          if (shouldRetry) {
            const waitSec = 12 + retry * 8;
            addLog(
              word.word,
              step,
              "progress",
              `触发配额限制，${waitSec}s 后自动重试 (${retry + 1}/${MAX_QUOTA_RETRY})`,
            );
            await sleep(waitSec * 1000);
            continue;
          }

          throw err;
        }
      }

      if (!data?.success) {
        addLog(word.word, step, "error", "请求失败");
        setStepResults((p) => ({ ...p, [`${word.id}-${step}`]: "error" }));
        return false;
      }

      if (step === "render" && data.success) {
        const jobId = data.data.id;
        addLog(word.word, step, "progress", `渲染任务已提交 (${jobId.slice(0, 8)}...)`);
        let done = false;
        while (!done) {
          await new Promise((r) => setTimeout(r, 5000));
          const pollRes = await fetch(`/api/render/jobs/${jobId}`);
          const pollData = await pollRes.json();
          if (!pollData.success || !pollData.data) {
            addLog(word.word, step, "error", pollData.error || "查询渲染任务失败");
            setStepResults((p) => ({ ...p, [`${word.id}-${step}`]: "error" }));
            return false;
          }

          if (pollData.data.status === "done") {
            done = true;
            addLog(word.word, step, "success", `渲染完成`);
            setStepResults((p) => ({ ...p, [`${word.id}-${step}`]: "done" }));
            markRenderedPreview(word.id);
          } else if (pollData.data.status === "error") {
            addLog(word.word, step, "error", pollData.data.error || "渲染失败");
            setStepResults((p) => ({ ...p, [`${word.id}-${step}`]: "error" }));
            return false;
          } else {
            addLog(word.word, step, "progress", `渲染中 ${(pollData.data.progress * 100).toFixed(0)}%`);
          }
        }
        return true;
      }

      addLog(word.word, step, "success", `完成`);
      setStepResults((p) => ({ ...p, [`${word.id}-${step}`]: "done" }));
      return true;
    } catch (e: any) {
      addLog(word.word, step, "error", e.message);
      setStepResults((p) => ({ ...p, [`${word.id}-${step}`]: "error" }));
      return false;
    }
  };

  const runFullPipeline = async (targetVideoCount: number, shouldRender: boolean) => {
    if (wordsToProcess.length === 0) return;
    setProcessing(true);
    setLogs([]);
    setStepResults({});
    if (shouldRender) {
      setRenderPreviewOrder([]);
      setRenderPreviewVersions({});
    }

    addLog(
      "",
      "pipeline",
      "info",
      `开始处理 ${wordsToProcess.length} 个单词 (第三幕 AI 视频数量: ${targetVideoCount}，${shouldRender ? "包含渲染成片" : "不渲染成片"})`,
    );

    for (const word of wordsToProcess) {
      setCurrentWord(word.word);
      addLog(word.word, "pipeline", "info", `--- 开始 ---`);

      if (!word.assets.chineseWordTtsPath && !word.assets.chineseTtsPath) {
        setCurrentStep("tts");
        await runStep("tts", word);
      } else {
        addLog(word.word, "tts", "success", "TTS 已就绪，跳过");
      }

      if (!word.assets.imagePath) {
        setCurrentStep("image");
        await runStep("image", word);
      } else {
        addLog(word.word, "image", "success", "图片已就绪，跳过");
      }

      const existingVideoCount = word.assets.exampleVideoPaths?.length || 0;
      const existingSubtitleCount = word.assets.subtitleData?.length || 0;

      if (targetVideoCount === 0) {
        if (existingVideoCount > 0 || existingSubtitleCount > 0) {
          setCurrentStep("video");
          await runStep("video", word, { videoCount: targetVideoCount });
        } else {
          addLog(word.word, "video", "success", "第三幕已关闭，跳过");
        }
      } else if (existingVideoCount !== targetVideoCount) {
        setCurrentStep("video");
        await runStep("video", word, { videoCount: targetVideoCount });
      } else if (existingSubtitleCount < targetVideoCount) {
        setCurrentStep("subtitles");
        await runStep("subtitles", word);
      } else {
        addLog(word.word, "video", "success", `AI 视频数量已是 ${targetVideoCount}，跳过`);
      }

      if (shouldRender) {
        setCurrentStep("render");
        await runStep("render", word);
      } else {
        addLog(word.word, "render", "info", "按当前流水线配置跳过成片渲染");
      }

      addLog(word.word, "pipeline", "success", `--- 完成 ---`);
    }

    onRefresh();
    setProcessing(false);
    setCurrentStep(null);
    setCurrentWord("");
    addLog("", "pipeline", "success", "全部处理完毕");
  };

  const runSingleStep = async (step: StepKey) => {
    if (wordsToProcess.length === 0) return;
    setProcessing(true);
    setCurrentStep(step);
    if (step === "render") {
      setRenderPreviewOrder([]);
      setRenderPreviewVersions({});
    }
    addLog("", step, "info", `对 ${wordsToProcess.length} 个单词执行: ${STEPS.find((s) => s.key === step)?.label}`);
    for (const word of wordsToProcess) {
      setCurrentWord(word.word);
      await runStep(step, word, step === "video" ? { videoCount } : undefined);
    }
    onRefresh();
    setProcessing(false);
    setCurrentStep(null);
  };

  const logColors: Record<string, string> = {
    info: "#8A8580",
    success: "#6B9E6B",
    error: "#C05050",
    progress: "#C8956C",
  };

  const renderedCount = wordList.words.filter((w) => w.status === "rendered").length;
  const selectedVideoCost = (videoCount * 1.2).toFixed(2);
  const renderPreviewItems = renderPreviewOrder.map((wordId) => {
    const word = wordList.words.find((w) => w.id === wordId);
    return {
      wordId,
      wordLabel: word?.word || wordId.slice(0, 8),
      version: renderPreviewVersions[wordId] || "",
    };
  });

  return (
    <div>
      {/* 选择要处理的词条 */}
      <div style={S.section}>
        <div style={S.sectionHeader}>
          <div>
            <h2 style={S.sectionTitle}>生成视频</h2>
            <div style={{ fontSize: 13, color: "#8A8580", marginTop: 4 }}>
              词库: {wordList.name} · {wordList.words.length} 个词条
              {renderedCount > 0 && <span style={{ color: "#6B9E6B" }}> ({renderedCount} 已渲染)</span>}
            </div>
          </div>

          {/* 选择模式切换 */}
          <div style={{ display: "flex", gap: 4, backgroundColor: "#F0EDE8", borderRadius: 8, padding: 3 }}>
            <button
              onClick={() => setSelectionMode("batch")}
              disabled={processing}
              style={{
                ...S.modeBtn,
                ...(selectionMode === "batch" ? S.modeBtnActive : {}),
              }}
            >
              批量选择
            </button>
            <button
              onClick={() => setSelectionMode("manual")}
              disabled={processing}
              style={{
                ...S.modeBtn,
                ...(selectionMode === "manual" ? S.modeBtnActive : {}),
              }}
            >
              手动选择
            </button>
          </div>
        </div>

        {/* 批量模式 */}
        {selectionMode === "batch" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: "#8A8580" }}>从未渲染词条中取前</span>
              <input
                type="number" value={batchCount} min={1} max={Math.max(unrenderedWords.length, 1)}
                onChange={(e) => setBatchCount(Math.min(Number(e.target.value), unrenderedWords.length))}
                style={{ ...S.inputSmall, width: 56 }}
                disabled={processing}
              />
              <span style={{ fontSize: 13, color: "#8A8580" }}>条</span>
              <span style={{ fontSize: 12, color: "#B0AAA4" }}>
                (共 {unrenderedWords.length} 条未渲染)
              </span>
            </div>
            {unrenderedWords.length === 0 && (
              <div style={{ padding: "20px 0", color: "#6B9E6B", fontSize: 14, textAlign: "center" }}>
                所有词条都已渲染完成
              </div>
            )}
          </div>
        )}

        {/* 手动模式 */}
        {selectionMode === "manual" && (
          <div>
            <div style={{ fontSize: 12, color: "#8A8580", marginBottom: 8 }}>
              点击词条进行选择 (已选 {selectedIds.size} 个)
            </div>
          </div>
        )}

        {/* 词条列表 */}
        <div style={S.wordList}>
          {(selectionMode === "batch" ? unrenderedWords.slice(0, batchCount) : wordList.words).map((w) => {
            const st = statusMap[w.status] || statusMap.pending;
            const isSelected = selectionMode === "manual" ? selectedIds.has(w.id) : true;
            const isRendered = w.status === "rendered";

            return (
              <div
                key={w.id}
                onClick={selectionMode === "manual" && !processing ? () => toggleWord(w.id) : undefined}
                style={{
                  ...S.wordRow,
                  ...(selectionMode === "manual" ? { cursor: "pointer" } : {}),
                  ...(isSelected && selectionMode === "manual" ? { backgroundColor: "#FDF8F3", borderColor: "#C8956C" } : {}),
                  ...(isRendered && selectionMode === "manual" ? { opacity: 0.6 } : {}),
                }}
              >
                {selectionMode === "manual" && (
                  isSelected
                    ? <SquareCheck size={18} color="#C8956C" />
                    : <Square size={18} color="#D4CFC8" />
                )}
                <span style={{ fontFamily: "'Noto Serif SC', serif", fontWeight: 600, fontSize: 15, minWidth: 80 }}>
                  {w.word}
                </span>
                <span style={{ fontSize: 13, color: "#8A8580", flex: 1 }}>{w.chineseMeaning}</span>
                <span style={{ ...S.badge, backgroundColor: st.bg, color: st.color }}>{st.label}</span>
              </div>
            );
          })}
          {selectionMode === "batch" && wordsToProcess.length === 0 && unrenderedWords.length === 0 && (
            <div style={{ padding: 20, textAlign: "center", color: "#B0AAA4", fontSize: 14 }}>
              所有词条都已渲染完成
            </div>
          )}
        </div>
      </div>

      {/* 步骤列表 */}
      <div style={S.section}>
        <h3 style={{ ...S.sectionTitle, marginBottom: 16 }}>
          流水线步骤
          <span style={{ fontSize: 13, fontWeight: 400, color: "#8A8580", marginLeft: 12 }}>
            将处理 {wordsToProcess.length} 个词条
          </span>
        </h3>

        {STEPS.map((step, idx) => {
          const isExpanded = expandedStep === step.key;
          const isCurrent = currentStep === step.key;
          return (
            <div key={step.key} style={{ ...S.stepCard, ...(isCurrent ? S.stepCardActive : {}) }}>
              <div
                style={S.stepHeader}
                onClick={() => setExpandedStep(isExpanded ? null : step.key)}
              >
                <div style={S.stepLeft}>
                  <div style={{
                    ...S.stepNum,
                    ...(isCurrent ? { backgroundColor: "#C8956C", color: "#fff" } : {}),
                  }}>
                    {idx + 1}
                  </div>
                  <div style={S.stepIcon}>{step.icon}</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{step.label}</div>
                    <div style={{ fontSize: 12, color: "#8A8580", marginTop: 2 }}>{step.desc}</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={S.costTag}>
                    {step.key === "video" ? (videoCount === 0 ? "$0.00" : `~$${selectedVideoCost}`) : step.cost}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); runSingleStep(step.key); }}
                    disabled={processing || wordsToProcess.length === 0}
                    style={{
                      ...S.stepRunBtn,
                      opacity: processing || wordsToProcess.length === 0 ? 0.4 : 1,
                    }}
                  >
                    <Play size={12} /> 执行
                  </button>
                  {isExpanded ? <ChevronUp size={16} color="#B0AAA4" /> : <ChevronDown size={16} color="#B0AAA4" />}
                </div>
              </div>

              {isExpanded && (
                <div style={S.stepDetail}>
                  {wordsToProcess.map((w) => {
                    const st = stepResults[`${w.id}-${step.key}`] || "idle";
                    const StatusIcon = st === "done" ? CheckCircle2 : st === "error" ? XCircle : st === "running" ? Loader2 : Circle;
                    const stColor = st === "done" ? "#6B9E6B" : st === "error" ? "#C05050" : st === "running" ? "#C8956C" : "#D4CFC8";
                    return (
                      <div key={w.id} style={S.stepWordRow}>
                        <StatusIcon
                          size={16}
                          color={stColor}
                          style={st === "running" ? { animation: "spin 1s linear infinite" } : {}}
                        />
                        <span style={{ fontWeight: 500 }}>{w.word}</span>
                        <span style={{ color: "#B0AAA4", fontSize: 12 }}>{w.chineseMeaning}</span>
                      </div>
                    );
                  })}
                  {wordsToProcess.length === 0 && (
                    <div style={{ color: "#B0AAA4", fontSize: 13, padding: "8px 0" }}>未选择任何词条</div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        <div style={S.videoCountBar}>
          <span style={S.videoCountLabel}>第三幕 AI 视频数量</span>
          <div style={{ display: "flex", gap: 8 }}>
            {[0, 1, 2].map((count) => (
              <button
                key={count}
                onClick={() => setVideoCount(count)}
                disabled={processing}
                style={{
                  ...S.videoCountBtn,
                  ...(videoCount === count ? S.videoCountBtnActive : {}),
                  opacity: processing ? 0.6 : 1,
                }}
              >
                {count}
              </button>
            ))}
          </div>
          <span style={S.videoCountHint}>
            {videoCount === 0
              ? "本次将移除第三幕并缩短成片"
              : `本次每词生成 ${videoCount} 段AI视频，预估 ~$${selectedVideoCost}/词`}
          </span>
        </div>

        {/* 一键运行按钮 */}
        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          <button
            onClick={() => runFullPipeline(0, false)}
            disabled={processing || wordsToProcess.length === 0}
            style={{ ...S.pipelineBtn, backgroundColor: "#5B7DB1", opacity: wordsToProcess.length === 0 ? 0.4 : 1 }}
          >
            {processing
              ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> 处理中...</>
              : `运行流水线 — 跳过 AI 视频（不渲染）(${wordsToProcess.length} 条)`}
          </button>
          <button
            onClick={() => runFullPipeline(videoCount, true)}
            disabled={processing || wordsToProcess.length === 0}
            style={{ ...S.pipelineBtn, backgroundColor: "#C8956C", opacity: wordsToProcess.length === 0 ? 0.4 : 1 }}
          >
            {processing
              ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> 处理中 ({currentWord})...</>
              : `完整流水线 — 第三幕 ${videoCount} 段 (${wordsToProcess.length} 条)`}
          </button>
        </div>
      </div>

      {renderPreviewItems.length > 0 && (
        <div style={S.section}>
          <h3 style={{ ...S.sectionTitle, marginBottom: 12 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <MonitorPlay size={18} /> 本次生成成片预览
            </span>
          </h3>
          <div style={S.previewGrid}>
            {renderPreviewItems.map((item) => (
              <div key={item.wordId} style={S.previewCard}>
                <div style={S.previewTitle}>{item.wordLabel}</div>
                <div style={S.previewViewport}>
                  <video
                    controls
                    preload="metadata"
                    src={`/output/${item.wordId}.mp4?v=${encodeURIComponent(item.version)}`}
                    style={S.previewVideo}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 实时日志 */}
      {logs.length > 0 && (
        <div style={S.section}>
          <h3 style={{ ...S.sectionTitle, marginBottom: 12 }}>运行日志</h3>
          <div style={S.logBox}>
            {logs.map((log, i) => (
              <div key={i} style={S.logLine}>
                <span style={S.logTime}>{log.time}</span>
                {log.word && <span style={S.logWord}>{log.word}</span>}
                <span style={{ color: logColors[log.status] }}>{log.message}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}
    </div>
  );
};

const S: Record<string, React.CSSProperties> = {
  section: { backgroundColor: "#fff", borderRadius: 12, border: "1px solid #E8E3DD", padding: 24, marginBottom: 24 },
  sectionHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  sectionTitle: { fontSize: 20, fontWeight: 700, fontFamily: "'Noto Serif SC', Georgia, serif", color: "#2D2A26", margin: 0 },
  inputSmall: { padding: "6px 10px", border: "1px solid #E0DBD4", borderRadius: 6, fontSize: 14, color: "#2D2A26", outline: "none", background: "#FAFAF8", textAlign: "center" as const },
  modeBtn: { padding: "6px 14px", borderRadius: 6, fontSize: 13, fontWeight: 500, color: "#8A8580", background: "transparent", border: "none" },
  modeBtnActive: { backgroundColor: "#fff", color: "#2D2A26", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" },
  wordList: { display: "flex", flexDirection: "column" as const, gap: 4 },
  wordRow: { display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", border: "1px solid #E8E3DD", borderRadius: 8, backgroundColor: "#fff", transition: "all 0.1s" },
  badge: { display: "inline-block", padding: "3px 12px", borderRadius: 12, fontSize: 12, fontWeight: 500 },
  stepCard: { border: "1px solid #E8E3DD", borderRadius: 10, marginBottom: 8, overflow: "hidden", transition: "all 0.15s" },
  stepCardActive: { borderColor: "#C8956C", boxShadow: "0 0 0 1px #C8956C" },
  stepHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", cursor: "pointer", backgroundColor: "#FAFAF8" },
  stepLeft: { display: "flex", alignItems: "center", gap: 12 },
  stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#E8E3DD", color: "#8A8580", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, flexShrink: 0 },
  stepIcon: { color: "#8A8580", flexShrink: 0 },
  costTag: { fontSize: 11, color: "#B0AAA4", backgroundColor: "#F0EDE8", padding: "2px 8px", borderRadius: 8 },
  stepRunBtn: { display: "flex", alignItems: "center", gap: 4, padding: "5px 12px", backgroundColor: "#fff", border: "1px solid #E0DBD4", borderRadius: 6, fontSize: 12, fontWeight: 500, color: "#6B6560" },
  videoCountBar: { display: "flex", alignItems: "center", gap: 12, marginTop: 12, padding: "10px 12px", borderRadius: 8, backgroundColor: "#FAFAF8", border: "1px solid #E8E3DD", flexWrap: "wrap" as const },
  videoCountLabel: { fontSize: 13, color: "#6B6560", fontWeight: 600 },
  videoCountBtn: { width: 30, height: 30, borderRadius: 6, border: "1px solid #E0DBD4", backgroundColor: "#fff", color: "#6B6560", fontSize: 13, fontWeight: 600 },
  videoCountBtnActive: { borderColor: "#C8956C", backgroundColor: "#FDF8F3", color: "#C8956C" },
  videoCountHint: { fontSize: 12, color: "#8A8580" },
  stepDetail: { padding: "12px 20px 16px", borderTop: "1px solid #E8E3DD", backgroundColor: "#fff" },
  stepWordRow: { display: "flex", alignItems: "center", gap: 8, padding: "6px 0", fontSize: 13 },
  pipelineBtn: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 24px", color: "#fff", borderRadius: 10, fontSize: 14, fontWeight: 600 },
  previewGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 220px))", justifyContent: "start", gap: 12 },
  previewCard: { width: 220, border: "1px solid #E8E3DD", borderRadius: 10, backgroundColor: "#FAFAF8", padding: 10 },
  previewTitle: { fontSize: 13, fontWeight: 600, color: "#2D2A26", marginBottom: 8 },
  previewViewport: { width: "100%", aspectRatio: "9 / 16", borderRadius: 8, overflow: "hidden", backgroundColor: "#000" },
  previewVideo: { width: "100%", height: "100%", objectFit: "contain" as const, display: "block" },
  logBox: { maxHeight: 400, overflowY: "auto" as const, backgroundColor: "#FAFAF8", borderRadius: 8, padding: 16, border: "1px solid #E8E3DD", fontFamily: "'Noto Sans SC', monospace", fontSize: 13 },
  logLine: { display: "flex", gap: 8, padding: "4px 0", borderBottom: "1px solid #F0EDE8", alignItems: "baseline" },
  logTime: { color: "#B0AAA4", fontSize: 11, fontFamily: "monospace", minWidth: 70, flexShrink: 0 },
  logWord: { color: "#C8956C", fontWeight: 600, minWidth: 60 },
};
