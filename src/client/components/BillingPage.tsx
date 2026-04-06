import React, { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Save, Wallet, ReceiptText } from "lucide-react";
import type { CostSummary } from "../../types/index";

interface Props {
  onBudgetUpdated?: () => void;
}

export const BillingPage: React.FC<Props> = ({ onBudgetUpdated }) => {
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingBudget, setSavingBudget] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadSummary = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/generate/cost");
      const data = await res.json();
      if (data.success) {
        setSummary(data.data);
        setBudgetDraft(String(data.data.budget ?? ""));
      } else {
        setMsg({ ok: false, text: data.error || "读取费用失败" });
      }
    } catch (e: any) {
      setMsg({ ok: false, text: e.message || "读取费用失败" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSummary();
  }, []);

  const saveBudget = async () => {
    const nextBudget = Number(budgetDraft);
    if (!Number.isFinite(nextBudget) || nextBudget < 0) {
      setMsg({ ok: false, text: "预算必须是大于等于 0 的数字" });
      return;
    }

    setSavingBudget(true);
    setMsg(null);
    try {
      const res = await fetch("/api/config/budget", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ budget: nextBudget }),
      });
      const data = await res.json();
      if (!data.success) {
        setMsg({ ok: false, text: data.error || "预算保存失败" });
        return;
      }

      await loadSummary();
      onBudgetUpdated?.();
      setMsg({ ok: true, text: "预算已更新" });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message || "预算保存失败" });
    } finally {
      setSavingBudget(false);
    }
  };

  const sortedEntries = useMemo(() => {
    if (!summary) return [];
    return [...summary.entries].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [summary]);

  const serviceStats = useMemo(() => {
    const acc: Record<string, { cost: number; count: number }> = {};
    for (const entry of sortedEntries) {
      const current = acc[entry.service] || { cost: 0, count: 0 };
      current.cost += entry.cost;
      current.count += 1;
      acc[entry.service] = current;
    }
    return Object.entries(acc)
      .map(([service, data]) => ({ service, ...data }))
      .sort((a, b) => b.cost - a.cost);
  }, [sortedEntries]);

  const operationStats = useMemo(() => {
    const acc: Record<string, { cost: number; count: number }> = {};
    for (const entry of sortedEntries) {
      const key = `${entry.service} / ${entry.operation}`;
      const current = acc[key] || { cost: 0, count: 0 };
      current.cost += entry.cost;
      current.count += 1;
      acc[key] = current;
    }
    return Object.entries(acc)
      .map(([operation, data]) => ({ operation, ...data }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10);
  }, [sortedEntries]);

  const usedPercent = summary?.budget
    ? Math.min(100, (summary.total / summary.budget) * 100)
    : 0;

  return (
    <div>
      {msg && (
        <div
          style={{
            ...S.msg,
            color: msg.ok ? "#2E7D32" : "#B23A3A",
            backgroundColor: msg.ok ? "#F0F8F0" : "#FFF4F4",
            borderColor: msg.ok ? "#CBE5CB" : "#F2D0D0",
          }}
        >
          {msg.text}
        </div>
      )}

      <div style={S.section}>
        <div style={S.sectionHeader}>
          <h2 style={S.sectionTitle}>Billing</h2>
          <button type="button" onClick={() => void loadSummary()} style={S.outlineBtn}>
            <RefreshCw size={14} /> 刷新
          </button>
        </div>

        {loading || !summary ? (
          <div style={S.loadingRow}>
            <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
            正在加载费用数据...
          </div>
        ) : (
          <>
            <div style={S.kpiGrid}>
              <div style={S.kpiCard}>
                <div style={S.kpiHead}><Wallet size={16} /> 总预算</div>
                <div style={S.kpiValue}>${summary.budget.toFixed(2)}</div>
              </div>
              <div style={S.kpiCard}>
                <div style={S.kpiHead}><ReceiptText size={16} /> 已花费</div>
                <div style={{ ...S.kpiValue, color: "#C8956C" }}>${summary.total.toFixed(3)}</div>
              </div>
              <div style={S.kpiCard}>
                <div style={S.kpiHead}>预算剩余</div>
                <div
                  style={{
                    ...S.kpiValue,
                    color: summary.remaining >= 0 ? "#2E7D32" : "#B23A3A",
                  }}
                >
                  ${summary.remaining.toFixed(3)}
                </div>
              </div>
              <div style={S.kpiCard}>
                <div style={S.kpiHead}>计费记录</div>
                <div style={S.kpiValue}>{summary.entries.length}</div>
              </div>
            </div>

            <div style={S.progressWrap}>
              <div style={S.progressBar}>
                <div style={{ ...S.progressFill, width: `${usedPercent}%` }} />
              </div>
              <div style={S.progressText}>预算使用率 {usedPercent.toFixed(1)}%</div>
            </div>

            <div style={S.budgetEditor}>
              <div style={{ fontSize: 13, color: "#8A8580" }}>预算设置 ($)</div>
              <input
                type="number"
                min={0}
                step={1}
                value={budgetDraft}
                onChange={(e) => setBudgetDraft(e.target.value)}
                style={S.input}
              />
              <button type="button" onClick={saveBudget} disabled={savingBudget} style={S.primaryBtn}>
                {savingBudget ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={14} />}
                {savingBudget ? "保存中..." : "保存预算"}
              </button>
            </div>
          </>
        )}
      </div>

      {!loading && summary && (
        <>
          <div style={S.section}>
            <h3 style={S.subTitle}>按服务汇总</h3>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>服务</th>
                  <th style={S.th}>调用次数</th>
                  <th style={S.th}>费用</th>
                </tr>
              </thead>
              <tbody>
                {serviceStats.map((item) => (
                  <tr key={item.service}>
                    <td style={S.td}>{item.service}</td>
                    <td style={S.td}>{item.count}</td>
                    <td style={S.td}>${item.cost.toFixed(3)}</td>
                  </tr>
                ))}
                {serviceStats.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ ...S.td, textAlign: "center", color: "#B0AAA4" }}>
                      暂无费用记录
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={S.section}>
            <h3 style={S.subTitle}>高频计费操作 (Top 10)</h3>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>操作</th>
                  <th style={S.th}>调用次数</th>
                  <th style={S.th}>费用</th>
                </tr>
              </thead>
              <tbody>
                {operationStats.map((item) => (
                  <tr key={item.operation}>
                    <td style={S.td}>{item.operation}</td>
                    <td style={S.td}>{item.count}</td>
                    <td style={S.td}>${item.cost.toFixed(3)}</td>
                  </tr>
                ))}
                {operationStats.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ ...S.td, textAlign: "center", color: "#B0AAA4" }}>
                      暂无费用记录
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={S.section}>
            <h3 style={S.subTitle}>费用明细流水</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>时间</th>
                    <th style={S.th}>服务</th>
                    <th style={S.th}>操作</th>
                    <th style={S.th}>词条ID</th>
                    <th style={S.th}>费用</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedEntries.map((entry, idx) => (
                    <tr key={`${entry.timestamp}-${entry.operation}-${idx}`}>
                      <td style={S.td}>{new Date(entry.timestamp).toLocaleString("zh-CN", { hour12: false })}</td>
                      <td style={S.td}>{entry.service}</td>
                      <td style={S.td}>{entry.operation}</td>
                      <td style={S.td}>{entry.wordId}</td>
                      <td style={S.td}>${entry.cost.toFixed(3)}</td>
                    </tr>
                  ))}
                  {sortedEntries.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ ...S.td, textAlign: "center", color: "#B0AAA4" }}>
                        暂无费用记录
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const S: Record<string, React.CSSProperties> = {
  section: {
    backgroundColor: "#fff",
    borderRadius: 12,
    border: "1px solid #E8E3DD",
    padding: 24,
    marginBottom: 20,
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 700,
    fontFamily: "'Noto Serif SC', Georgia, serif",
    color: "#2D2A26",
    margin: 0,
  },
  subTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: "#2D2A26",
    margin: "0 0 12px",
  },
  msg: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid",
    fontSize: 13,
    marginBottom: 12,
  },
  loadingRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: "#8A8580",
    fontSize: 14,
  },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    marginBottom: 14,
  },
  kpiCard: {
    border: "1px solid #E8E3DD",
    borderRadius: 10,
    backgroundColor: "#FAFAF8",
    padding: "14px 16px",
  },
  kpiHead: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "#8A8580",
    marginBottom: 8,
  },
  kpiValue: {
    fontSize: 26,
    fontWeight: 700,
    color: "#2D2A26",
    lineHeight: 1.2,
  },
  progressWrap: {
    marginBottom: 14,
  },
  progressBar: {
    width: "100%",
    height: 10,
    borderRadius: 999,
    backgroundColor: "#F0EDE8",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#C8956C",
    borderRadius: 999,
    transition: "width 0.2s",
  },
  progressText: {
    marginTop: 6,
    fontSize: 12,
    color: "#8A8580",
  },
  budgetEditor: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  input: {
    width: 140,
    padding: "8px 10px",
    border: "1px solid #E0DBD4",
    borderRadius: 8,
    backgroundColor: "#FAFAF8",
    color: "#2D2A26",
    fontSize: 14,
  },
  outlineBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 12px",
    border: "1px solid #E0DBD4",
    borderRadius: 8,
    fontSize: 13,
    color: "#6B6560",
    backgroundColor: "#fff",
  },
  primaryBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 14px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    color: "#fff",
    backgroundColor: "#C8956C",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  th: {
    textAlign: "left",
    padding: "10px 12px",
    fontSize: 12,
    color: "#8A8580",
    borderBottom: "1px solid #E8E3DD",
    backgroundColor: "#FAFAF8",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "10px 12px",
    fontSize: 13,
    color: "#2D2A26",
    borderBottom: "1px solid #F0EDE8",
    verticalAlign: "top",
  },
};
