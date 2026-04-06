import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown, ChevronUp, Loader2, RefreshCw,
  Volume2, ImageIcon, Film, Captions, Music, MonitorPlay, Edit3, Save, X, Trash2,
} from "lucide-react";
import type { WordList, WordEntry, WordAssets } from "../../types/index";

interface Props {
  wordList: WordList;
  onRefresh: () => void;
}

interface WordDraft {
  word: string;
  phonetic: string;
  chineseMeaning: string;
  englishMeaning: string;
  patterns: string[];
  patternTranslations: string[];
  examples: Array<{ english: string; chinese: string }>;
}

const DEFAULT_TTS_SPEED = 1.25;
const MIN_TTS_SPEED = 0.8;
const MAX_TTS_SPEED = 1.6;
const DEFAULT_SCENE4_OUTRO_SPEED = 1;
const SPEED_OPTIONS = Array.from({ length: 17 }, (_, i) => Number((0.8 + i * 0.05).toFixed(2)));

function normalizeTtsSpeed(speed?: number): number {
  if (!Number.isFinite(speed)) return DEFAULT_TTS_SPEED;
  return Math.min(MAX_TTS_SPEED, Math.max(MIN_TTS_SPEED, Number(speed)));
}

function normalizeScene4OutroSpeed(speed?: number): number {
  if (!Number.isFinite(speed)) return DEFAULT_SCENE4_OUTRO_SPEED;
  return Math.min(MAX_TTS_SPEED, Math.max(MIN_TTS_SPEED, Number(speed)));
}

function getPatternSpeeds(word: WordEntry): number[] {
  const count = Math.max(
    word.patterns.length,
    word.assets.patternTtsDurations?.length || 0,
    word.assets.patternTtsPaths?.length || 0,
    word.assets.patternTtsSpeeds?.length || 0,
  );
  return Array.from({ length: count }, (_, i) =>
    normalizeTtsSpeed(word.assets.patternTtsSpeeds?.[i]),
  );
}

function pickUnifiedWordSpeed(word: WordEntry): number {
  const speeds = [
    word.assets.chineseIntroTtsSpeed,
    word.assets.chineseWordTtsSpeed,
    word.assets.englishTtsSpeed,
    ...(word.assets.patternTtsSpeeds || []),
  ]
    .filter((v) => Number.isFinite(v))
    .map((v) => normalizeTtsSpeed(v));
  return speeds[0] ?? DEFAULT_TTS_SPEED;
}

const url = (p?: string, version?: string) => {
  if (!p) return undefined;
  return version ? `/public/${p}?v=${encodeURIComponent(version)}` : `/public/${p}`;
};

async function parseApiResponse(res: Response): Promise<any> {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }

  const text = await res.text();
  const snippet = text.slice(0, 120).replace(/\s+/g, " ").trim();
  throw new Error(`请求失败 (${res.status})，接口未返回 JSON: ${snippet || "empty response"}`);
}

const statusMap: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "待处理", color: "#8A8580", bg: "#F0EDE8" },
  content_ready: { label: "内容就绪", color: "#5B7DB1", bg: "#EBF0F7" },
  assets_ready: { label: "资源就绪", color: "#C8956C", bg: "#FDF3EB" },
  rendered: { label: "已渲染", color: "#6B9E6B", bg: "#EDF5ED" },
};

function toDraft(word: WordEntry): WordDraft {
  return {
    word: word.word || "",
    phonetic: word.phonetic || "",
    chineseMeaning: word.chineseMeaning || "",
    englishMeaning: word.englishMeaning || "",
    patterns: [...(word.patterns || [])],
    patternTranslations: [...(word.patternTranslations || [])],
    examples: [...(word.examples || [])].map((e) => ({ english: e.english || "", chinese: e.chinese || "" })),
  };
}

