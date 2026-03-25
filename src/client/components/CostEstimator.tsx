import React from "react";
import type { CostSummary } from "../../types/index";

interface Props {
  summary: CostSummary | null;
}

export const CostEstimator: React.FC<Props> = ({ summary }) => {
  if (!summary) return <div style={{ color: "#555" }}>加载中...</div>;

  const pct = (summary.total / summary.budget) * 100;
  const barColor = pct > 80 ? "#E74C3C" : pct > 50 ? "#F5A623" : "#27AE60";

  // 按服务汇总
  const byService = summary.entries.reduce(
    (acc, e) => {
      acc[e.service] = (acc[e.service] || 0) + e.cost;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div>
      {/* 预算总览 */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>预算总览</h3>
        <div style={styles.budgetRow}>
          <div>
            <div style={{ fontSize: 36, fontWeight: 700, color: barColor }}>
              ${summary.total.toFixed(2)}
            </div>
            <div style={{ color: "#888", marginTop: 4 }}>已使用</div>
          </div>
          <div style={{ textAlign: "right" as const }}>
            <div style={{ fontSize: 36, fontWeight: 700, color: "#27AE60" }}>
              ${summary.remaining.toFixed(2)}
            </div>
            <div style={{ color: "#888", marginTop: 4 }}>剩余</div>
          </div>
        </div>
        <div style={styles.barBg}>
          <div
            style={{
              ...styles.barFill,
              width: `${Math.min(pct, 100)}%`,
              backgroundColor: barColor,
            }}
          />
        </div>
        <div style={{ textAlign: "center" as const, color: "#888", marginTop: 8, fontSize: 13 }}>
          预算 ${summary.budget} · 已用 {pct.toFixed(1)}%
        </div>
      </div>

      {/* 按服务分类 */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>费用明细</h3>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>服务</th>
              <th style={styles.th}>费用</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(byService).map(([service, cost]) => (
              <tr key={service}>
                <td style={styles.td}>{service}</td>
                <td style={styles.td}>${cost.toFixed(3)}</td>
              </tr>
            ))}
            {Object.keys(byService).length === 0 && (
              <tr>
                <td colSpan={2} style={{ ...styles.td, color: "#555" }}>
                  暂无费用记录
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
  budgetRow: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  barBg: {
    height: 8,
    backgroundColor: "#1a1a2e",
    borderRadius: 4,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 4,
    transition: "width 0.3s",
  },
  table: { width: "100%", borderCollapse: "collapse" as const },
  th: {
    textAlign: "left" as const,
    padding: "10px 12px",
    borderBottom: "1px solid #2a2a3e",
    fontSize: 13,
    color: "#888",
  },
  td: {
    padding: "10px 12px",
    borderBottom: "1px solid #1a1a2e",
    fontSize: 14,
  },
};
