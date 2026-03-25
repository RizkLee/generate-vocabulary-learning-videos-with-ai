import React, { useMemo, useState } from "react";
import {
  ChevronDown, ChevronUp, Loader2, RefreshCw,
  Volume2, ImageIcon, Film, Captions, Music, MonitorPlay, Edit3, Save, X,
} from "lucide-react";
import type { WordList, WordEntry } from "../../types/index";

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

  const regen = async (
    key: string,
    endpoint: string,
    body?: object,
    onSuccess?: (data: any) => void,
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
        setStatusMsg((p) => ({ ...p, [key]: { ok: true, text: "生成完成" } }));
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

  const RegenBtn: React.FC<{ k: string; endpoint: string; body?: object; label: string; onSuccess?: (data: any) => void }> = ({ k, endpoint, body, label, onSuccess }) => {
    const isLoading = loading[k];
    const msg = statusMsg[k];
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={() => regen(k, endpoint, body, onSuccess)}
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

  const AudioRow: React.FC<{ label: string; path?: string; dur?: number; regenKey?: string; regenEndpoint?: string; version?: string }> = ({ label, path, dur, regenKey, regenEndpoint, version }) => (
    <div style={S.assetRow}>
      <Volume2 size={14} color="#B0AAA4" />
      <span style={S.assetLabel}>{label}</span>
      {path ? (
        <>
          <audio controls src={url(path, version)} style={S.audio} preload="none" />
          {dur != null && <span style={S.durBadge}>{dur.toFixed(1)}s</span>}
        </>
      ) : (
        <span style={S.missing}>未生成</span>
      )}
      {regenKey && regenEndpoint && <RegenBtn k={regenKey} endpoint={regenEndpoint} label="重新生成" />}
    </div>
  );

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
    const assetVersion = word.updatedAt || wordList.updatedAt || "";
    const isOpen = expanded === word.id;
    const isEditing = editingWordId === word.id;
    const base = `/api/generate`;
    const st = statusMap[word.status] || statusMap.pending;

    return (
      <div key={word.id} style={S.wordCard}>
        <div style={S.wordHeader} onClick={() => setExpanded(isOpen ? null : word.id)}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontFamily: "'Noto Serif SC', serif", fontWeight: 700, fontSize: 16 }}>{word.word}</span>
            <span style={{ fontSize: 12, color: "#8A8580", fontFamily: "monospace" }}>{word.phonetic}</span>
            <span style={{ fontSize: 13, color: "#8A8580" }}>{word.chineseMeaning}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
              <AudioRow label="开场白" path={a.chineseIntroTtsPath} dur={a.chineseIntroTtsDuration} version={assetVersion}
                regenKey={`${word.id}-intro`} regenEndpoint={`${base}/tts-single/${wordList.id}/${word.id}/chinese_intro`} />
              <AudioRow label="中文介绍" path={a.chineseWordTtsPath} dur={a.chineseWordTtsDuration} version={assetVersion}
                regenKey={`${word.id}-cnw`} regenEndpoint={`${base}/tts-single/${wordList.id}/${word.id}/chinese_word`} />
              <AudioRow label="英文发音" path={a.englishTtsPath} dur={a.englishTtsDuration} version={assetVersion}
                regenKey={`${word.id}-en`} regenEndpoint={`${base}/tts-single/${wordList.id}/${word.id}/english`} />
              {(word.patterns || []).map((pat, i) => (
                <div key={i}>
                  <AudioRow label={`句式 ${i + 1}`} path={a.patternTtsPaths?.[i]} dur={a.patternTtsDurations?.[i]} version={assetVersion}
                    regenKey={`${word.id}-pat${i}`} regenEndpoint={`${base}/tts-single/${wordList.id}/${word.id}/pattern_${i}`} />
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
                <RegenBtn k={`${word.id}-vid`} endpoint={`${base}/video/${wordList.id}/${word.id}`} body={{ confirmed: true }} label="全部重生成" />
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

            {/* 成片 */}
            {word.status === "rendered" && (
              <div style={S.assetSection}>
                <div style={S.assetSectionTitle}><MonitorPlay size={14} /> 成片视频</div>
                <div style={S.mediaFrame}>
                  <video src={`/output/${word.id}.mp4?v=${encodeURIComponent(assetVersion)}`} controls style={S.videoPlayer} preload="metadata" />
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
        if (w.status === "rendered") a.done++;
        return a;
      },
      { tts: 0, img: 0, vid: 0, sub: 0, done: 0 },
    );
    return { total, counts };
  }, [wordList.words]);

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
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}><Music size={16} color="#C8956C" /> <span style={{ fontWeight: 600, fontSize: 14 }}>BGM</span></div>
            <audio controls src="/public/audio/bgm.mp3" style={{ width: "100%" }} preload="none" />
          </div>
          <div style={S.materialCard}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}><MonitorPlay size={16} color="#C8956C" /> <span style={{ fontWeight: 600, fontSize: 14 }}>背景视频</span></div>
            <div style={S.mediaFrame}>
              <video src="/public/videos/background.mp4" controls muted style={S.videoPlayer} preload="metadata" />
            </div>
          </div>
        </div>
      </div>

      <div style={S.section}>
        <h3 style={{ ...S.sectionTitle, marginBottom: 12 }}>词条资源详情</h3>
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
  statGrid: { display: "grid", gridTemplateColumns: "repeat(5, minmax(120px, 1fr))", gap: 12 },
  statCard: { padding: 20, backgroundColor: "#FAFAF8", borderRadius: 10, border: "1px solid #E8E3DD", textAlign: "center" as const },
  publicMediaGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 },
  materialCard: { padding: 16, backgroundColor: "#FAFAF8", borderRadius: 10, border: "1px solid #E8E3DD" },
  wordCard: { border: "1px solid #E8E3DD", borderRadius: 10, overflow: "hidden" },
  wordHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", cursor: "pointer", backgroundColor: "#FAFAF8" },
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
  subGroup: { backgroundColor: "#fff", borderRadius: 8, padding: 12, marginBottom: 8, border: "1px solid #E8E3DD" },
  subLine: { display: "flex", gap: 12, padding: "4px 0", borderBottom: "1px solid #F0EDE8", fontSize: 13 },
  subTime: { color: "#B0AAA4", fontFamily: "monospace", fontSize: 11, minWidth: 80, flexShrink: 0 },
  emptyAsset: { textAlign: "center" as const, padding: 30, color: "#C4BFB8", fontSize: 14 },
  regenBtn: { display: "flex", alignItems: "center", gap: 4, padding: "4px 12px", border: "1px solid #E0DBD4", borderRadius: 6, fontSize: 11, fontWeight: 500, color: "#6B6560", backgroundColor: "#fff", whiteSpace: "nowrap" as const },
};