export const AssetsPage: React.FC<Props> = ({ wordList, onRefresh }) => {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [statusMsg, setStatusMsg] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [editingWordId, setEditingWordId] = useState<string | null>(null);
  const [draft, setDraft] = useState<WordDraft | null>(null);
  const [renderVideoVersion, setRenderVideoVersion] = useState<Record<string, string>>({});
  const [ttsGlobalSpeedDraft, setTtsGlobalSpeedDraft] = useState<Record<string, number>>({});
  const [videoCount, setVideoCount] = useState(2);
  const [selectedWordIds, setSelectedWordIds] = useState<string[]>([]);
  const [deletingWords, setDeletingWords] = useState(false);
  const [scene4OutroSpeedDraft, setScene4OutroSpeedDraft] = useState(DEFAULT_SCENE4_OUTRO_SPEED);
  const [coverHighlightDraft, setCoverHighlightDraft] = useState("西海岸");
  const bgmInputRef = useRef<HTMLInputElement | null>(null);
  const bgVideoInputRef = useRef<HTMLInputElement | null>(null);
  const coverBgInputRef = useRef<HTMLInputElement | null>(null);
  const scene4TtsInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const idSet = new Set(wordList.words.map((w) => w.id));
    setSelectedWordIds((prev) => prev.filter((id) => idSet.has(id)));
  }, [wordList.id, wordList.updatedAt]);

  useEffect(() => {
    setScene4OutroSpeedDraft(
      normalizeScene4OutroSpeed(wordList.config?.media?.scene4OutroTtsSpeed),
    );
    setCoverHighlightDraft(wordList.config?.cover?.titleHighlight || "西海岸");
  }, [
    wordList.id,
    wordList.updatedAt,
    wordList.config?.media?.scene4OutroTtsSpeed,
    wordList.config?.cover?.titleHighlight,
  ]);

  const selectedWordCount = wordList.words.filter((w) =>
    selectedWordIds.includes(w.id),
  ).length;
  const allWordsSelected =
    wordList.words.length > 0 &&
    selectedWordCount === wordList.words.length;

  const toggleWordSelection = (wordId: string) => {
    setSelectedWordIds((prev) =>
      prev.includes(wordId)
        ? prev.filter((id) => id !== wordId)
        : [...prev, wordId],
    );
  };

  const toggleSelectAllWords = () => {
    if (allWordsSelected) {
      setSelectedWordIds([]);
      return;
    }
    setSelectedWordIds(wordList.words.map((w) => w.id));
  };

  const deleteWords = async (wordIds: string[]) => {
    if (wordIds.length === 0 || deletingWords) return false;

    setDeletingWords(true);
    try {
      const res = await fetch(`/api/wordlists/${wordList.id}/words/batch-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wordIds }),
      });
      const data = await parseApiResponse(res);

      if (data.success) {
        const deletedCount = data.data?.deletedCount || 0;
        setSelectedWordIds((prev) => prev.filter((id) => !wordIds.includes(id)));
        if (expanded && wordIds.includes(expanded)) setExpanded(null);
        if (editingWordId && wordIds.includes(editingWordId)) {
          setEditingWordId(null);
          setDraft(null);
        }
        setStatusMsg((p) => ({
          ...p,
          "words-delete": { ok: true, text: `已删除 ${deletedCount} 个词条` },
        }));
        onRefresh();
        return true;
      }

      setStatusMsg((p) => ({
        ...p,
        "words-delete": { ok: false, text: data.error || "删除失败" },
      }));
      return false;
    } catch (e: any) {
      setStatusMsg((p) => ({
        ...p,
        "words-delete": { ok: false, text: e.message || "删除失败" },
      }));
      return false;
    } finally {
      setDeletingWords(false);
    }
  };

  const deleteOneWord = async (wordId: string, wordLabel: string) => {
    if (!window.confirm(`确认删除词条「${wordLabel}」吗？`)) return;
    await deleteWords([wordId]);
  };

  const deleteSelectedWords = async () => {
    if (selectedWordCount === 0) return;
    if (!window.confirm(`确认批量删除 ${selectedWordCount} 个词条吗？`)) return;
    await deleteWords(selectedWordIds);
  };

  const regen = async (
    key: string,
    endpoint: string,
    body?: object,
    onSuccess?: (data: any) => void,
    successText: string | ((data: any) => string) = "生成完成",
  ) => {
    setLoading((p) => ({ ...p, [key]: true }));
    setStatusMsg((p) => ({ ...p, [key]: { ok: true, text: "请求中..." } }));
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await parseApiResponse(res);
      if (data.success) {
        onSuccess?.(data);
        const resolvedSuccessText =
          typeof successText === "function" ? successText(data) : successText;
        setStatusMsg((p) => ({ ...p, [key]: { ok: true, text: resolvedSuccessText } }));
        onRefresh();
      } else {
        setStatusMsg((p) => ({ ...p, [key]: { ok: false, text: data.error || "失败" } }));
      }
    } catch (e: any) {
      setStatusMsg((p) => ({ ...p, [key]: { ok: false, text: e.message } }));
    } finally {
      setLoading((p) => ({ ...p, [key]: false }));
    }
  };

  const startEdit = (word: WordEntry) => {
    setEditingWordId(word.id);
    setDraft(toDraft(word));
    setExpanded(word.id);
  };

  const cancelEdit = () => {
    setEditingWordId(null);
    setDraft(null);
  };

  const saveEdit = async (wordId: string) => {
    if (!draft) return;
    const key = `${wordId}-save`;
    setLoading((p) => ({ ...p, [key]: true }));
    setStatusMsg((p) => ({ ...p, [key]: { ok: true, text: "保存中..." } }));
    try {
      const res = await fetch(`/api/wordlists/${wordList.id}/words/${wordId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await parseApiResponse(res);
      if (data.success) {
        setStatusMsg((p) => ({ ...p, [key]: { ok: true, text: "保存成功" } }));
        setEditingWordId(null);
        setDraft(null);
        onRefresh();
      } else {
        setStatusMsg((p) => ({ ...p, [key]: { ok: false, text: data.error || "保存失败" } }));
      }
    } catch (e: any) {
      setStatusMsg((p) => ({ ...p, [key]: { ok: false, text: e.message } }));
    } finally {
      setLoading((p) => ({ ...p, [key]: false }));
    }
  };

  const setDraftField = (field: keyof WordDraft, value: any) => {
    setDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const updatePattern = (idx: number, value: string) => {
    if (!draft) return;
    const next = [...draft.patterns];
    next[idx] = value;
    setDraftField("patterns", next);
  };

  const updatePatternTranslation = (idx: number, value: string) => {
    if (!draft) return;
    const next = [...draft.patternTranslations];
    next[idx] = value;
    setDraftField("patternTranslations", next);
  };

  const addPatternRow = () => {
    if (!draft) return;
    setDraftField("patterns", [...draft.patterns, ""]);
    setDraftField("patternTranslations", [...draft.patternTranslations, ""]);
  };

  const removePatternRow = (idx: number) => {
    if (!draft) return;
    setDraftField("patterns", draft.patterns.filter((_, i) => i !== idx));
    setDraftField("patternTranslations", draft.patternTranslations.filter((_, i) => i !== idx));
  };

  const updateExample = (idx: number, key: "english" | "chinese", value: string) => {
    if (!draft) return;
    const next = [...draft.examples];
    next[idx] = { ...next[idx], [key]: value };
    setDraftField("examples", next);
  };

  const addExample = () => {
    if (!draft) return;
    setDraftField("examples", [...draft.examples, { english: "", chinese: "" }]);
  };

  const removeExample = (idx: number) => {
    if (!draft) return;
    setDraftField("examples", draft.examples.filter((_, i) => i !== idx));
  };

  const uploadPublicAsset = async (
    assetType: "bgm" | "background" | "cover-background" | "scene4-tts",
    file?: File,
  ) => {
    if (!file) return;

    const key = `public-${assetType}-upload`;
    setLoading((p) => ({ ...p, [key]: true }));
    setStatusMsg((p) => ({ ...p, [key]: { ok: true, text: "上传中..." } }));

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(
        `/api/wordlists/${wordList.id}/public-assets/${assetType}`,
        {
          method: "POST",
          body: formData,
        },
      );
      const data = await parseApiResponse(res);

      if (data.success) {
        setStatusMsg((p) => ({
          ...p,
          [key]: { ok: true, text: "替换成功，后续渲染将使用当前词本素材" },
        }));
        onRefresh();
      } else {
        setStatusMsg((p) => ({
          ...p,
          [key]: { ok: false, text: data.error || "替换失败" },
        }));
      }
    } catch (e: any) {
      setStatusMsg((p) => ({
        ...p,
        [key]: { ok: false, text: e.message || "替换失败" },
      }));
    } finally {
      setLoading((p) => ({ ...p, [key]: false }));
    }
  };

  const saveListConfigPatch = async (
    key: string,
    patch: {
      media?: Partial<NonNullable<NonNullable<WordList["config"]>["media"]>>;
      cover?: Partial<NonNullable<NonNullable<WordList["config"]>["cover"]>>;
    },
    successText: string,
  ) => {
    setLoading((p) => ({ ...p, [key]: true }));
    setStatusMsg((p) => ({ ...p, [key]: { ok: true, text: "保存中..." } }));

    try {
      const mergedConfig = {
        ...(wordList.config || {}),
        media: {
          ...(wordList.config?.media || {}),
          ...(patch.media || {}),
        },
        cover: {
          ...(wordList.config?.cover || {}),
          ...(patch.cover || {}),
        },
      };

      const res = await fetch(`/api/wordlists/${wordList.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: mergedConfig }),
      });
      const data = await parseApiResponse(res);

      if (data.success) {
        setStatusMsg((p) => ({ ...p, [key]: { ok: true, text: successText } }));
        onRefresh();
      } else {
        setStatusMsg((p) => ({
          ...p,
          [key]: { ok: false, text: data.error || "保存失败" },
        }));
      }
    } catch (e: any) {
      setStatusMsg((p) => ({
        ...p,
        [key]: { ok: false, text: e.message || "保存失败" },
      }));
    } finally {
      setLoading((p) => ({ ...p, [key]: false }));
    }
  };

  const rerenderFinalVideo = async (wordId: string) => {
    const key = `${wordId}-render`;
    setLoading((p) => ({ ...p, [key]: true }));
    setStatusMsg((p) => ({
      ...p,
      [key]: { ok: true, text: "提交渲染任务中..." },
    }));

    try {
      const submitRes = await fetch(`/api/render/${wordList.id}/${wordId}`, {
        method: "POST",
      });
      const submitData = await parseApiResponse(submitRes);
      if (!submitData.success || !submitData.data?.id) {
        setStatusMsg((p) => ({
          ...p,
          [key]: { ok: false, text: submitData.error || "提交渲染任务失败" },
        }));
        return;
      }

      const jobId = submitData.data.id as string;
      setStatusMsg((p) => ({
        ...p,
        [key]: { ok: true, text: `渲染任务已提交 (${jobId.slice(0, 8)}...)` },
      }));

      let completed = false;
      while (!completed) {
        await new Promise((r) => setTimeout(r, 5000));

        const pollRes = await fetch(`/api/render/jobs/${jobId}`);
        const pollData = await parseApiResponse(pollRes);
        if (!pollData.success || !pollData.data) {
          setStatusMsg((p) => ({
            ...p,
            [key]: { ok: false, text: pollData.error || "查询渲染进度失败" },
          }));
          return;
        }

        const job = pollData.data;
        if (job.status === "done") {
          completed = true;
          const version = new Date().toISOString();
          setRenderVideoVersion((p) => ({ ...p, [wordId]: version }));
          setStatusMsg((p) => ({
            ...p,
            [key]: { ok: true, text: "渲染完成" },
          }));
          onRefresh();
        } else if (job.status === "error") {
          setStatusMsg((p) => ({
            ...p,
            [key]: { ok: false, text: job.error || "渲染失败" },
          }));
          return;
        } else {
          const progress = Math.max(
            0,
            Math.min(100, Math.round((Number(job.progress) || 0) * 100)),
          );
          setStatusMsg((p) => ({
            ...p,
            [key]: { ok: true, text: `渲染中 ${progress}%` },
          }));
        }
      }
    } catch (e: any) {
      setStatusMsg((p) => ({
        ...p,
        [key]: { ok: false, text: e.message || "重新渲染失败" },
      }));
    } finally {
      setLoading((p) => ({ ...p, [key]: false }));
    }
  };

  const saveWordAssetsPatch = async (
    word: WordEntry,
    patch: Partial<WordAssets>,
    key: string,
    successText: string,
  ) => {
    setLoading((p) => ({ ...p, [key]: true }));
    setStatusMsg((p) => ({ ...p, [key]: { ok: true, text: "保存中..." } }));

    try {
      const res = await fetch(`/api/wordlists/${wordList.id}/words/${word.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assets: {
            ...word.assets,
            ...patch,
          },
        }),
      });
      const data = await parseApiResponse(res);
      if (data.success) {
        setStatusMsg((p) => ({ ...p, [key]: { ok: true, text: successText } }));
        onRefresh();
      } else {
        setStatusMsg((p) => ({ ...p, [key]: { ok: false, text: data.error || "保存失败" } }));
      }
    } catch (e: any) {
      setStatusMsg((p) => ({ ...p, [key]: { ok: false, text: e.message || "保存失败" } }));
    } finally {
      setLoading((p) => ({ ...p, [key]: false }));
    }
  };

  const RegenBtn: React.FC<{
    k: string;
    endpoint: string;
    body?: object;
    label: string;
    onSuccess?: (data: any) => void;
    successText?: string | ((data: any) => string);
  }> = ({ k, endpoint, body, label, onSuccess, successText }) => {
    const isLoading = loading[k];
    const msg = statusMsg[k];
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={() => regen(k, endpoint, body, onSuccess, successText)}
          disabled={isLoading}
          style={{ ...S.regenBtn, opacity: isLoading ? 0.5 : 1 }}
        >
          {isLoading ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={12} />}
          {label}
        </button>
        {msg && (
          <span style={{ fontSize: 11, color: msg.ok ? "#6B9E6B" : "#C05050" }}>{msg.text}</span>
        )}
      </div>
    );
  };

  const SpeedSelect: React.FC<{
    value: number;
    onChange: (speed: number) => void;
    disabled?: boolean;
  }> = ({ value, onChange, disabled }) => {
    const normalized = normalizeTtsSpeed(value);
    return (
      <select
        value={normalized.toFixed(2)}
        disabled={disabled}
        style={S.speedSelect}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {SPEED_OPTIONS.map((s) => (
          <option key={s} value={s.toFixed(2)}>
            {s.toFixed(2)}x
          </option>
        ))}
      </select>
    );
  };

  const AudioRow: React.FC<{
    label: string;
    path?: string;
    dur?: number;
    speed?: number;
    onSpeedChange?: (speed: number) => void;
    speedLoadingKey?: string;
    regenKey?: string;
    regenEndpoint?: string;
    version?: string;
  }> = ({ label, path, dur, speed, onSpeedChange, speedLoadingKey, regenKey, regenEndpoint, version }) => {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [localSpeed, setLocalSpeed] = useState<number>(
      normalizeTtsSpeed(speed),
    );

    useEffect(() => {
      setLocalSpeed(normalizeTtsSpeed(speed));
    }, [speed]);

    useEffect(() => {
      if (audioRef.current) {
        audioRef.current.playbackRate = normalizeTtsSpeed(localSpeed);
      }
    }, [localSpeed, path, version]);

    const effectiveSpeed = normalizeTtsSpeed(localSpeed);
    const renderDuration = dur != null ? dur / effectiveSpeed : undefined;
    const applyPlaybackRate = () => {
      if (audioRef.current) {
        audioRef.current.playbackRate = normalizeTtsSpeed(localSpeed);
      }
    };

    return (
      <div style={S.assetRow}>
        <Volume2 size={14} color="#B0AAA4" />
        <span style={S.assetLabel}>{label}</span>
        {path ? (
          <>
            <audio
              ref={audioRef}
              controls
              src={url(path, version)}
              style={S.audio}
              preload="none"
              onLoadedMetadata={applyPlaybackRate}
              onPlay={applyPlaybackRate}
            />
            {renderDuration != null && (
              <span style={S.durBadge}>渲染约 {renderDuration.toFixed(1)}s</span>
            )}
            {onSpeedChange && (
              <SpeedSelect
                value={localSpeed}
                onChange={(next) => {
                  const normalized = normalizeTtsSpeed(next);
                  setLocalSpeed(normalized);
                  onSpeedChange(normalized);
                }}
                disabled={speedLoadingKey ? !!loading[speedLoadingKey] : false}
              />
            )}
          </>
        ) : (
          <span style={S.missing}>未生成</span>
        )}
        {regenKey && regenEndpoint && <RegenBtn k={regenKey} endpoint={regenEndpoint} label="重新生成" />}
      </div>
    );
  };

  const renderEditor = (word: WordEntry) => {
    if (!draft || editingWordId !== word.id) return null;

    return (
      <div style={S.editorPanel}>
        <div style={S.moduleHeader}>
          <div style={S.subSectionTitle}>内容编辑</div>
          <RegenBtn
            k={`${word.id}-ai-full`}
            endpoint={`/api/generate/content-partial/${wordList.id}/${word.id}`}
            body={{ mode: "full" }}
            label="AI重生成整词内容"
            onSuccess={(data) => {
              if (data?.data) {
                setDraft(toDraft(data.data));
              }
            }}
          />
        </div>

        <div style={S.editorGrid2}>
          <div style={S.field}>
            <label style={S.label}>单词</label>
            <input value={draft.word} onChange={(e) => setDraftField("word", e.target.value)} style={S.input} />
          </div>
          <div style={S.field}>
            <label style={S.label}>音标</label>
            <input value={draft.phonetic} onChange={(e) => setDraftField("phonetic", e.target.value)} style={S.input} />
          </div>
        </div>

        <div style={S.editorGrid2}>
          <div style={S.field}>
            <label style={S.label}>中文释义</label>
            <input value={draft.chineseMeaning} onChange={(e) => setDraftField("chineseMeaning", e.target.value)} style={S.input} />
          </div>
          <div style={S.field}>
            <label style={S.label}>英文释义</label>
            <input value={draft.englishMeaning} onChange={(e) => setDraftField("englishMeaning", e.target.value)} style={S.input} />
          </div>
        </div>

        <div style={S.moduleHeader}>
          <div style={S.subSectionTitle}>句式与翻译</div>
          <RegenBtn
            k={`${word.id}-ai-patterns`}
            endpoint={`/api/generate/content-partial/${wordList.id}/${word.id}`}
            body={{ mode: "patterns" }}
            label="AI仅重生成句式"
            onSuccess={(data) => {
              if (data?.data) {
                setDraft(toDraft(data.data));
              }
            }}
          />
        </div>
        {draft.patterns.map((_, i) => (
          <div key={i} style={S.editorRow2}>
            <input
              value={draft.patterns[i] || ""}
              onChange={(e) => updatePattern(i, e.target.value)}
              placeholder={`句式 ${i + 1}`}
              style={S.input}
            />
            <input
              value={draft.patternTranslations[i] || ""}
              onChange={(e) => updatePatternTranslation(i, e.target.value)}
              placeholder={`句式 ${i + 1} 翻译`}
              style={S.input}
            />
            <button style={S.smallDangerBtn} onClick={() => removePatternRow(i)}>删除</button>
          </div>
        ))}
        <button style={S.smallBtn} onClick={addPatternRow}>+ 新增句式</button>

        <div style={S.moduleHeader}>
          <div style={S.subSectionTitle}>例句（中英）</div>
          <RegenBtn
            k={`${word.id}-ai-examples`}
            endpoint={`/api/generate/content-partial/${wordList.id}/${word.id}`}
            body={{ mode: "examples" }}
            label="AI仅重生成例句"
            onSuccess={(data) => {
              if (data?.data) {
                setDraft(toDraft(data.data));
              }
            }}
          />
        </div>
        {draft.examples.map((ex, i) => (
          <div key={i} style={S.exampleEditorCard}>
            <div style={S.exampleHead}>
              <span>例句 {i + 1}</span>
              <div style={{ display: "flex", gap: 8 }}>
                <RegenBtn
                  k={`${word.id}-ai-ex-${i}`}
                  endpoint={`/api/generate/content-partial/${wordList.id}/${word.id}`}
                  body={{ mode: "example_single", exampleIndex: i }}
                  label="AI重生成该例句"
                  onSuccess={(data) => {
                    if (data?.data) {
                      setDraft(toDraft(data.data));
                    }
                  }}
                />
                <button style={S.smallDangerBtn} onClick={() => removeExample(i)}>删除</button>
              </div>
            </div>
            <textarea
              value={ex.english}
              onChange={(e) => updateExample(i, "english", e.target.value)}
              placeholder="英文例句"
              style={S.textarea}
              rows={3}
            />
            <textarea
              value={ex.chinese}
              onChange={(e) => updateExample(i, "chinese", e.target.value)}
              placeholder="中文例句"
              style={S.textarea}
              rows={3}
            />
          </div>
        ))}
        <button style={S.smallBtn} onClick={addExample}>+ 新增例句</button>

        <div style={S.editorActionBar}>
          {statusMsg[`${word.id}-save`] && (
            <span style={{ fontSize: 12, color: statusMsg[`${word.id}-save`].ok ? "#6B9E6B" : "#C05050", marginRight: 8 }}>
              {statusMsg[`${word.id}-save`].text}
            </span>
          )}
          <button style={S.outlineBtn} onClick={cancelEdit}><X size={12} /> 取消编辑</button>
          <button style={S.primaryBtn} onClick={() => saveEdit(word.id)} disabled={loading[`${word.id}-save`]}>
            {loading[`${word.id}-save`] ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={12} />}
            保存内容
          </button>
        </div>
      </div>
    );
  };

  const renderWord = (word: WordEntry) => {
    const a = word.assets;
    const patternSpeeds = getPatternSpeeds(word);
    const unifiedSpeed =
      ttsGlobalSpeedDraft[word.id] != null
        ? normalizeTtsSpeed(ttsGlobalSpeedDraft[word.id])
        : pickUnifiedWordSpeed(word);
    const assetVersion = word.updatedAt || wordList.updatedAt || "";
    const outputVersion = renderVideoVersion[word.id] || assetVersion;
    const isOpen = expanded === word.id;
    const isEditing = editingWordId === word.id;
    const base = `/api/generate`;
    const st = statusMap[word.status] || statusMap.pending;

    return (
      <div key={word.id} style={S.wordCard}>
        <div style={S.wordHeader} onClick={() => setExpanded(isOpen ? null : word.id)}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <input
              type="checkbox"
              checked={selectedWordIds.includes(word.id)}
              onClick={(e) => e.stopPropagation()}
              onChange={() => toggleWordSelection(word.id)}
            />
            <span style={{ fontFamily: "'Noto Serif SC', serif", fontWeight: 700, fontSize: 16 }}>{word.word}</span>
            <span style={{ fontSize: 12, color: "#8A8580", fontFamily: "monospace" }}>{word.phonetic}</span>
            <span style={{ fontSize: 13, color: "#8A8580" }}>{word.chineseMeaning}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              style={{ ...S.deleteWordBtn, opacity: deletingWords ? 0.6 : 1 }}
              onClick={(e) => {
                e.stopPropagation();
                void deleteOneWord(word.id, word.word);
              }}
              disabled={deletingWords}
            >
              <Trash2 size={12} /> 删除
            </button>
            <button
              style={S.editBtn}
              onClick={(e) => {
                e.stopPropagation();
                if (isEditing) cancelEdit();
                else startEdit(word);
              }}
            >
              <Edit3 size={12} /> {isEditing ? "退出编辑" : "编辑内容"}
            </button>
            <span style={{ ...S.badge, backgroundColor: st.bg, color: st.color }}>{st.label}</span>
            {isOpen ? <ChevronUp size={16} color="#B0AAA4" /> : <ChevronDown size={16} color="#B0AAA4" />}
          </div>
        </div>

        {isOpen && (
          <div style={S.details}>
            {renderEditor(word)}

            {/* TTS */}
            <div style={S.assetSection}>
              <div style={S.assetSectionHeader}>
                <div style={S.assetSectionTitle}><Mic size={14} /> TTS 音频</div>
                <RegenBtn k={`${word.id}-tts`} endpoint={`${base}/tts/${wordList.id}/${word.id}`} label="全部重新生成" />
              </div>
              <div style={S.ttsSpeedPanel}>
                <span style={S.ttsHint}>渲染语速默认 1.25x，可统一或单独调整</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <SpeedSelect
                    value={unifiedSpeed}
                    onChange={(next) =>
                      setTtsGlobalSpeedDraft((p) => ({ ...p, [word.id]: next }))
                    }
                    disabled={!!loading[`${word.id}-speed-all`]}
                  />
                  <button
                    type="button"
                    style={{ ...S.materialActionBtn, padding: "6px 10px", fontSize: 12 }}
                    disabled={!!loading[`${word.id}-speed-all`]}
                    onClick={() => {
                      const next = normalizeTtsSpeed(unifiedSpeed);
                      const allPatternSpeeds = patternSpeeds.map(() => next);
                      saveWordAssetsPatch(
                        word,
                        {
                          chineseIntroTtsSpeed: next,
                          chineseWordTtsSpeed: next,
                          englishTtsSpeed: next,
                          patternTtsSpeeds: allPatternSpeeds,
                        },
                        `${word.id}-speed-all`,
                        "已统一更新本词 TTS 语速",
                      );
                    }}
                  >
                    统一应用
                  </button>
                  {statusMsg[`${word.id}-speed-all`] && (
                    <span
                      style={{
                        fontSize: 11,
                        color: statusMsg[`${word.id}-speed-all`].ok ? "#6B9E6B" : "#C05050",
                      }}
                    >
                      {statusMsg[`${word.id}-speed-all`].text}
                    </span>
                  )}
                </div>
              </div>

              <AudioRow
                label="开场白"
                path={a.chineseIntroTtsPath}
                dur={a.chineseIntroTtsDuration}
                speed={a.chineseIntroTtsSpeed}
                onSpeedChange={(next) =>
                  saveWordAssetsPatch(
                    word,
                    { chineseIntroTtsSpeed: next },
                    `${word.id}-speed-intro`,
                    "开场白语速已更新",
                  )
                }
                speedLoadingKey={`${word.id}-speed-intro`}
                version={assetVersion}
                regenKey={`${word.id}-intro`}
                regenEndpoint={`${base}/tts-single/${wordList.id}/${word.id}/chinese_intro`}
              />
              <AudioRow
                label="中文介绍"
                path={a.chineseWordTtsPath}
                dur={a.chineseWordTtsDuration}
                speed={a.chineseWordTtsSpeed}
                onSpeedChange={(next) =>
                  saveWordAssetsPatch(
                    word,
                    { chineseWordTtsSpeed: next },
                    `${word.id}-speed-cnw`,
                    "中文语速已更新",
                  )
                }
                speedLoadingKey={`${word.id}-speed-cnw`}
                version={assetVersion}
                regenKey={`${word.id}-cnw`}
                regenEndpoint={`${base}/tts-single/${wordList.id}/${word.id}/chinese_word`}
              />
              <AudioRow
                label="英文发音"
                path={a.englishTtsPath}
                dur={a.englishTtsDuration}
                speed={a.englishTtsSpeed}
                onSpeedChange={(next) =>
                  saveWordAssetsPatch(
                    word,
                    { englishTtsSpeed: next },
                    `${word.id}-speed-en`,
                    "英语语速已更新",
                  )
                }
                speedLoadingKey={`${word.id}-speed-en`}
                version={assetVersion}
                regenKey={`${word.id}-en`}
                regenEndpoint={`${base}/tts-single/${wordList.id}/${word.id}/english`}
              />
              {(word.patterns || []).map((pat, i) => (
                <div key={i}>
                  <AudioRow
                    label={`句式 ${i + 1}`}
                    path={a.patternTtsPaths?.[i]}
                    dur={a.patternTtsDurations?.[i]}
                    speed={patternSpeeds[i]}
                    onSpeedChange={(next) => {
                      const nextSpeeds = [...patternSpeeds];
                      nextSpeeds[i] = next;
                      saveWordAssetsPatch(
                        word,
                        { patternTtsSpeeds: nextSpeeds },
                        `${word.id}-speed-pat-${i}`,
                        `句式 ${i + 1} 语速已更新`,
                      );
                    }}
                    speedLoadingKey={`${word.id}-speed-pat-${i}`}
                    version={assetVersion}
                    regenKey={`${word.id}-pat${i}`}
                    regenEndpoint={`${base}/tts-single/${wordList.id}/${word.id}/pattern_${i}`}
                  />
                  <div style={{ fontSize: 12, color: "#8A8580", paddingLeft: 30, paddingBottom: 4 }}>
                    {pat}
                    {word.patternTranslations?.[i] && <span style={{ color: "#B0AAA4" }}> — {word.patternTranslations[i]}</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* 图片 */}
            <div style={S.assetSection}>
              <div style={S.assetSectionHeader}>
                <div style={S.assetSectionTitle}><ImageIcon size={14} /> 插图</div>
                <RegenBtn k={`${word.id}-img`} endpoint={`${base}/image/${wordList.id}/${word.id}`} label="重新搜索" />
              </div>
              {a.imagePath ? (
                <div style={S.mediaFrame}>
                  <img src={url(a.imagePath, assetVersion)} alt={word.word} style={S.imgPreview} />
                </div>
              ) : (
                <div style={S.emptyAsset}>暂无图片</div>
              )}
            </div>

            {/* 视频 */}
            <div style={S.assetSection}>
              <div style={S.assetSectionHeader}>
                <div style={S.assetSectionTitle}><Film size={14} /> AI 示例视频</div>
                <RegenBtn
                  k={`${word.id}-vid`}
                  endpoint={`${base}/video/${wordList.id}/${word.id}`}
                  body={{ confirmed: true, videoCount }}
                  label="全部重生成"
                  successText={(resp) => {
                    const meta = resp?.meta;
                    if (meta?.skippedScene3) {
                      return "已清空第三幕素材，后续渲染将直接跳过第三幕";
                    }
                    if (meta?.subtitleAutoRegenerated) {
                      return "视频已重生，字幕已自动同步";
                    }
                    if (meta?.subtitleAutoError) {
                      return `视频已重生，字幕自动同步失败：${meta.subtitleAutoError}`;
                    }
                    return "视频已重生";
                  }}
                />
              </div>
              {a.exampleVideoPaths?.length ? (
                <div style={S.videoGrid}>
                  {a.exampleVideoPaths.map((vp, i) => (
                    <div key={i} style={S.videoCard}>
                      <div style={S.mediaFrame}>
                        <video src={url(vp, assetVersion)} controls style={S.videoPlayer} preload="metadata" />
                      </div>
                      <div style={S.videoDur}>
                        视频 {i + 1}{a.exampleVideoDurations?.[i] != null && ` — ${a.exampleVideoDurations[i]}s`}
                      </div>
                      <div style={S.inlineBtns}>
                        <RegenBtn
                          k={`${word.id}-vid-${i}`}
                          endpoint={`${base}/video-single/${wordList.id}/${word.id}/${i}`}
                          body={{ confirmed: true }}
                          label="重生成该视频"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={S.emptyAsset}>暂无视频</div>
              )}
            </div>

            {/* 字幕 */}
            <div style={S.assetSection}>
              <div style={S.assetSectionHeader}>
                <div style={S.assetSectionTitle}><Captions size={14} /> 字幕</div>
                <RegenBtn k={`${word.id}-sub`} endpoint={`${base}/subtitles/${wordList.id}/${word.id}`} label="全部重生成" />
              </div>
              {a.subtitleData?.length ? (
                a.subtitleData.map((segs, vi) => (
                  <div key={vi} style={S.subGroup}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#8A8580" }}>视频 {vi + 1}</div>
                      <RegenBtn
                        k={`${word.id}-sub-${vi}`}
                        endpoint={`${base}/subtitle-single/${wordList.id}/${word.id}/${vi}`}
                        label="重生成该字幕"
                      />
                    </div>
                    {segs.map((seg, si) => (
                      <div key={si} style={S.subLine}>
                        <span style={S.subTime}>{seg.startTime.toFixed(1)}s–{seg.endTime.toFixed(1)}s</span>
                        <span style={{ flex: 1 }}>{seg.text}</span>
                        <span style={{ flex: 1, color: "#8A8580" }}>{seg.translation}</span>
                      </div>
                    ))}
                  </div>
                ))
              ) : (
                <div style={S.emptyAsset}>暂无字幕</div>
              )}
            </div>

            {/* 视频封面 */}
            <div style={S.assetSection}>
              <div style={S.assetSectionHeader}>
                <div style={S.assetSectionTitle}><ImageIcon size={14} /> 视频封面</div>
                <RegenBtn
                  k={`${word.id}-cover`}
                  endpoint={`/api/render/cover/${wordList.id}/${word.id}`}
                  label="重新生成封面"
                />
              </div>

              {(a.videoCover4x3Path || a.videoCover16x9Path) ? (
                <div style={S.coverGrid}>
                  <div style={S.coverCard}>
                    <div style={S.coverLabel}>4:3</div>
                    <div style={S.coverFrame43}>
                      {a.videoCover4x3Path ? (
                        <img src={url(a.videoCover4x3Path, assetVersion)} alt={`${word.word}-4:3-cover`} style={S.coverImg} />
                      ) : (
                        <div style={S.emptyAsset}>暂无封面</div>
                      )}
                    </div>
                  </div>
                  <div style={S.coverCard}>
                    <div style={S.coverLabel}>16:9</div>
                    <div style={S.coverFrame169}>
                      {a.videoCover16x9Path ? (
                        <img src={url(a.videoCover16x9Path, assetVersion)} alt={`${word.word}-16:9-cover`} style={S.coverImg} />
                      ) : (
                        <div style={S.emptyAsset}>暂无封面</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={S.emptyAsset}>暂无封面</div>
              )}
            </div>

            {/* 成片 */}
            {word.status === "rendered" && (
              <div style={S.assetSection}>
                <div style={S.assetSectionHeader}>
                  <div style={S.assetSectionTitle}><MonitorPlay size={14} /> 成片视频</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      onClick={() => rerenderFinalVideo(word.id)}
                      disabled={!!loading[`${word.id}-render`]}
                      style={{
                        ...S.regenBtn,
                        opacity: loading[`${word.id}-render`] ? 0.5 : 1,
                      }}
                    >
                      {loading[`${word.id}-render`] ? (
                        <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                      ) : (
                        <RefreshCw size={12} />
                      )}
                      重新渲染成片
                    </button>
                    {statusMsg[`${word.id}-render`] && (
                      <span
                        style={{
                          fontSize: 11,
                          color: statusMsg[`${word.id}-render`].ok ? "#6B9E6B" : "#C05050",
                        }}
                      >
                        {statusMsg[`${word.id}-render`].text}
                      </span>
                    )}
                  </div>
                </div>
                <div style={S.mediaFrame}>
                  <video src={`/output/${word.id}.mp4?v=${encodeURIComponent(outputVersion)}`} controls style={S.videoPlayer} preload="metadata" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const stats = useMemo(() => {
    const total = wordList.words.length;
    const counts = wordList.words.reduce(
      (a, w) => {
        if (w.assets.chineseWordTtsPath || w.assets.chineseTtsPath) a.tts++;
        if (w.assets.imagePath) a.img++;
        if (w.assets.exampleVideoPaths?.length) a.vid++;
        if (w.assets.subtitleData?.length) a.sub++;
        if (w.assets.videoCover4x3Path || w.assets.videoCover16x9Path) a.cover++;
        if (w.status === "rendered") a.done++;
        return a;
      },
      { tts: 0, img: 0, vid: 0, sub: 0, cover: 0, done: 0 },
    );
    return { total, counts };
  }, [wordList.words]);

  const publicAssetVersion = wordList.updatedAt || "";
  const listBgmPath = wordList.config?.media?.bgmPath || "audio/bgm.mp3";
  const listBackgroundVideoPath =
    wordList.config?.media?.backgroundVideoPath || "videos/background.mp4";
  const scene4OutroTtsPath =
    wordList.config?.media?.scene4OutroTtsPath ||
    `audio/${wordList.id}/scene4_outro.wav`;
  const coverBackgroundPath =
    wordList.config?.cover?.backgroundImagePath || "images/video-cover.png";

  return (
    <div>
      <div style={S.section}>
        <h2 style={{ ...S.sectionTitle, marginBottom: 16 }}>资源概览 — {wordList.name}</h2>
        <div style={S.statGrid}>
          {[
            { v: stats.counts.tts, l: "TTS 音频", icon: <Volume2 size={18} /> },
            { v: stats.counts.img, l: "插图", icon: <ImageIcon size={18} /> },
            { v: stats.counts.vid, l: "AI 视频", icon: <Film size={18} /> },
            { v: stats.counts.sub, l: "字幕", icon: <Captions size={18} /> },
            { v: stats.counts.cover, l: "视频封面", icon: <ImageIcon size={18} /> },
            { v: stats.counts.done, l: "已渲染", icon: <MonitorPlay size={18} /> },
          ].map((s) => (
            <div key={s.l} style={S.statCard}>
              <div style={{ color: "#B0AAA4", marginBottom: 8 }}>{s.icon}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#2D2A26" }}>{s.v}<span style={{ fontSize: 14, color: "#B0AAA4" }}>/{stats.total}</span></div>
              <div style={{ fontSize: 12, color: "#8A8580", marginTop: 4 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={S.section}>
        <h3 style={{ ...S.sectionTitle, marginBottom: 12 }}>公共素材</h3>
        <div style={S.publicMediaGrid}>
          <div style={S.materialCard}>
            <div style={S.materialHeader}>
              <div style={S.materialTitle}>
                <Music size={16} color="#C8956C" />
                <span style={{ fontWeight: 600, fontSize: 14 }}>BGM</span>
              </div>
              <button
                type="button"
                style={{
                  ...S.materialActionBtn,
                  opacity: loading["public-bgm-upload"] ? 0.6 : 1,
                }}
                disabled={!!loading["public-bgm-upload"]}
                onClick={() => bgmInputRef.current?.click()}
              >
                {loading["public-bgm-upload"] ? (
                  <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                ) : (
                  <RefreshCw size={12} />
                )}
                替换
              </button>
              <input
                ref={bgmInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  uploadPublicAsset("bgm", file);
                  e.currentTarget.value = "";
                }}
              />
            </div>
            <audio controls src={url(listBgmPath, publicAssetVersion)} style={{ width: "100%" }} preload="none" />
            <div style={S.materialMeta}>当前词本路径：{listBgmPath}</div>
            {statusMsg["public-bgm-upload"] && (
              <div
                style={{
                  ...S.materialMsg,
                  color: statusMsg["public-bgm-upload"].ok ? "#6B9E6B" : "#C05050",
                }}
              >
                {statusMsg["public-bgm-upload"].text}
              </div>
            )}
          </div>

          <div style={S.materialCard}>
            <div style={S.materialHeader}>
              <div style={S.materialTitle}>
                <MonitorPlay size={16} color="#C8956C" />
                <span style={{ fontWeight: 600, fontSize: 14 }}>背景视频</span>
              </div>
              <button
                type="button"
                style={{
                  ...S.materialActionBtn,
                  opacity: loading["public-background-upload"] ? 0.6 : 1,
                }}
                disabled={!!loading["public-background-upload"]}
                onClick={() => bgVideoInputRef.current?.click()}
              >
                {loading["public-background-upload"] ? (
                  <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                ) : (
                  <RefreshCw size={12} />
                )}
                替换
              </button>
              <input
                ref={bgVideoInputRef}
                type="file"
                accept="video/*,.mp4,.mov,.webm,.mkv"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  uploadPublicAsset("background", file);
                  e.currentTarget.value = "";
                }}
              />
            </div>
            <div style={S.mediaFrame}>
              <video src={url(listBackgroundVideoPath, publicAssetVersion)} controls muted style={S.videoPlayer} preload="metadata" />
            </div>
            <div style={S.materialMeta}>当前词本路径：{listBackgroundVideoPath}</div>
            {statusMsg["public-background-upload"] && (
              <div
                style={{
                  ...S.materialMsg,
                  color: statusMsg["public-background-upload"].ok ? "#6B9E6B" : "#C05050",
                }}
              >
                {statusMsg["public-background-upload"].text}
              </div>
            )}
          </div>

          <div style={S.materialCard}>
            <div style={S.materialHeader}>
              <div style={S.materialTitle}>
                <Volume2 size={16} color="#C8956C" />
                <span style={{ fontWeight: 600, fontSize: 14 }}>第四幕 TTS</span>
              </div>
              <div style={S.materialActionGroup}>
                <button
                  type="button"
                  style={{
                    ...S.materialActionBtn,
                    opacity: loading["public-scene4-tts-upload"] ? 0.6 : 1,
                  }}
                  disabled={!!loading["public-scene4-tts-upload"]}
                  onClick={() => scene4TtsInputRef.current?.click()}
                >
                  {loading["public-scene4-tts-upload"] ? (
                    <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                  ) : (
                    <RefreshCw size={12} />
                  )}
                  上传替换
                </button>
                <input
                  ref={scene4TtsInputRef}
                  type="file"
                  accept=".wav,audio/wav,audio/x-wav"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    uploadPublicAsset("scene4-tts", file);
                    e.currentTarget.value = "";
                  }}
                />
              </div>
            </div>
            <audio controls src={url(scene4OutroTtsPath, publicAssetVersion)} style={{ width: "100%" }} preload="none" />
            <div style={S.materialInlineRow}>
              <span style={{ fontSize: 12, color: "#8A8580" }}>渲染倍速</span>
              <select
                value={normalizeScene4OutroSpeed(scene4OutroSpeedDraft).toFixed(2)}
                style={S.speedSelect}
                onChange={(e) => setScene4OutroSpeedDraft(Number(e.target.value))}
                disabled={!!loading["public-scene4-tts-speed"]}
              >
                {SPEED_OPTIONS.map((s) => (
                  <option key={`scene4-speed-${s}`} value={s.toFixed(2)}>
                    {s.toFixed(2)}x
                  </option>
                ))}
              </select>
              <button
                type="button"
                style={{ ...S.materialActionBtn, padding: "6px 10px", fontSize: 12 }}
                disabled={!!loading["public-scene4-tts-speed"]}
                onClick={() => {
                  saveListConfigPatch(
                    "public-scene4-tts-speed",
                    { media: { scene4OutroTtsSpeed: normalizeScene4OutroSpeed(scene4OutroSpeedDraft) } },
                    "第四幕语速已更新",
                  );
                }}
              >
                保存倍速
              </button>
            </div>
            <div style={S.materialInlineRow}>
              <RegenBtn
                k="public-scene4-tts-regenerate"
                endpoint={`/api/generate/scene4-outro-tts/${wordList.id}`}
                body={{ speed: normalizeScene4OutroSpeed(scene4OutroSpeedDraft) }}
                label="重新生成"
                successText="第四幕 TTS 已重新生成"
              />
            </div>
            <div style={S.materialMeta}>当前词本路径：{scene4OutroTtsPath}</div>
            {statusMsg["public-scene4-tts-upload"] && (
              <div
                style={{
                  ...S.materialMsg,
                  color: statusMsg["public-scene4-tts-upload"].ok ? "#6B9E6B" : "#C05050",
                }}
              >
                {statusMsg["public-scene4-tts-upload"].text}
              </div>
            )}
            {statusMsg["public-scene4-tts-speed"] && (
              <div
                style={{
                  ...S.materialMsg,
                  color: statusMsg["public-scene4-tts-speed"].ok ? "#6B9E6B" : "#C05050",
                }}
              >
                {statusMsg["public-scene4-tts-speed"].text}
              </div>
            )}
          </div>

          <div style={S.materialCard}>
            <div style={S.materialHeader}>
              <div style={S.materialTitle}>
                <ImageIcon size={16} color="#C8956C" />
                <span style={{ fontWeight: 600, fontSize: 14 }}>封面背景图</span>
              </div>
              <button
                type="button"
                style={{
                  ...S.materialActionBtn,
                  opacity: loading["public-cover-background-upload"] ? 0.6 : 1,
                }}
                disabled={!!loading["public-cover-background-upload"]}
                onClick={() => coverBgInputRef.current?.click()}
              >
                {loading["public-cover-background-upload"] ? (
                  <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                ) : (
                  <RefreshCw size={12} />
                )}
                替换
              </button>
              <input
                ref={coverBgInputRef}
                type="file"
                accept="image/*,.jpg,.jpeg,.png,.webp,.bmp"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  uploadPublicAsset("cover-background", file);
                  e.currentTarget.value = "";
                }}
              />
            </div>
            <div style={S.mediaFrame}>
              <img src={url(coverBackgroundPath, publicAssetVersion)} alt="cover-background" style={S.coverImg} />
            </div>
            <div style={S.materialMeta}>当前词本路径：{coverBackgroundPath}</div>
            {statusMsg["public-cover-background-upload"] && (
              <div
                style={{
                  ...S.materialMsg,
                  color: statusMsg["public-cover-background-upload"].ok ? "#6B9E6B" : "#C05050",
                }}
              >
                {statusMsg["public-cover-background-upload"].text}
              </div>
            )}
          </div>

          <div style={S.materialCard}>
            <div style={S.materialHeader}>
              <div style={S.materialTitle}>
                <ImageIcon size={16} color="#C8956C" />
                <span style={{ fontWeight: 600, fontSize: 14 }}>封面高亮词（黄色字）</span>
              </div>
            </div>
            <div style={S.materialInlineRow}>
              <input
                value={coverHighlightDraft}
                onChange={(e) => setCoverHighlightDraft(e.target.value)}
                style={{ ...S.input, minWidth: 180, flex: 1 }}
                placeholder="例如：西海岸"
              />
              <button
                type="button"
                style={{ ...S.materialActionBtn, padding: "7px 12px", fontSize: 12 }}
                disabled={!!loading["public-cover-highlight"]}
                onClick={() => {
                  const nextText = coverHighlightDraft.trim() || "西海岸";
                  saveListConfigPatch(
                    "public-cover-highlight",
                    { cover: { titleHighlight: nextText } },
                    "封面高亮词已更新",
                  );
                }}
              >
                保存
              </button>
            </div>
            <div style={S.materialMeta}>该字段会作用于后续生成/重渲染产出的封面。</div>
            {statusMsg["public-cover-highlight"] && (
              <div
                style={{
                  ...S.materialMsg,
                  color: statusMsg["public-cover-highlight"].ok ? "#6B9E6B" : "#C05050",
                }}
              >
                {statusMsg["public-cover-highlight"].text}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={S.section}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
          <h3 style={{ ...S.sectionTitle, marginBottom: 0 }}>词条资源详情</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={S.videoCountBar}>
              <span style={{ fontSize: 12, color: "#8A8580" }}>第三幕 AI 视频数</span>
              {[0, 1, 2].map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setVideoCount(count)}
                  style={{
                    ...S.videoCountBtn,
                    ...(videoCount === count ? S.videoCountBtnActive : {}),
                  }}
                >
                  {count}
                </button>
              ))}
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#8A8580" }}>
              <input
                type="checkbox"
                checked={allWordsSelected}
                onChange={toggleSelectAllWords}
              />
              全选
            </label>
            <button
              type="button"
              style={{
                ...S.batchDeleteBtn,
                opacity: selectedWordCount === 0 || deletingWords ? 0.6 : 1,
                cursor: selectedWordCount === 0 || deletingWords ? "not-allowed" : "pointer",
              }}
              disabled={selectedWordCount === 0 || deletingWords}
              onClick={() => {
                void deleteSelectedWords();
              }}
            >
              <Trash2 size={12} />
              {deletingWords ? "删除中..." : `批量删除 (${selectedWordCount})`}
            </button>
          </div>
        </div>
        {statusMsg["words-delete"] && (
          <div
            style={{
              fontSize: 12,
              marginBottom: 10,
              color: statusMsg["words-delete"].ok ? "#6B9E6B" : "#C05050",
            }}
          >
            {statusMsg["words-delete"].text}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {wordList.words.map(renderWord)}
          {stats.total === 0 && <div style={S.emptyAsset}>暂无词条</div>}
        </div>
      </div>
    </div>
  );
};

const Mic: React.FC<{ size: number }> = ({ size }) => <Volume2 size={size} />;

const S: Record<string, React.CSSProperties> = {
  section: { backgroundColor: "#fff", borderRadius: 12, border: "1px solid #E8E3DD", padding: 24, marginBottom: 24 },
  sectionTitle: { fontSize: 20, fontWeight: 700, fontFamily: "'Noto Serif SC', Georgia, serif", color: "#2D2A26", margin: 0 },
  statGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 },
  statCard: { padding: 20, backgroundColor: "#FAFAF8", borderRadius: 10, border: "1px solid #E8E3DD", textAlign: "center" as const },
  publicMediaGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 },
  materialCard: { padding: 16, backgroundColor: "#FAFAF8", borderRadius: 10, border: "1px solid #E8E3DD" },
  materialHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10 },
  materialTitle: { display: "flex", alignItems: "center", gap: 8 },
  materialActionGroup: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" as const },
  materialInlineRow: { display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" as const },
  materialActionBtn: { display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", border: "1px solid #E0DBD4", borderRadius: 6, fontSize: 11, color: "#6B6560", backgroundColor: "#fff" },
  materialMeta: { marginTop: 8, fontSize: 11, color: "#8A8580", wordBreak: "break-all" as const },
  materialMsg: { marginTop: 6, fontSize: 11 },
  wordCard: { border: "1px solid #E8E3DD", borderRadius: 10, overflow: "hidden" },
  wordHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", cursor: "pointer", backgroundColor: "#FAFAF8" },
  videoCountBar: { display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", border: "1px solid #E8E3DD", borderRadius: 8, backgroundColor: "#FAFAF8" },
  videoCountBtn: { width: 26, height: 26, borderRadius: 6, border: "1px solid #E0DBD4", backgroundColor: "#fff", color: "#6B6560", fontSize: 12, fontWeight: 600 },
  videoCountBtnActive: { borderColor: "#C8956C", backgroundColor: "#FDF8F3", color: "#C8956C" },
  deleteWordBtn: { display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", fontSize: 11, border: "1px solid #E7C9C9", borderRadius: 6, backgroundColor: "#FFF5F5", color: "#B45B5B" },
  batchDeleteBtn: { display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", fontSize: 12, border: "1px solid #E7C9C9", borderRadius: 7, backgroundColor: "#FFF5F5", color: "#B45B5B" },
  editBtn: { display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", fontSize: 11, border: "1px solid #E0DBD4", borderRadius: 6, backgroundColor: "#fff", color: "#6B6560" },
  badge: { display: "inline-block", padding: "3px 12px", borderRadius: 12, fontSize: 12, fontWeight: 500 },
  details: { padding: "0 20px 20px", borderTop: "1px solid #E8E3DD", backgroundColor: "#fff" },
  editorPanel: { marginTop: 16, padding: 16, border: "1px solid #E8E3DD", borderRadius: 8, backgroundColor: "#FCFBF8" },
  editorGrid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  editorRow2: { display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "center", marginBottom: 8 },
  field: { marginBottom: 10 },
  label: { display: "block", fontSize: 12, color: "#8A8580", marginBottom: 4 },
  input: { width: "100%", padding: "8px 10px", border: "1px solid #E0DBD4", borderRadius: 6, fontSize: 13, backgroundColor: "#fff", boxSizing: "border-box" as const },
  textarea: { width: "100%", padding: "8px 10px", border: "1px solid #E0DBD4", borderRadius: 6, fontSize: 13, resize: "vertical" as const, lineHeight: 1.5, backgroundColor: "#fff", boxSizing: "border-box" as const },
  subSectionTitle: { marginTop: 8, marginBottom: 8, fontSize: 13, fontWeight: 600, color: "#5A534D" },
  moduleHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 8, marginBottom: 8 },
  exampleEditorCard: { border: "1px solid #E8E3DD", borderRadius: 8, padding: 10, marginBottom: 8, backgroundColor: "#fff" },
  exampleHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, fontSize: 12, color: "#8A8580", fontWeight: 600 },
  editorActionBar: { display: "flex", flexWrap: "wrap" as const, gap: 8, alignItems: "center", justifyContent: "flex-end", marginTop: 14 },
  smallBtn: { padding: "5px 10px", border: "1px solid #E0DBD4", borderRadius: 6, backgroundColor: "#fff", color: "#6B6560", fontSize: 12, marginBottom: 8 },
  smallDangerBtn: { padding: "5px 10px", border: "1px solid #F0D2D2", borderRadius: 6, backgroundColor: "#FFF5F5", color: "#C05050", fontSize: 12 },
  outlineBtn: { display: "flex", alignItems: "center", gap: 4, padding: "5px 12px", border: "1px solid #E0DBD4", borderRadius: 6, backgroundColor: "#fff", color: "#6B6560", fontSize: 12 },
  primaryBtn: { display: "flex", alignItems: "center", gap: 4, padding: "5px 12px", border: "1px solid #C8956C", borderRadius: 6, backgroundColor: "#C8956C", color: "#fff", fontSize: 12 },
  assetSection: { marginTop: 16, padding: 16, backgroundColor: "#FAFAF8", borderRadius: 8, border: "1px solid #E8E3DD" },
  assetSectionHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  assetSectionTitle: { display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600, color: "#2D2A26", margin: 0 },
  ttsSpeedPanel: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" as const, padding: "8px 10px", marginBottom: 8, borderRadius: 8, backgroundColor: "#F7F4F0", border: "1px solid #EEE8E1" },
  ttsHint: { fontSize: 12, color: "#8A8580" },
  speedSelect: { height: 30, padding: "0 8px", border: "1px solid #E0DBD4", borderRadius: 6, backgroundColor: "#fff", color: "#5A534D", fontSize: 12 },
  assetRow: { display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #F0EDE8", flexWrap: "wrap" as const },
  assetLabel: { fontSize: 13, color: "#8A8580", minWidth: 80, flexShrink: 0 },
  audio: { height: 32, flex: 1, minWidth: 180, maxWidth: 320 },
  durBadge: { fontSize: 11, color: "#8A8580", backgroundColor: "#F0EDE8", padding: "2px 8px", borderRadius: 8 },
  missing: { fontSize: 13, color: "#C4BFB8", fontStyle: "italic" as const },
  mediaFrame: { width: "100%", height: 240, borderRadius: 8, border: "1px solid #E8E3DD", backgroundColor: "#F5F2EE", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" },
  imgPreview: { width: "100%", height: "100%", objectFit: "contain" as const, display: "block" },
  videoGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 },
  videoCard: { backgroundColor: "#fff", borderRadius: 8, overflow: "hidden", border: "1px solid #E8E3DD" },
  videoPlayer: { width: "100%", height: "100%", objectFit: "contain" as const, display: "block" },
  videoDur: { padding: "8px 12px", fontSize: 12, color: "#8A8580" },
  inlineBtns: { display: "flex", padding: "0 12px 10px" },
  coverGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 },
  coverCard: { border: "1px solid #E8E3DD", borderRadius: 8, overflow: "hidden", backgroundColor: "#fff" },
  coverLabel: { padding: "8px 10px", fontSize: 12, color: "#8A8580", borderBottom: "1px solid #F0EDE8", fontWeight: 600 },
  coverFrame43: { width: "100%", aspectRatio: "4 / 3", backgroundColor: "#F5F2EE" },
  coverFrame169: { width: "100%", aspectRatio: "16 / 9", backgroundColor: "#F5F2EE" },
  coverImg: { width: "100%", height: "100%", objectFit: "cover" as const, display: "block" },
  subGroup: { backgroundColor: "#fff", borderRadius: 8, padding: 12, marginBottom: 8, border: "1px solid #E8E3DD" },
  subLine: { display: "flex", gap: 12, padding: "4px 0", borderBottom: "1px solid #F0EDE8", fontSize: 13 },
  subTime: { color: "#B0AAA4", fontFamily: "monospace", fontSize: 11, minWidth: 80, flexShrink: 0 },
  emptyAsset: { textAlign: "center" as const, padding: 30, color: "#C4BFB8", fontSize: 14 },
  regenBtn: { display: "flex", alignItems: "center", gap: 4, padding: "4px 12px", border: "1px solid #E0DBD4", borderRadius: 6, fontSize: 11, fontWeight: 500, color: "#6B6560", backgroundColor: "#fff", whiteSpace: "nowrap" as const },
};
