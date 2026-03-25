import React, { useState, useEffect } from "react";

interface AppConfig {
  apiKeys: { pixabay: string };
  gcp: { project: string; location: string };
  models: {
    tts: string;
    ttsVoice: string;
    contentGeneration: string;
    subtitle: string;
    video: string;
  };
  prompts: {
    englishVoice: string;
    chineseVoice: string;
    contentGeneration: string;
    veoVideo: string;
    chineseIntro: string;
    chineseWordTemplate: string;
    englishWordTemplate: string;
  };
  video: {
    fps: number;
    width: number;
    height: number;
    bgmVolume: number;
    bgmVolumeScene3: number;
  };
  budget: number;
}

export const ConfigEditor: React.FC = () => {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/config");
      const data = await res.json();
      if (data.success) {
        setConfig(data.data);
      } else {
        setMessage({ type: "error", text: `加载失败: ${data.error}` });
      }
    } catch (err) {
      setMessage({ type: "error", text: `请求失败: ${err}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: "success", text: "配置保存成功" });
      } else {
        setMessage({ type: "error", text: `保存失败: ${data.error}` });
      }
    } catch (err) {
      setMessage({ type: "error", text: `请求失败: ${err}` });
    } finally {
      setSaving(false);
    }
  };

  const updateField = (path: string, value: string | number) => {
    if (!config) return;
    const keys = path.split(".");
    const newConfig = JSON.parse(JSON.stringify(config)) as any;
    let obj = newConfig;
    for (let i = 0; i < keys.length - 1; i++) {
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    setConfig(newConfig as AppConfig);
  };

  const renderInput = (
    label: string,
    path: string,
    value: string | number,
    type: "text" | "number" | "password" = "text",
  ) => (
    <div style={styles.fieldRow}>
      <label style={styles.fieldLabel}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) =>
          updateField(
            path,
            type === "number" ? Number(e.target.value) : e.target.value,
          )
        }
        style={styles.input}
      />
    </div>
  );

  const renderTextarea = (
    label: string,
    path: string,
    value: string,
    rows: number = 4,
  ) => (
    <div style={styles.fieldRow}>
      <label style={styles.fieldLabel}>{label}</label>
      <textarea
        value={value}
        onChange={(e) => updateField(path, e.target.value)}
        rows={rows}
        style={styles.textarea}
      />
    </div>
  );

  if (loading) {
    return (
      <div style={styles.section}>
        <div style={styles.loading}>加载配置中...</div>
      </div>
    );
  }

  if (!config) {
    return (
      <div style={styles.section}>
        <div style={styles.loading}>无法加载配置</div>
      </div>
    );
  }

  return (
    <div>
      {/* 消息提示 */}
      {message && (
        <div
          style={{
            ...styles.message,
            backgroundColor:
              message.type === "success" ? "#1a3a1a" : "#3a1a1a",
            borderColor: message.type === "success" ? "#27AE60" : "#E74C3C",
          }}
        >
          {message.text}
        </div>
      )}

      {/* API Keys */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>API 密钥</h3>
        {renderInput(
          "Pixabay API Key",
          "apiKeys.pixabay",
          config.apiKeys.pixabay,
          "password",
        )}
      </div>

      {/* GCP */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>GCP 配置</h3>
        {renderInput("项目 ID", "gcp.project", config.gcp.project)}
        {renderInput("区域", "gcp.location", config.gcp.location)}
      </div>

      {/* Models */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>模型配置</h3>
        {renderInput("TTS 模型", "models.tts", config.models.tts)}
        {renderInput("TTS Voice", "models.ttsVoice", config.models.ttsVoice)}
        {renderInput(
          "内容生成模型",
          "models.contentGeneration",
          config.models.contentGeneration,
        )}
        {renderInput("字幕模型", "models.subtitle", config.models.subtitle)}
        {renderInput("视频模型", "models.video", config.models.video)}
      </div>

      {/* Prompts */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>提示词</h3>
        {renderTextarea(
          "英文语音提示词",
          "prompts.englishVoice",
          config.prompts.englishVoice,
          3,
        )}
        {renderTextarea(
          "中文语音提示词",
          "prompts.chineseVoice",
          config.prompts.chineseVoice,
          3,
        )}
        {renderTextarea(
          "内容生成提示词",
          "prompts.contentGeneration",
          config.prompts.contentGeneration,
          8,
        )}
        {renderTextarea(
          "Veo 视频提示词",
          "prompts.veoVideo",
          config.prompts.veoVideo,
          6,
        )}
        {renderTextarea(
          "中文开场白",
          "prompts.chineseIntro",
          config.prompts.chineseIntro,
          2,
        )}
        {renderTextarea(
          "中文单词模板",
          "prompts.chineseWordTemplate",
          config.prompts.chineseWordTemplate,
          2,
        )}
        {renderTextarea(
          "英文单词模板",
          "prompts.englishWordTemplate",
          config.prompts.englishWordTemplate,
          2,
        )}
      </div>

      {/* Video */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>视频参数</h3>
        {renderInput("帧率 (FPS)", "video.fps", config.video.fps, "number")}
        {renderInput("宽度", "video.width", config.video.width, "number")}
        {renderInput("高度", "video.height", config.video.height, "number")}
        {renderInput(
          "BGM 音量",
          "video.bgmVolume",
          config.video.bgmVolume,
          "number",
        )}
        {renderInput(
          "场景3 BGM 音量",
          "video.bgmVolumeScene3",
          config.video.bgmVolumeScene3,
          "number",
        )}
      </div>

      {/* Budget */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>预算</h3>
        {renderInput("预算上限 ($)", "budget", config.budget, "number")}
      </div>

      {/* 保存按钮 */}
      <div style={styles.saveBar}>
        <button
          onClick={saveConfig}
          disabled={saving}
          style={styles.saveBtn}
        >
          {saving ? "保存中..." : "保存配置"}
        </button>
        <button onClick={fetchConfig} style={styles.resetBtn}>
          重新加载
        </button>
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
  fieldRow: {
    marginBottom: 16,
  },
  fieldLabel: {
    display: "block",
    fontSize: 13,
    color: "#888",
    marginBottom: 6,
    fontWeight: 500,
  },
  input: {
    width: "100%",
    padding: "10px 14px",
    backgroundColor: "#1a1a2e",
    border: "1px solid #2a2a3e",
    borderRadius: 8,
    color: "#e0e0e0",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box" as const,
  },
  textarea: {
    width: "100%",
    padding: "10px 14px",
    backgroundColor: "#1a1a2e",
    border: "1px solid #2a2a3e",
    borderRadius: 8,
    color: "#e0e0e0",
    fontSize: 13,
    fontFamily: "monospace",
    outline: "none",
    resize: "vertical" as const,
    lineHeight: 1.6,
    boxSizing: "border-box" as const,
  },
  saveBar: {
    position: "sticky" as const,
    bottom: 0,
    padding: "16px 0",
    display: "flex",
    gap: 12,
    justifyContent: "flex-end",
  },
  saveBtn: {
    padding: "12px 32px",
    backgroundColor: "#F5A623",
    border: "none",
    borderRadius: 8,
    color: "#000",
    cursor: "pointer",
    fontSize: 15,
    fontWeight: 600,
  },
  resetBtn: {
    padding: "12px 24px",
    backgroundColor: "#2a2a3e",
    border: "1px solid #3a3a4e",
    borderRadius: 8,
    color: "#e0e0e0",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 500,
  },
  message: {
    padding: "12px 20px",
    borderRadius: 8,
    border: "1px solid",
    marginBottom: 16,
    fontSize: 14,
    color: "#e0e0e0",
  },
  loading: {
    textAlign: "center" as const,
    padding: 40,
    color: "#555",
    fontSize: 16,
  },
};
