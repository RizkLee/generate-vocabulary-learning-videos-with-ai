import React, { useState } from "react";
import type { WordList, WordEntry } from "../../types/index";

interface Props {
  wordList: WordList;
  onRefresh: () => void;
}

/** 将相对资源路径转为可访问的 URL */
const assetUrl = (p?: string) => (p ? `/public/${p}` : undefined);

export const AssetManager: React.FC<Props> = ({ wordList, onRefresh }) => {
  const [regenerating, setRegenerating] = useState<Record<string, boolean>>({});
  const [expandedWord, setExpandedWord] = useState<string | null>(null);

  const callApi = async (endpoint: string, body?: object) => {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
  };

  const regenerate = async (key: string, endpoint: string, body?: object) => {
    setRegenerating((p) => ({ ...p, [key]: true }));
    try {
      const data = await callApi(endpoint, body);
      if (!data.success) alert(`失败: ${data.error}`);
      else onRefresh();
    } catch (err) {
      alert(`请求失败: ${err}`);
    } finally {
      setRegenerating((p) => ({ ...p, [key]: false }));
    }
  };

  const isLoading = (key: string) => !!regenerating[key];

  const RegenBtn: React.FC<{
    k: string;
    label: string;
    endpoint: string;
    body?: object;
  }> = ({ k, label, endpoint, body }) => (
    <button
      onClick={() => regenerate(k, endpoint, body)}
      disabled={isLoading(k)}
      style={{
        ...S.regenBtn,
        opacity: isLoading(k) ? 0.5 : 1,
      }}
    >
      {isLoading(k) ? "⏳ 生成中..." : label}
    </button>
  );

  const AudioRow: React.FC<{
    label: string;
    path?: string;
    duration?: number;
    regenKey?: string;
    regenEndpoint?: string;
  }> = ({ label, path, duration, regenKey, regenEndpoint }) => {
    const url = assetUrl(path);
    return (
      <div style={S.audioRow}>
        <span style={S.audioLabel}>{label}</span>
        {url ? (
          <>
            <audio controls src={url} style={S.audio} preload="none" />
            {duration != null && (
              <span style={S.badge}>{duration.toFixed(1)}s</span>
            )}
          </>
        ) : (
          <span style={S.missing}>未生成</span>
        )}
        {regenKey && regenEndpoint && (
          <RegenBtn k={regenKey} label="重新生成" endpoint={regenEndpoint} />
        )}
      </div>
    );
  };

  const renderWordCard = (word: WordEntry) => {
    const a = word.assets;
    const isExpanded = expandedWord === word.id;
    const base = `/api/generate`;

    return (
      <div key={word.id} style={S.card}>
        {/* 头部 */}
        <div
          style={S.cardHeader}
          onClick={() => setExpandedWord(isExpanded ? null : word.id)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: "#fff" }}>
              {word.word}
            </span>
            <span style={{ fontSize: 13, color: "#888", fontFamily: "monospace" }}>
              {word.phonetic}
            </span>
            <span style={{ fontSize: 13, color: "#aaa" }}>
              {word.chineseMeaning}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                ...S.statusBadge,
                backgroundColor: statusColors[word.status] || "#666",
              }}
            >
              {statusLabels[word.status] || word.status}
            </span>
            <span style={{ fontSize: 12, color: "#666" }}>
              {isExpanded ? "▼" : "▶"}
            </span>
          </div>
        </div>

        {/* 展开详情 */}
        {isExpanded && (
          <div style={S.details}>
            {/* TTS 音频 */}
            <div style={S.section}>
              <div style={S.sectionHeader}>
                <h4 style={S.sectionTitle}>TTS 音频</h4>
                <RegenBtn
                  k={`${word.id}-tts`}
                  label="全部重新生成"
                  endpoint={`${base}/tts/${wordList.id}/${word.id}`}
                />
              </div>
              <AudioRow
                label="开场白"
                path={a.chineseIntroTtsPath}
                duration={a.chineseIntroTtsDuration}
                regenKey={`${word.id}-tts-intro`}
                regenEndpoint={`${base}/tts-single/${wordList.id}/${word.id}/chinese_intro`}
              />
              <AudioRow
                label="中文单词介绍"
                path={a.chineseWordTtsPath}
                duration={a.chineseWordTtsDuration}
                regenKey={`${word.id}-tts-cnword`}
                regenEndpoint={`${base}/tts-single/${wordList.id}/${word.id}/chinese_word`}
              />
              <AudioRow
                label="英文发音"
                path={a.englishTtsPath}
                duration={a.englishTtsDuration}
                regenKey={`${word.id}-tts-en`}
                regenEndpoint={`${base}/tts-single/${wordList.id}/${word.id}/english`}
              />
              {(word.patterns || []).map((pat, i) => (
                <div key={i}>
                  <AudioRow
                    label={`句式 ${i + 1}`}
                    path={a.patternTtsPaths?.[i]}
                    duration={a.patternTtsDurations?.[i]}
                    regenKey={`${word.id}-tts-pat${i}`}
                    regenEndpoint={`${base}/tts-single/${wordList.id}/${word.id}/pattern_${i}`}
                  />
                  <div style={S.patternText}>
                    {pat}
                    {word.patternTranslations?.[i] && (
                      <span style={{ color: "#666" }}>
                        {" — "}
                        {word.patternTranslations[i]}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* 图片 */}
            <div style={S.section}>
              <div style={S.sectionHeader}>
                <h4 style={S.sectionTitle}>Pixabay 图片</h4>
                <RegenBtn
                  k={`${word.id}-img`}
                  label="重新搜索图片"
                  endpoint={`${base}/image/${wordList.id}/${word.id}`}
                />
              </div>
              {a.imagePath ? (
                <div style={{ textAlign: "center" as const }}>
                  <img
                    src={assetUrl(a.imagePath)}
                    alt={word.word}
                    style={{
                      maxWidth: "100%",
                      maxHeight: 300,
                      borderRadius: 8,
                      border: "1px solid #2a2a3e",
                    }}
                  />
                </div>
              ) : (
                <div style={S.empty}>暂无图片</div>
              )}
            </div>

            {/* 视频 */}
            <div style={S.section}>
              <div style={S.sectionHeader}>
                <h4 style={S.sectionTitle}>Veo 示例视频</h4>
                <RegenBtn
                  k={`${word.id}-vid`}
                  label="重新生成视频"
                  endpoint={`${base}/video/${wordList.id}/${word.id}`}
                  body={{ confirmed: true }}
                />
              </div>
              {a.exampleVideoPaths?.length ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {a.exampleVideoPaths.map((vp, i) => (
                    <div key={i} style={{ backgroundColor: "#0a0a0f", borderRadius: 8, overflow: "hidden" }}>
                      <video
                        src={assetUrl(vp)}
                        controls
                        style={{ width: "100%", display: "block" }}
                        preload="metadata"
                      />
                      <div style={{ padding: "8px 12px", fontSize: 12, color: "#888" }}>
                        视频 {i + 1}
                        {a.exampleVideoDurations?.[i] != null && ` — ${a.exampleVideoDurations[i]}s`}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={S.empty}>暂无视频</div>
              )}
            </div>

            {/* 字幕 */}
            <div style={S.section}>
              <div style={S.sectionHeader}>
                <h4 style={S.sectionTitle}>字幕数据</h4>
                <RegenBtn
                  k={`${word.id}-sub`}
                  label="重新生成字幕"
                  endpoint={`${base}/subtitles/${wordList.id}/${word.id}`}
                />
              </div>
              {a.subtitleData?.length ? (
                a.subtitleData.map((segs, vi) => (
                  <div key={vi} style={{ backgroundColor: "#0a0a0f", borderRadius: 8, padding: 12, marginBottom: 8 }}>
                    <div style={{ fontSize: 13, color: "#888", marginBottom: 8, fontWeight: 600 }}>
                      视频 {vi + 1} 字幕
                    </div>
                    {segs.map((seg, si) => (
                      <div key={si} style={{ display: "flex", gap: 12, padding: "4px 0", borderBottom: "1px solid #111", fontSize: 13 }}>
                        <span style={{ color: "#666", fontFamily: "monospace", fontSize: 11, minWidth: 90 }}>
                          {seg.startTime.toFixed(1)}s-{seg.endTime.toFixed(1)}s
                        </span>
                        <span style={{ color: "#e0e0e0", flex: 1 }}>{seg.text}</span>
                        <span style={{ color: "#888", flex: 1 }}>{seg.translation}</span>
                      </div>
                    ))}
                  </div>
                ))
              ) : (
                <div style={S.empty}>暂无字幕</div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // 统计
  const stats = wordList.words.reduce(
    (acc, w) => {
      if (w.assets.chineseWordTtsPath || w.assets.chineseTtsPath) acc.tts++;
      if (w.assets.imagePath) acc.image++;
      if (w.assets.exampleVideoPaths?.length) acc.video++;
      if (w.assets.subtitleData?.length) acc.sub++;
      return acc;
    },
    { tts: 0, image: 0, video: 0, sub: 0 },
  );
  const total = wordList.words.length;

  return (
    <div>
      {/* 概览 */}
      <div style={S.topSection}>
        <h3 style={S.topTitle}>
          资源概览 — {wordList.name}
          <span style={{ fontSize: 14, color: "#888", marginLeft: 12 }}>
            {total} 个单词
          </span>
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
          {[
            { v: stats.tts, l: "TTS 音频" },
            { v: stats.image, l: "图片" },
            { v: stats.video, l: "AI 视频" },
            { v: stats.sub, l: "字幕" },
          ].map((s) => (
            <div key={s.l} style={S.statCard}>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#F5A623" }}>
                {s.v}/{total}
              </div>
              <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>
                {s.l}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 公共素材 */}
      <div style={S.topSection}>
        <h3 style={S.topTitle}>公共素材</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={S.statCard}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#e0e0e0" }}>BGM</div>
            <audio controls src="/public/audio/bgm.mp3" style={{ width: "100%", marginTop: 8 }} preload="none" />
          </div>
          <div style={S.statCard}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#e0e0e0" }}>背景视频</div>
            <video src="/public/videos/background.mp4" controls muted style={{ width: "100%", marginTop: 8, borderRadius: 6 }} preload="metadata" />
          </div>
        </div>
      </div>

      {/* 单词卡片 */}
      <div style={S.topSection}>
        <h3 style={S.topTitle}>单词资源详情</h3>
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
          {wordList.words.map(renderWordCard)}
          {total === 0 && <div style={S.empty}>暂无单词</div>}
        </div>
      </div>
    </div>
  );
};

const statusColors: Record<string, string> = {
  pending: "#666", content_ready: "#4A90D9", assets_ready: "#F5A623", rendered: "#27AE60",
};
const statusLabels: Record<string, string> = {
  pending: "待处理", content_ready: "内容就绪", assets_ready: "资源就绪", rendered: "已渲染",
};

const S: Record<string, React.CSSProperties> = {
  topSection: { marginBottom: 24, padding: 24, backgroundColor: "#111118", borderRadius: 12, border: "1px solid #1a1a2e" },
  topTitle: { margin: "0 0 16px", fontSize: 18, fontWeight: 600 },
  statCard: { padding: 20, backgroundColor: "#1a1a2e", borderRadius: 10, textAlign: "center" as const },
  card: { backgroundColor: "#1a1a2e", borderRadius: 10, overflow: "hidden" },
  cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", cursor: "pointer", userSelect: "none" as const },
  statusBadge: { display: "inline-block", padding: "3px 10px", borderRadius: 12, fontSize: 12, color: "#fff", fontWeight: 500 },
  details: { padding: "0 20px 20px", borderTop: "1px solid #2a2a3e" },
  section: { marginTop: 16, padding: 16, backgroundColor: "#111118", borderRadius: 8 },
  sectionHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { margin: 0, fontSize: 15, fontWeight: 600, color: "#e0e0e0" },
  audioRow: { display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #1a1a2e", flexWrap: "wrap" as const },
  audioLabel: { fontSize: 13, color: "#888", minWidth: 100, flexShrink: 0 },
  audio: { height: 32, flex: 1, minWidth: 200, maxWidth: 350 },
  badge: { fontSize: 11, color: "#666", backgroundColor: "#0a0a0f", padding: "2px 8px", borderRadius: 10 },
  missing: { fontSize: 13, color: "#555", fontStyle: "italic" as const },
  patternText: { fontSize: 12, color: "#777", paddingLeft: 108, paddingBottom: 6 },
  empty: { textAlign: "center" as const, padding: 24, color: "#555", fontSize: 14 },
  regenBtn: { padding: "5px 12px", backgroundColor: "#2a2a3e", border: "1px solid #3a3a4e", borderRadius: 6, color: "#F5A623", cursor: "pointer", fontSize: 11, fontWeight: 500, whiteSpace: "nowrap" as const },
};
