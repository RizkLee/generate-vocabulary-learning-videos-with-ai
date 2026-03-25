import React, { useState } from "react";
import type { WordList, WordEntry } from "../../types/index";

interface Props {
  wordLists: any[];
  selectedList: WordList | null;
  onSelectList: (id: string) => void;
  onRefresh: () => void;
}

export const WordListManager: React.FC<Props> = ({
  wordLists,
  selectedList,
  onSelectList,
  onRefresh,
}) => {
  const [newListName, setNewListName] = useState("");
  const [newListTheme, setNewListTheme] = useState("西海岸常用俚语");
  const [newWord, setNewWord] = useState("");
  const [aiCount, setAiCount] = useState(5);
  const [loading, setLoading] = useState(false);

  const createList = async () => {
    if (!newListName.trim()) return;
    await fetch("/api/wordlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newListName, theme: newListTheme }),
    });
    setNewListName("");
    onRefresh();
  };

  const addWord = async () => {
    if (!selectedList || !newWord.trim()) return;
    await fetch(`/api/wordlists/${selectedList.id}/words`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word: newWord }),
    });
    setNewWord("");
    onSelectList(selectedList.id);
  };

  const [aiError, setAiError] = useState("");

  const aiGenerateWords = async () => {
    if (!selectedList) return;
    setLoading(true);
    setAiError("");
    try {
      const res = await fetch("/api/generate/wordlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme: selectedList.theme || "西海岸常用俚语",
          count: aiCount,
        }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        let added = 0;
        for (const w of data.data) {
          const addRes = await fetch(`/api/wordlists/${selectedList.id}/words`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...w,
              patternTranslations: w.patternTranslations || [],
              status: "content_ready",
            }),
          });
          if ((await addRes.json()).success) added++;
        }
        onSelectList(selectedList.id);
        setAiError(`成功添加 ${added} 个单词`);
      } else {
        setAiError(`AI 生成失败: ${data.error || "未知错误"}`);
      }
    } catch (err: any) {
      setAiError(`请求失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const statusColors: Record<string, string> = {
    pending: "#666",
    content_ready: "#4A90D9",
    assets_ready: "#F5A623",
    rendered: "#27AE60",
  };

  const statusLabels: Record<string, string> = {
    pending: "待处理",
    content_ready: "内容就绪",
    assets_ready: "资源就绪",
    rendered: "已渲染",
  };

  return (
    <div>
      {/* 创建新单词本 */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>创建单词本</h3>
        <div style={styles.row}>
          <input
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            placeholder="单词本名称"
            style={styles.input}
          />
          <input
            value={newListTheme}
            onChange={(e) => setNewListTheme(e.target.value)}
            placeholder="主题"
            style={{ ...styles.input, flex: 2 }}
          />
          <button onClick={createList} style={styles.btn}>
            创建
          </button>
        </div>
      </div>

      {/* 单词本列表 */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>单词本列表</h3>
        <div style={styles.listGrid}>
          {wordLists.map((l) => (
            <div
              key={l.id}
              onClick={() => onSelectList(l.id)}
              style={{
                ...styles.listCard,
                ...(selectedList?.id === l.id ? styles.listCardActive : {}),
              }}
            >
              <div style={{ fontWeight: 600 }}>{l.name}</div>
              <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>
                {l.wordCount || 0} 个单词
              </div>
            </div>
          ))}
          {wordLists.length === 0 && (
            <div style={{ color: "#555", padding: 20 }}>
              暂无单词本，请先创建
            </div>
          )}
        </div>
      </div>

      {/* 选中的单词本详情 */}
      {selectedList && (
        <div style={styles.section}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h3 style={styles.sectionTitle}>
              {selectedList.name}
              <span style={{ fontSize: 14, color: "#888", marginLeft: 12 }}>
                {selectedList.words.length} 个单词
              </span>
            </h3>
            <div style={styles.row}>
              <input
                type="number"
                value={aiCount}
                onChange={(e) => setAiCount(Number(e.target.value))}
                min={1}
                max={20}
                style={{ ...styles.input, width: 60 }}
              />
              <button
                onClick={aiGenerateWords}
                disabled={loading}
                style={{
                  ...styles.btn,
                  backgroundColor: "#F5A623",
                  color: "#000",
                }}
              >
                {loading ? "生成中..." : "AI 生成单词"}
              </button>
            </div>
          </div>

          {/* AI 生成状态/错误 */}
          {loading && (
            <div style={{ padding: "12px 0", color: "#F5A623", fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-block", animation: "spin 1s linear infinite", fontSize: 16 }}>⏳</span>
              AI 正在生成 {aiCount} 个单词，请稍候...
            </div>
          )}
          {aiError && !loading && (
            <div style={{ padding: "8px 0", color: aiError.startsWith("成功") ? "#27AE60" : "#E74C3C", fontSize: 13 }}>
              {aiError}
            </div>
          )}

          {/* 添加单词 */}
          <div style={{ ...styles.row, marginTop: 16 }}>
            <input
              value={newWord}
              onChange={(e) => setNewWord(e.target.value)}
              placeholder="手动添加单词/短语"
              style={styles.input}
              onKeyDown={(e) => e.key === "Enter" && addWord()}
            />
            <button onClick={addWord} style={styles.btn}>
              添加
            </button>
          </div>

          {/* 单词表格 */}
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>#</th>
                <th style={styles.th}>单词</th>
                <th style={styles.th}>音标</th>
                <th style={styles.th}>中文释义</th>
                <th style={styles.th}>句式</th>
                <th style={styles.th}>例句</th>
                <th style={styles.th}>状态</th>
              </tr>
            </thead>
            <tbody>
              {selectedList.words.map((w, i) => (
                <tr key={w.id}>
                  <td style={styles.td}>{i + 1}</td>
                  <td style={{ ...styles.td, fontWeight: 700, fontSize: 16 }}>
                    {w.word}
                  </td>
                  <td style={{ ...styles.td, fontFamily: "monospace", color: "#888" }}>
                    {w.phonetic}
                  </td>
                  <td style={styles.td}>{w.chineseMeaning}</td>
                  <td style={styles.td}>{w.patterns?.length || 0}</td>
                  <td style={styles.td}>{w.examples?.length || 0}</td>
                  <td style={styles.td}>
                    <span
                      style={{
                        ...styles.badge,
                        backgroundColor: statusColors[w.status] || "#666",
                      }}
                    >
                      {statusLabels[w.status] || w.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  section: {
    marginBottom: 32,
    padding: 24,
    backgroundColor: "#111118",
    borderRadius: 12,
    border: "1px solid #1a1a2e",
  },
  sectionTitle: { margin: "0 0 16px", fontSize: 18, fontWeight: 600 },
  row: { display: "flex", gap: 8, alignItems: "center" },
  input: {
    flex: 1,
    padding: "10px 14px",
    backgroundColor: "#1a1a2e",
    border: "1px solid #2a2a3e",
    borderRadius: 8,
    color: "#e0e0e0",
    fontSize: 14,
    outline: "none",
  },
  btn: {
    padding: "10px 20px",
    backgroundColor: "#2a2a3e",
    border: "none",
    borderRadius: 8,
    color: "#e0e0e0",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 500,
    whiteSpace: "nowrap" as const,
  },
  listGrid: { display: "flex", gap: 12, flexWrap: "wrap" as const },
  listCard: {
    padding: "16px 20px",
    backgroundColor: "#1a1a2e",
    borderRadius: 10,
    cursor: "pointer",
    border: "2px solid transparent",
    minWidth: 160,
  },
  listCardActive: { borderColor: "#F5A623" },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    marginTop: 16,
  },
  th: {
    textAlign: "left" as const,
    padding: "10px 12px",
    borderBottom: "1px solid #2a2a3e",
    fontSize: 13,
    color: "#888",
    fontWeight: 500,
  },
  td: {
    padding: "10px 12px",
    borderBottom: "1px solid #1a1a2e",
    fontSize: 14,
  },
  badge: {
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: 12,
    fontSize: 12,
    color: "#fff",
    fontWeight: 500,
  },
};
