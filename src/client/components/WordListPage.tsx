import React, { useEffect, useState } from "react";
import { Plus, Sparkles, ChevronRight, Loader2, Trash2 } from "lucide-react";
import type { WordList } from "../../types/index";

interface Props {
  wordLists: any[];
  selectedList: WordList | null;
  onSelectList: (id: string) => void;
  onRefresh: () => void;
  onGoGenerate: () => void;
}

const statusMap: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "待处理", color: "#8A8580", bg: "#F0EDE8" },
  content_ready: { label: "内容就绪", color: "#5B7DB1", bg: "#EBF0F7" },
  assets_ready: { label: "资源就绪", color: "#C8956C", bg: "#FDF3EB" },
  rendered: { label: "已渲染", color: "#6B9E6B", bg: "#EDF5ED" },
};

export const WordListPage: React.FC<Props> = ({
  wordLists,
  selectedList,
  onSelectList,
  onRefresh,
  onGoGenerate,
}) => {
  const [newName, setNewName] = useState("");
  const [newTheme, setNewTheme] = useState("西海岸常用俚语");
  const [showCreate, setShowCreate] = useState(false);
  const [newWord, setNewWord] = useState("");
  const [aiCount, setAiCount] = useState(5);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMsg, setAiMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [selectedWordIds, setSelectedWordIds] = useState<string[]>([]);
  const [deletingWords, setDeletingWords] = useState(false);

  useEffect(() => {
    if (!selectedList) {
      setSelectedWordIds([]);
      return;
    }

    const currentIds = new Set(selectedList.words.map((w) => w.id));
    setSelectedWordIds((prev) => prev.filter((id) => currentIds.has(id)));
  }, [selectedList?.id, selectedList?.updatedAt]);

  const selectedWordCount = selectedList
    ? selectedList.words.filter((w) => selectedWordIds.includes(w.id)).length
    : 0;
  const allWordsSelected =
    !!selectedList &&
    selectedList.words.length > 0 &&
    selectedWordCount === selectedList.words.length;

  const createList = async () => {
    if (!newName.trim()) return;
    await fetch("/api/wordlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, theme: newTheme }),
    });
    setNewName("");
    setShowCreate(false);
    onRefresh();
  };

  const addWord = async () => {
    if (!selectedList || !newWord.trim()) return;
    const res = await fetch(`/api/wordlists/${selectedList.id}/words`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word: newWord }),
    });
    const data = await res.json();
    if (data.success) {
      setNewWord("");
      onSelectList(selectedList.id);
      setAiMsg({ ok: true, text: "已添加 1 个单词" });
    } else {
      setAiMsg({ ok: false, text: data.error || "添加失败" });
    }
  };

  const toggleWordSelection = (wordId: string) => {
    setSelectedWordIds((prev) =>
      prev.includes(wordId)
        ? prev.filter((id) => id !== wordId)
        : [...prev, wordId],
    );
  };

  const toggleSelectAllWords = () => {
    if (!selectedList) return;
    if (allWordsSelected) {
      setSelectedWordIds([]);
      return;
    }
    setSelectedWordIds(selectedList.words.map((w) => w.id));
  };

  const deleteOneWord = async (wordId: string) => {
    if (!selectedList || deletingWords) return;
    if (!window.confirm("确认删除这个单词吗？")) return;

    setDeletingWords(true);
    try {
      const res = await fetch(`/api/wordlists/${selectedList.id}/words/${wordId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setSelectedWordIds((prev) => prev.filter((id) => id !== wordId));
        onSelectList(selectedList.id);
        setAiMsg({ ok: true, text: "已删除 1 个单词" });
      } else {
        setAiMsg({ ok: false, text: data.error || "删除失败" });
      }
    } catch (e: any) {
      setAiMsg({ ok: false, text: e.message || "删除失败" });
    } finally {
      setDeletingWords(false);
    }
  };

  const deleteSelectedWords = async () => {
    if (!selectedList || selectedWordCount === 0 || deletingWords) return;
    if (!window.confirm(`确认批量删除 ${selectedWordCount} 个单词吗？`)) return;

    setDeletingWords(true);
    try {
      const res = await fetch(`/api/wordlists/${selectedList.id}/words/batch-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wordIds: selectedWordIds }),
      });
      const data = await res.json();
      if (data.success) {
        const deletedCount = data.data?.deletedCount || 0;
        setSelectedWordIds([]);
        onSelectList(selectedList.id);
        setAiMsg({ ok: true, text: `已批量删除 ${deletedCount} 个单词` });
      } else {
        setAiMsg({ ok: false, text: data.error || "批量删除失败" });
      }
    } catch (e: any) {
      setAiMsg({ ok: false, text: e.message || "批量删除失败" });
    } finally {
      setDeletingWords(false);
    }
  };

  const aiGenerate = async () => {
    if (!selectedList) return;
    setAiLoading(true);
    setAiMsg(null);
    try {
      const res = await fetch("/api/generate/wordlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme: selectedList.theme || "西海岸常用俚语",
          count: aiCount,
          listId: selectedList.id,
        }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        const wordsToAdd = data.data.map((w: any) => ({
          ...w,
          patternTranslations: w.patternTranslations || [],
          status: "content_ready",
        }));

        if (wordsToAdd.length === 0) {
          const removedDuplicateCount = data.meta?.removedDuplicateCount || 0;
          if (removedDuplicateCount > 0) {
            setAiMsg({ ok: true, text: `未新增词条：生成结果与已有词重复（过滤 ${removedDuplicateCount} 个）` });
          } else {
            setAiMsg({ ok: true, text: "未新增词条：AI 未返回可用结果" });
          }
          return;
        }

        const addRes = await fetch(`/api/wordlists/${selectedList.id}/words/batch-add`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ words: wordsToAdd }),
        });
        const addData = await addRes.json();

        if (addData.success) {
          const added = addData.data?.addedCount || 0;
          const skipped = addData.data?.skippedCount || 0;
          const removedDuplicateCount = data.meta?.removedDuplicateCount || 0;

          const msgParts = [`已添加 ${added} 个单词`];
          if (removedDuplicateCount > 0) {
            msgParts.push(`生成阶段过滤重复 ${removedDuplicateCount} 个`);
          }
          if (skipped > 0) {
            msgParts.push(`入库阶段跳过重复 ${skipped} 个`);
          }

          onSelectList(selectedList.id);
          setAiMsg({ ok: true, text: msgParts.join("，") });
        } else {
          setAiMsg({ ok: false, text: addData.error || "批量添加失败" });
        }
      } else {
        setAiMsg({ ok: false, text: data.error || "生成失败" });
      }
    } catch (e: any) {
      setAiMsg({ ok: false, text: e.message });
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div>
      {/* 词库列表 */}
      <div style={S.section}>
        <div style={S.sectionHeader}>
          <h2 style={S.sectionTitle}>词库管理</h2>
          <button style={S.outlineBtn} onClick={() => setShowCreate(!showCreate)}>
            <Plus size={14} /> 新建词库
          </button>
        </div>

        {showCreate && (
          <div style={S.createForm}>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="词库名称" style={S.input} />
            <input value={newTheme} onChange={(e) => setNewTheme(e.target.value)} placeholder="主题标签" style={{ ...S.input, flex: 2 }} />
            <button onClick={createList} style={S.primaryBtn}>创建</button>
          </div>
        )}

        {/* 词库卡片 */}
        {wordLists.length > 0 ? (
          <div style={S.listTable}>
            <div style={S.tableHeader}>
              <span style={{ flex: 3 }}>词库名称</span>
              <span style={{ flex: 2 }}>分类/标签</span>
              <span style={{ flex: 1, textAlign: "center" }}>词条数量</span>
              <span style={{ flex: 1, textAlign: "center" }}>当前状态</span>
              <span style={{ width: 40 }}></span>
            </div>
            {wordLists.map((l) => {
              const isActive = selectedList?.id === l.id;
              return (
                <div
                  key={l.id}
                  onClick={() => onSelectList(l.id)}
                  style={{
                    ...S.tableRow,
                    ...(isActive ? S.tableRowActive : {}),
                  }}
                >
                  <span style={{ flex: 3, fontWeight: 600, fontSize: 15 }}>{l.name}</span>
                  <span style={{ flex: 2 }}>
                    <span style={S.tagChip}>{l.theme || "未分类"}</span>
                  </span>
                  <span style={{ flex: 1, textAlign: "center", color: "#8A8580" }}>
                    {l.wordCount || l.words?.length || 0}
                  </span>
                  <span style={{ flex: 1, textAlign: "center" }}>
                    <span style={{
                      ...S.statusDot,
                      backgroundColor: "#6B9E6B",
                    }} />
                    内容就绪
                  </span>
                  <span style={{ width: 40, textAlign: "center" }}>
                    <ChevronRight size={16} color="#C4BFB8" />
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={S.empty}>暂无词库，点击「新建词库」开始</div>
        )}
      </div>

      {/* 选中词库的详情 */}
      {selectedList && (
        <div style={{ ...S.section, animation: "fadeIn 0.2s ease" }}>
          <div style={S.sectionHeader}>
            <div>
              <h2 style={S.sectionTitle}>{selectedList.name}</h2>
              <div style={{ fontSize: 13, color: "#8A8580", marginTop: 4 }}>
                {selectedList.words.length} 个词条 · {selectedList.theme}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button style={S.primaryBtn} onClick={onGoGenerate}>
                <ChevronRight size={14} /> 前往生成视频
              </button>
            </div>
          </div>

          {/* AI 生成 + 手动添加 */}
          <div style={S.actionBar}>
            <div style={S.actionGroup}>
              <Sparkles size={16} color="#C8956C" />
              <span style={{ fontSize: 13, color: "#8A8580" }}>AI 批量生成</span>
              <input
                type="number" value={aiCount} min={1} max={20}
                onChange={(e) => setAiCount(Number(e.target.value))}
                style={{ ...S.inputSmall, width: 56 }}
              />
              <span style={{ fontSize: 12, color: "#B0AAA4" }}>个</span>
              <button onClick={aiGenerate} disabled={aiLoading} style={S.accentBtn}>
                {aiLoading ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> 生成中...</> : "生成"}
              </button>
            </div>
            <div style={S.actionGroup}>
              <button
                onClick={deleteSelectedWords}
                disabled={selectedWordCount === 0 || deletingWords}
                style={{
                  ...S.dangerOutlineBtn,
                  opacity: selectedWordCount === 0 || deletingWords ? 0.5 : 1,
                  cursor: selectedWordCount === 0 || deletingWords ? "not-allowed" : "pointer",
                }}
              >
                <Trash2 size={14} />
                {deletingWords ? "删除中..." : `批量删除 (${selectedWordCount})`}
              </button>
              <input
                value={newWord}
                onChange={(e) => setNewWord(e.target.value)}
                placeholder="手动添加单词/短语..."
                style={{ ...S.input, minWidth: 200 }}
                onKeyDown={(e) => e.key === "Enter" && addWord()}
              />
              <button onClick={addWord} style={S.outlineBtn}>添加</button>
            </div>
          </div>

          {/* AI 消息 */}
          {aiLoading && (
            <div style={S.statusMsg}>
              <Loader2 size={16} style={{ animation: "spin 1s linear infinite", color: "#C8956C" }} />
              AI 正在生成 {aiCount} 个单词，请稍候...
            </div>
          )}
          {aiMsg && !aiLoading && (
            <div style={{ ...S.statusMsg, color: aiMsg.ok ? "#6B9E6B" : "#C05050" }}>
              {aiMsg.text}
            </div>
          )}

          {/* 单词表 */}
          <table style={S.wordTable}>
            <thead>
              <tr>
                <th style={{ ...S.th, textAlign: "center", width: 44 }}>
                  <input
                    type="checkbox"
                    checked={allWordsSelected}
                    onChange={toggleSelectAllWords}
                  />
                </th>
                <th style={S.th}>#</th>
                <th style={S.th}>单词</th>
                <th style={S.th}>音标</th>
                <th style={S.th}>中文释义</th>
                <th style={{ ...S.th, textAlign: "center" }}>句式</th>
                <th style={{ ...S.th, textAlign: "center" }}>例句</th>
                <th style={{ ...S.th, textAlign: "center" }}>状态</th>
                <th style={{ ...S.th, textAlign: "center", width: 96 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {selectedList.words.map((w, i) => {
                const st = statusMap[w.status] || statusMap.pending;
                return (
                  <tr key={w.id}>
                    <td style={{ ...S.td, textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={selectedWordIds.includes(w.id)}
                        onChange={() => toggleWordSelection(w.id)}
                      />
                    </td>
                    <td style={S.td}>{i + 1}</td>
                    <td style={{ ...S.td, fontFamily: "'Noto Serif SC', Georgia, serif", fontWeight: 700, fontSize: 16 }}>
                      {w.word}
                    </td>
                    <td style={{ ...S.td, fontFamily: "monospace", color: "#8A8580", fontSize: 13 }}>
                      {w.phonetic}
                    </td>
                    <td style={S.td}>{w.chineseMeaning}</td>
                    <td style={{ ...S.td, textAlign: "center", color: "#8A8580" }}>
                      {w.patterns?.length || 0}
                    </td>
                    <td style={{ ...S.td, textAlign: "center", color: "#8A8580" }}>
                      {w.examples?.length || 0}
                    </td>
                    <td style={{ ...S.td, textAlign: "center" }}>
                      <span style={{ ...S.badge, backgroundColor: st.bg, color: st.color }}>
                        {st.label}
                      </span>
                    </td>
                    <td style={{ ...S.td, textAlign: "center" }}>
                      <button
                        onClick={() => deleteOneWord(w.id)}
                        disabled={deletingWords}
                        style={{
                          ...S.dangerOutlineBtn,
                          padding: "4px 10px",
                          fontSize: 12,
                          opacity: deletingWords ? 0.6 : 1,
                        }}
                      >
                        <Trash2 size={12} /> 删除
                      </button>
                    </td>
                  </tr>
                );
              })}
              {selectedList.words.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ ...S.td, textAlign: "center", color: "#B0AAA4", padding: 40 }}>
                    暂无词条
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const S: Record<string, React.CSSProperties> = {
  section: { backgroundColor: "#fff", borderRadius: 12, border: "1px solid #E8E3DD", padding: 24, marginBottom: 24 },
  sectionHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  sectionTitle: { fontSize: 20, fontWeight: 700, fontFamily: "'Noto Serif SC', Georgia, serif", color: "#2D2A26", margin: 0 },
  createForm: { display: "flex", gap: 8, marginBottom: 20, animation: "fadeIn 0.2s ease" },
  input: { flex: 1, padding: "9px 14px", border: "1px solid #E0DBD4", borderRadius: 8, fontSize: 14, color: "#2D2A26", outline: "none", background: "#FAFAF8" },
  inputSmall: { padding: "6px 10px", border: "1px solid #E0DBD4", borderRadius: 6, fontSize: 13, color: "#2D2A26", outline: "none", background: "#FAFAF8", textAlign: "center" as const },
  primaryBtn: { display: "flex", alignItems: "center", gap: 6, padding: "9px 20px", backgroundColor: "#C8956C", color: "#fff", borderRadius: 8, fontSize: 14, fontWeight: 600, whiteSpace: "nowrap" as const },
  outlineBtn: { display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", border: "1px solid #E0DBD4", borderRadius: 8, fontSize: 13, fontWeight: 500, color: "#6B6560", background: "#fff", whiteSpace: "nowrap" as const },
  dangerOutlineBtn: { display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", border: "1px solid #E7C9C9", borderRadius: 8, fontSize: 13, fontWeight: 500, color: "#B45B5B", background: "#fff", whiteSpace: "nowrap" as const },
  accentBtn: { display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", backgroundColor: "#F5EDE4", color: "#C8956C", borderRadius: 8, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" as const },
  listTable: { border: "1px solid #E8E3DD", borderRadius: 10, overflow: "hidden" },
  tableHeader: { display: "flex", padding: "10px 20px", fontSize: 12, fontWeight: 500, color: "#A09A94", borderBottom: "1px solid #E8E3DD", backgroundColor: "#FAFAF8", textTransform: "uppercase" as const, letterSpacing: 0.5 },
  tableRow: { display: "flex", alignItems: "center", padding: "14px 20px", borderBottom: "1px solid #F0EDE8", cursor: "pointer", transition: "background 0.1s" },
  tableRowActive: { backgroundColor: "#FDF8F3", borderLeft: "3px solid #C8956C" },
  tagChip: { display: "inline-block", padding: "3px 10px", backgroundColor: "#F0EDE8", borderRadius: 12, fontSize: 11, fontWeight: 500, color: "#8A8580", textTransform: "uppercase" as const, letterSpacing: 0.3 },
  statusDot: { display: "inline-block", width: 8, height: 8, borderRadius: 4, marginRight: 6, verticalAlign: "middle" },
  empty: { textAlign: "center" as const, padding: "60px 20px", color: "#B0AAA4", fontSize: 15 },
  actionBar: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 16, padding: "12px 16px", backgroundColor: "#FAFAF8", borderRadius: 10, border: "1px solid #E8E3DD", flexWrap: "wrap" as const },
  actionGroup: { display: "flex", alignItems: "center", gap: 8 },
  statusMsg: { padding: "10px 16px", fontSize: 13, color: "#C8956C", display: "flex", alignItems: "center", gap: 8, marginBottom: 12 },
  wordTable: { width: "100%", borderCollapse: "collapse" as const },
  th: { textAlign: "left" as const, padding: "10px 14px", borderBottom: "1px solid #E8E3DD", fontSize: 12, color: "#A09A94", fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: 0.3 },
  td: { padding: "12px 14px", borderBottom: "1px solid #F0EDE8", fontSize: 14 },
  badge: { display: "inline-block", padding: "3px 12px", borderRadius: 12, fontSize: 12, fontWeight: 500 },
};
