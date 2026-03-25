import React, { useState } from "react";
import type { WordList, WordEntry } from "../../types/index";

interface Props {
  wordList: WordList;
  onRefresh: () => void;
}

type PipelineStep =
  | "content"
  | "tts"
  | "image"
  | "video"
  | "subtitles"
  | "render";

const STEPS: { key: PipelineStep; label: string; cost: string }[] = [
  { key: "content", label: "内容生成", cost: "免费" },
  { key: "tts", label: "TTS 音频", cost: "~$0.05" },
  { key: "image", label: "搜索图片", cost: "免费" },
  { key: "video", label: "AI 视频", cost: "~$2.40" },
  { key: "subtitles", label: "字幕生成", cost: "~$0.01" },
  { key: "render", label: "渲染视频", cost: "本地" },
];

export const BatchControls: React.FC<Props> = ({ wordList, onRefresh }) => {
  const [processing, setProcessing] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const runStep = async (
    step: PipelineStep,
    word: WordEntry,
  ): Promise<boolean> => {
    const endpoint = step === "render"
      ? `/api/render/${wordList.id}/${word.id}`
      : step === "content"
        ? `/api/generate/content/${wordList.id}/${word.id}`
        : step === "video"
          ? `/api/generate/video/${wordList.id}/${word.id}`
          : `/api/generate/${step}/${wordList.id}/${word.id}`;

    const body =
      step === "video" ? JSON.stringify({ confirmed: true }) : undefined;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const data = await res.json();

    if (!data.success) {
      addLog(`[${word.word}] ${step} 失败: ${data.error}`);
      return false;
    }
    addLog(`[${word.word}] ${step} 完成`);
    return true;
  };

  const runPipeline = async (skipVeo: boolean) => {
    setProcessing("pipeline");
    setLogs([]);

    for (const word of wordList.words) {
      addLog(`--- 开始处理: ${word.word} ---`);

      if (word.status === "pending") {
        const ok = await runStep("content", word);
        if (!ok) continue;
      }

      if (!word.assets.chineseTtsPath) {
        await runStep("tts", word);
      }

      if (!word.assets.imagePath) {
        await runStep("image", word);
      }

      if (!skipVeo && !word.assets.exampleVideoPaths?.length) {
        await runStep("video", word);
        if (word.assets.exampleVideoPaths?.length) {
          await runStep("subtitles", word);
        }
      }

      addLog(`[${word.word}] 流水线完成 ${skipVeo ? "(跳过 Veo)" : ""}`);
    }

    onRefresh();
    setProcessing(null);
    addLog("=== 全部完成 ===");
  };

  const runSingleStep = async (step: PipelineStep) => {
    setProcessing(step);
    for (const word of wordList.words) {
      await runStep(step, word);
    }
    onRefresh();
    setProcessing(null);
  };

  return (
    <div>
      {/* 流水线控制 */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>批量生成流水线</h3>
        <div style={styles.steps}>
          {STEPS.map((s) => (
            <div key={s.key} style={styles.stepCard}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{s.label}</div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
                {s.cost}
              </div>
              <button
                onClick={() => runSingleStep(s.key)}
                disabled={!!processing}
                style={styles.stepBtn}
              >
                执行
              </button>
            </div>
          ))}
        </div>

        <div style={{ ...styles.row, marginTop: 20 }}>
          <button
            onClick={() => runPipeline(true)}
            disabled={!!processing}
            style={{
              ...styles.btn,
              backgroundColor: "#4A90D9",
              flex: 1,
            }}
          >
            {processing ? "处理中..." : "运行流水线 (跳过 Veo)"}
          </button>
          <button
            onClick={() => runPipeline(false)}
            disabled={!!processing}
            style={{
              ...styles.btn,
              backgroundColor: "#F5A623",
              color: "#000",
              flex: 1,
            }}
          >
            完整流水线 (含 Veo)
          </button>
        </div>
      </div>

      {/* 日志 */}
      {logs.length > 0 && (
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>日志</h3>
          <div style={styles.logBox}>
            {logs.map((log, i) => (
              <div key={i} style={styles.logLine}>
                {log}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  section: {
    marginBottom: 24,
    padding: 24,
    backgroundColor: "#111118",
    borderRadius: 12,
    border: "1px solid #1a1a2e",
  },
  sectionTitle: { margin: "0 0 16px", fontSize: 18, fontWeight: 600 },
  steps: {
    display: "grid",
    gridTemplateColumns: "repeat(6, 1fr)",
    gap: 12,
  },
  stepCard: {
    padding: 16,
    backgroundColor: "#1a1a2e",
    borderRadius: 10,
    textAlign: "center" as const,
  },
  stepBtn: {
    marginTop: 10,
    padding: "6px 16px",
    backgroundColor: "#2a2a3e",
    border: "none",
    borderRadius: 6,
    color: "#e0e0e0",
    cursor: "pointer",
    fontSize: 12,
  },
  row: { display: "flex", gap: 12 },
  btn: {
    padding: "12px 24px",
    border: "none",
    borderRadius: 8,
    color: "#fff",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
  },
  logBox: {
    maxHeight: 400,
    overflowY: "auto" as const,
    backgroundColor: "#0a0a0f",
    borderRadius: 8,
    padding: 16,
    fontFamily: "monospace",
    fontSize: 13,
  },
  logLine: {
    padding: "3px 0",
    color: "#aaa",
    borderBottom: "1px solid #111",
  },
};
