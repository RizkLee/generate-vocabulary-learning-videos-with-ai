import React, { useState, useEffect } from "react";
import {
  BookOpen,
  Video,
  FolderOpen,
  Settings,
  Plus,
  DollarSign,
  ReceiptText,
} from "lucide-react";
import { WordListPage } from "./components/WordListPage";
import { GeneratePage } from "./components/GeneratePage";
import { AssetsPage } from "./components/AssetsPage";
import { SettingsPage } from "./components/SettingsPage";
import { BillingPage } from "./components/BillingPage";
import type { WordList, CostSummary } from "../types/index";

type Page = "wordlists" | "generate" | "assets" | "billing" | "settings";

export const App: React.FC = () => {
  const [page, setPage] = useState<Page>("wordlists");
  const [wordLists, setWordLists] = useState<WordList[]>([]);
  const [selectedList, setSelectedList] = useState<WordList | null>(null);
  const [costSummary, setCostSummary] = useState<CostSummary | null>(null);

  const fetchLists = async () => {
    const res = await fetch("/api/wordlists");
    const data = await res.json();
    if (data.success) setWordLists(data.data);
  };

  const fetchList = async (id: string) => {
    const res = await fetch(`/api/wordlists/${id}`);
    const data = await res.json();
    if (data.success) setSelectedList(data.data);
  };

  const fetchCost = async () => {
    try {
      const res = await fetch("/api/generate/cost");
      const data = await res.json();
      if (data.success) setCostSummary(data.data);
    } catch {}
  };

  useEffect(() => {
    fetchLists();
    fetchCost();
  }, []);

  const nav: { key: Page; label: string; icon: React.ReactNode }[] = [
    { key: "wordlists", label: "词库", icon: <BookOpen size={18} /> },
    { key: "generate", label: "生成视频", icon: <Video size={18} /> },
    { key: "assets", label: "素材", icon: <FolderOpen size={18} /> },
    { key: "billing", label: "Billing", icon: <ReceiptText size={18} /> },
    { key: "settings", label: "设置", icon: <Settings size={18} /> },
  ];

  const budgetStr = costSummary
    ? `$${costSummary.remaining.toFixed(2)}`
    : "...";

  return (
    <div style={S.root}>
      {/* Sidebar */}
      <aside style={S.sidebar}>
        <div style={S.logo}>
          <span style={S.logoAccent}>学习视频</span> 批量生成器
        </div>

        <button
          style={S.newProjectBtn}
          onClick={() => {
            setPage("wordlists");
          }}
        >
          <Plus size={16} />
          新建项目
        </button>

        <nav style={S.nav}>
          {nav.map((n) => (
            <button
              key={n.key}
              onClick={() => setPage(n.key)}
              style={{
                ...S.navItem,
                ...(page === n.key ? S.navItemActive : {}),
              }}
            >
              {n.icon}
              {n.label}
            </button>
          ))}
        </nav>

        <div style={S.sidebarFooter}>
          <div style={S.budgetChip}>
            <DollarSign size={14} />
            预算余额: {budgetStr}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main style={S.main}>
        {/* Top bar */}
        <header style={S.topBar}>
          <h1 style={S.pageTitle}>
            {nav.find((n) => n.key === page)?.label || ""}
          </h1>
          {selectedList && (
            <div style={S.breadcrumb}>
              当前词库: <strong>{selectedList.name}</strong> ({selectedList.words.length} 词)
            </div>
          )}
        </header>

        {/* Content */}
        <div style={S.content}>
          {page === "wordlists" && (
            <WordListPage
              wordLists={wordLists}
              selectedList={selectedList}
              onSelectList={(id) => { fetchList(id); }}
              onRefresh={() => { fetchLists(); if (selectedList) fetchList(selectedList.id); }}
              onGoGenerate={() => setPage("generate")}
            />
          )}
          {page === "generate" && selectedList && (
            <GeneratePage
              wordList={selectedList}
              onRefresh={() => { fetchList(selectedList.id); fetchCost(); }}
            />
          )}
          {page === "generate" && !selectedList && (
            <EmptyState
              message="请先在「词库」中选择一个词库"
              action={() => setPage("wordlists")}
              actionLabel="前往词库"
            />
          )}
          {page === "assets" && selectedList && (
            <AssetsPage
              wordList={selectedList}
              onRefresh={() => { fetchList(selectedList.id); fetchCost(); }}
            />
          )}
          {page === "assets" && !selectedList && (
            <EmptyState
              message="请先在「词库」中选择一个词库"
              action={() => setPage("wordlists")}
              actionLabel="前往词库"
            />
          )}
          {page === "settings" && (
            <SettingsPage selectedList={selectedList} />
          )}
          {page === "billing" && (
            <BillingPage onBudgetUpdated={fetchCost} />
          )}
        </div>
      </main>
    </div>
  );
};

const EmptyState: React.FC<{
  message: string;
  action?: () => void;
  actionLabel?: string;
}> = ({ message, action, actionLabel }) => (
  <div style={{ textAlign: "center", padding: "120px 40px", color: "#8A8580" }}>
    <BookOpen size={48} style={{ marginBottom: 16, opacity: 0.3 }} />
    <div style={{ fontSize: 16, marginBottom: 20 }}>{message}</div>
    {action && (
      <button onClick={action} style={S.primaryBtn}>
        {actionLabel}
      </button>
    )}
  </div>
);

const S: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    minHeight: "100vh",
  },
  sidebar: {
    width: 220,
    backgroundColor: "#FFFFFF",
    borderRight: "1px solid #E8E3DD",
    display: "flex",
    flexDirection: "column",
    padding: "24px 16px",
    flexShrink: 0,
    position: "sticky",
    top: 0,
    height: "100vh",
  },
  logo: {
    fontSize: 15,
    fontWeight: 700,
    fontFamily: "'Noto Serif SC', Georgia, serif",
    color: "#2D2A26",
    marginBottom: 24,
    paddingLeft: 8,
    lineHeight: 1.4,
  },
  logoAccent: {
    color: "#C8956C",
  },
  newProjectBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 16px",
    backgroundColor: "#C8956C",
    color: "#fff",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 24,
    width: "100%",
    justifyContent: "center",
  },
  nav: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    flex: 1,
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    color: "#6B6560",
    textAlign: "left",
    transition: "all 0.15s",
  },
  navItemActive: {
    backgroundColor: "#F7F4EF",
    color: "#2D2A26",
    fontWeight: 600,
  },
  sidebarFooter: {
    borderTop: "1px solid #E8E3DD",
    paddingTop: 16,
  },
  budgetChip: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    color: "#8A8580",
    padding: "8px 12px",
    backgroundColor: "#F7F4EF",
    borderRadius: 8,
  },
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "20px 40px",
    borderBottom: "1px solid #E8E3DD",
    backgroundColor: "#FFFFFF",
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: 700,
    fontFamily: "'Noto Serif SC', Georgia, serif",
    color: "#2D2A26",
  },
  breadcrumb: {
    fontSize: 13,
    color: "#8A8580",
  },
  content: {
    flex: 1,
    padding: "24px 40px 40px",
    overflowY: "auto",
  },
  primaryBtn: {
    padding: "10px 24px",
    backgroundColor: "#C8956C",
    color: "#fff",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
  },
};
