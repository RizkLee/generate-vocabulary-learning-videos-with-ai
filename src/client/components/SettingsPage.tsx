import React, { useState, useEffect } from "react";
import { Save, RotateCcw, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import type { WordList, WordListConfigOverride } from "../../types/index";

interface AppConfig {
  apiKeys: { pixabay: string };
  gcp: { project: string; location: string };
  models: { tts: string; ttsVoice: string; contentGeneration: string; subtitle: string; video: string };
  prompts: { englishVoice: string; chineseVoice: string; contentGeneration: string; veoVideo: string; chineseIntro: string; chineseWordTemplate: string; englishWordTemplate: string };
  video: { fps: number; width: number; height: number; bgmVolume: number; bgmVolumeScene3: number };
  proxy: { port: number; host: string; enabled: boolean };
  budget: number;
}

interface Props {
  selectedList: WordList | null;
}

type Scope = "global" | "list";

interface SettingsFieldProps {
  label: string;
  path: string;
  value: string | number;
  type?: string;
  onSet: (path: string, value: string | number | boolean) => void;
}

const SettingsField: React.FC<SettingsFieldProps> = ({ label, path, value, type = "text", onSet }) => (
  <div style={S.field}>
    <label style={S.label}>{label}</label>
    <input
      type={type}
      value={value}
      onChange={(e) => onSet(path, type === "number" ? Number(e.target.value) : e.target.value)}
      style={S.input}
    />
  </div>
);

interface SettingsTextAreaProps {
  label: string;
  path: string;
  value: string;
  rows?: number;
  onSet: (path: string, value: string | number | boolean) => void;
  placeholder?: string;
}

const SettingsTextArea: React.FC<SettingsTextAreaProps> = ({ label, path, value, rows = 4, onSet, placeholder }) => (
  <div style={S.field}>
    <label style={S.label}>{label}</label>
    <textarea value={value} placeholder={placeholder} onChange={(e) => onSet(path, e.target.value)} rows={rows} style={S.textarea} />
  </div>
);

export const SettingsPage: React.FC<Props> = ({ selectedList }) => {
  const [scope, setScope] = useState<Scope>("global");
  const [globalConfig, setGlobalConfig] = useState<AppConfig | null>(null);
  const [listConfig, setListConfig] = useState<WordListConfigOverride>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const loadGlobal = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/config");
      const data = await res.json();
      if (data.success) setGlobalConfig(data.data);
      else setMsg({ ok: false, text: data.error });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setLoading(false);
    }
  };

  const loadSelectedListConfig = async () => {
    if (!selectedList) {
      setListConfig({});
      return;
    }
    try {
      const res = await fetch(`/api/wordlists/${selectedList.id}`);
      const data = await res.json();
      if (data.success) {
        setListConfig(data.data.config || {});
      }
    } catch {
      setListConfig(selectedList.config || {});
    }
  };

  useEffect(() => { loadGlobal(); }, []);
  useEffect(() => { loadSelectedListConfig(); }, [selectedList?.id]);

  useEffect(() => {
    if (!selectedList && scope === "list") {
      setScope("global");
    }
  }, [selectedList, scope]);

  const save = async () => {
    if (scope === "global") {
      if (!globalConfig) return;
      setSaving(true);
      setMsg(null);
      try {
        const res = await fetch("/api/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(globalConfig),
        });
        const data = await res.json();
        setMsg(data.success ? { ok: true, text: "全局配置已保存" } : { ok: false, text: data.error });
      } catch (e: any) {
        setMsg({ ok: false, text: e.message });
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!selectedList) {
      setMsg({ ok: false, text: "请先在词库页选择一个词库" });
      return;
    }

    setSaving(true);
    setMsg(null);
    try {
      const sanitized: WordListConfigOverride = {
        models: Object.fromEntries(
          Object.entries(listConfig.models || {}).filter(([, v]) => (v || "").trim()),
        ),
        prompts: Object.fromEntries(
          Object.entries(listConfig.prompts || {}).filter(([, v]) => (v || "").trim()),
        ),
      };
      const res = await fetch(`/api/wordlists/${selectedList.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: sanitized }),
      });
      const data = await res.json();
      if (data.success) {
        setMsg({ ok: true, text: `词库“${selectedList.name}”覆盖配置已保存` });
      } else {
        setMsg({ ok: false, text: data.error || "保存失败" });
      }
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setSaving(false);
    }
  };

  const setGlobal = (path: string, value: string | number | boolean) => {
    if (!globalConfig) return;
    const c = JSON.parse(JSON.stringify(globalConfig)) as any;
    const keys = path.split(".");
    let obj = c;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]]) obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    setGlobalConfig(c);
  };

  const setList = (path: string, value: string) => {
    const c = JSON.parse(JSON.stringify(listConfig || {})) as any;
    const keys = path.split(".");
    let obj = c;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]]) obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    setListConfig(c);
  };

  const resetListScope = () => {
    setListConfig(selectedList?.config || {});
    setMsg({ ok: true, text: "词库覆盖配置已重置" });
  };

  if (loading) return <div style={S.loading}><Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} /> 加载配置...</div>;
  if (!globalConfig) return <div style={S.loading}>无法加载配置</div>;

  const currentScopeTitle = scope === "global"
    ? "全局默认配置"
    : `词库覆盖配置：${selectedList?.name || "未选择词库"}`;

  return (
    <div>
      {msg && (
        <div style={{ ...S.msgBar, borderColor: msg.ok ? "#6B9E6B" : "#C05050", backgroundColor: msg.ok ? "#F0F7F0" : "#FDF0F0" }}>
          {msg.ok ? <CheckCircle2 size={16} color="#6B9E6B" /> : <AlertCircle size={16} color="#C05050" />}
          {msg.text}
        </div>
      )}

      <div style={S.scopeBar}>
        <button
          onClick={() => setScope("global")}
          style={{ ...S.scopeBtn, ...(scope === "global" ? S.scopeBtnActive : {}) }}
        >
          全局默认
        </button>
        <button
          onClick={() => selectedList && setScope("list")}
          style={{ ...S.scopeBtn, ...(scope === "list" ? S.scopeBtnActive : {}), opacity: selectedList ? 1 : 0.5 }}
          disabled={!selectedList}
        >
          当前词库覆盖
        </button>
        <span style={S.scopeDesc}>{currentScopeTitle}</span>
      </div>

      {scope === "global" && (
        <>
          <div style={S.section}>
            <h3 style={S.sTitle}>API 密钥</h3>
            <SettingsField label="Pixabay API Key" path="apiKeys.pixabay" value={globalConfig.apiKeys.pixabay} type="password" onSet={setGlobal} />
          </div>

          <div style={S.section}>
            <h3 style={S.sTitle}>GCP 配置</h3>
            <div style={S.grid2}>
              <SettingsField label="项目 ID" path="gcp.project" value={globalConfig.gcp.project} onSet={setGlobal} />
              <SettingsField label="区域 (推荐 global)" path="gcp.location" value={globalConfig.gcp.location} onSet={setGlobal} />
            </div>
          </div>

          <div style={S.section}>
            <h3 style={S.sTitle}>代理设置</h3>
            <div style={{ fontSize: 12, color: "#8A8580", marginBottom: 12 }}>
              在中国大陆访问 Google API 需要代理。修改后需重启服务器生效。
            </div>
            <div style={S.grid2}>
              <SettingsField label="代理主机" path="proxy.host" value={globalConfig.proxy?.host || "127.0.0.1"} onSet={setGlobal} />
              <SettingsField label="代理端口" path="proxy.port" value={globalConfig.proxy?.port || 10808} type="number" onSet={setGlobal} />
            </div>
            <div style={{ marginTop: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#6B6560", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={globalConfig.proxy?.enabled ?? true}
                  onChange={(e) => setGlobal("proxy.enabled", e.target.checked)}
                  style={{ accentColor: "#C8956C" }}
                />
                启用代理
              </label>
            </div>
          </div>

          <div style={S.section}>
            <h3 style={S.sTitle}>模型配置</h3>
            <div style={S.grid2}>
              <SettingsField label="TTS 模型" path="models.tts" value={globalConfig.models.tts} onSet={setGlobal} />
              <SettingsField label="TTS 音色" path="models.ttsVoice" value={globalConfig.models.ttsVoice} onSet={setGlobal} />
              <SettingsField label="内容生成" path="models.contentGeneration" value={globalConfig.models.contentGeneration} onSet={setGlobal} />
              <SettingsField label="字幕模型" path="models.subtitle" value={globalConfig.models.subtitle} onSet={setGlobal} />
              <SettingsField label="视频模型" path="models.video" value={globalConfig.models.video} onSet={setGlobal} />
            </div>
          </div>

          <div style={S.section}>
            <h3 style={S.sTitle}>提示词</h3>
            <SettingsTextArea label="英文语音" path="prompts.englishVoice" value={globalConfig.prompts.englishVoice} rows={3} onSet={setGlobal} />
            <SettingsTextArea label="中文语音" path="prompts.chineseVoice" value={globalConfig.prompts.chineseVoice} rows={3} onSet={setGlobal} />
            <SettingsTextArea label="内容生成" path="prompts.contentGeneration" value={globalConfig.prompts.contentGeneration} rows={6} onSet={setGlobal} />
            <SettingsTextArea label="Veo 视频" path="prompts.veoVideo" value={globalConfig.prompts.veoVideo} rows={5} onSet={setGlobal} />
            <SettingsTextArea label="中文开场白" path="prompts.chineseIntro" value={globalConfig.prompts.chineseIntro} rows={2} onSet={setGlobal} />
            <SettingsTextArea label="中文单词模板" path="prompts.chineseWordTemplate" value={globalConfig.prompts.chineseWordTemplate} rows={2} onSet={setGlobal} />
            <SettingsTextArea label="英文单词模板" path="prompts.englishWordTemplate" value={globalConfig.prompts.englishWordTemplate} rows={2} onSet={setGlobal} />
          </div>

          <div style={S.section}>
            <h3 style={S.sTitle}>视频参数</h3>
            <div style={S.grid2}>
              <SettingsField label="帧率 (FPS)" path="video.fps" value={globalConfig.video.fps} type="number" onSet={setGlobal} />
              <SettingsField label="宽度" path="video.width" value={globalConfig.video.width} type="number" onSet={setGlobal} />
              <SettingsField label="高度" path="video.height" value={globalConfig.video.height} type="number" onSet={setGlobal} />
              <SettingsField label="BGM 音量" path="video.bgmVolume" value={globalConfig.video.bgmVolume} type="number" onSet={setGlobal} />
              <SettingsField label="场景3 BGM 音量" path="video.bgmVolumeScene3" value={globalConfig.video.bgmVolumeScene3} type="number" onSet={setGlobal} />
            </div>
          </div>

          <div style={S.section}>
            <h3 style={S.sTitle}>预算</h3>
            <SettingsField label="预算上限 ($)" path="budget" value={globalConfig.budget} type="number" onSet={setGlobal} />
          </div>
        </>
      )}

      {scope === "list" && (
        <>
          <div style={S.section}>
            <h3 style={S.sTitle}>词库模型覆盖</h3>
            <div style={S.tip}>留空表示继承全局默认值，仅在当前词库生效。</div>
            <div style={S.grid2}>
              <SettingsField label="TTS 模型" path="models.tts" value={listConfig.models?.tts || ""} onSet={(p, v) => setList(p, String(v))} />
              <SettingsField label="TTS 音色" path="models.ttsVoice" value={listConfig.models?.ttsVoice || ""} onSet={(p, v) => setList(p, String(v))} />
              <SettingsField label="内容生成模型" path="models.contentGeneration" value={listConfig.models?.contentGeneration || ""} onSet={(p, v) => setList(p, String(v))} />
              <SettingsField label="字幕模型" path="models.subtitle" value={listConfig.models?.subtitle || ""} onSet={(p, v) => setList(p, String(v))} />
              <SettingsField label="视频模型" path="models.video" value={listConfig.models?.video || ""} onSet={(p, v) => setList(p, String(v))} />
            </div>
          </div>

          <div style={S.section}>
            <h3 style={S.sTitle}>词库提示词覆盖</h3>
            <SettingsTextArea label="英文语音提示词" path="prompts.englishVoice" value={listConfig.prompts?.englishVoice || ""} rows={3} onSet={(p, v) => setList(p, String(v))} placeholder={globalConfig.prompts.englishVoice.slice(0, 80) + "..."} />
            <SettingsTextArea label="中文语音提示词" path="prompts.chineseVoice" value={listConfig.prompts?.chineseVoice || ""} rows={3} onSet={(p, v) => setList(p, String(v))} placeholder={globalConfig.prompts.chineseVoice.slice(0, 80) + "..."} />
            <SettingsTextArea label="内容生成提示词" path="prompts.contentGeneration" value={listConfig.prompts?.contentGeneration || ""} rows={6} onSet={(p, v) => setList(p, String(v))} placeholder={globalConfig.prompts.contentGeneration.slice(0, 80) + "..."} />
            <SettingsTextArea label="Veo 视频提示词" path="prompts.veoVideo" value={listConfig.prompts?.veoVideo || ""} rows={5} onSet={(p, v) => setList(p, String(v))} placeholder={globalConfig.prompts.veoVideo.slice(0, 80) + "..."} />
            <SettingsTextArea label="中文开场白" path="prompts.chineseIntro" value={listConfig.prompts?.chineseIntro || ""} rows={2} onSet={(p, v) => setList(p, String(v))} placeholder={globalConfig.prompts.chineseIntro} />
            <SettingsTextArea label="中文单词模板" path="prompts.chineseWordTemplate" value={listConfig.prompts?.chineseWordTemplate || ""} rows={2} onSet={(p, v) => setList(p, String(v))} placeholder={globalConfig.prompts.chineseWordTemplate} />
            <SettingsTextArea label="英文单词模板" path="prompts.englishWordTemplate" value={listConfig.prompts?.englishWordTemplate || ""} rows={2} onSet={(p, v) => setList(p, String(v))} placeholder={globalConfig.prompts.englishWordTemplate} />
          </div>
        </>
      )}

      <div style={S.saveBar}>
        {scope === "global" ? (
          <button onClick={loadGlobal} style={S.resetBtn}><RotateCcw size={14} /> 重新加载全局</button>
        ) : (
          <button onClick={resetListScope} style={S.resetBtn}><RotateCcw size={14} /> 重置词库覆盖</button>
        )}

        <button onClick={save} disabled={saving} style={S.saveBtn}>
          {saving ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={14} />}
          {saving ? "保存中..." : scope === "global" ? "保存全局配置" : "保存词库覆盖"}
        </button>
      </div>
    </div>
  );
};

const S: Record<string, React.CSSProperties> = {
  scopeBar: { display: "flex", alignItems: "center", gap: 8, marginBottom: 16, backgroundColor: "#fff", border: "1px solid #E8E3DD", borderRadius: 10, padding: 10 },
  scopeBtn: { padding: "7px 14px", borderRadius: 8, border: "1px solid #E0DBD4", backgroundColor: "#fff", color: "#6B6560", fontSize: 13, fontWeight: 500 },
  scopeBtnActive: { backgroundColor: "#F7F4EF", color: "#2D2A26", borderColor: "#C8956C" },
  scopeDesc: { marginLeft: 8, fontSize: 12, color: "#8A8580" },
  tip: { fontSize: 12, color: "#8A8580", marginBottom: 12 },
  section: { backgroundColor: "#fff", borderRadius: 12, border: "1px solid #E8E3DD", padding: 24, marginBottom: 20 },
  sTitle: { fontSize: 16, fontWeight: 700, fontFamily: "'Noto Serif SC', Georgia, serif", color: "#2D2A26", margin: "0 0 16px" },
  field: { marginBottom: 14 },
  label: { display: "block", fontSize: 13, color: "#8A8580", marginBottom: 5, fontWeight: 500 },
  input: { width: "100%", padding: "9px 14px", border: "1px solid #E0DBD4", borderRadius: 8, fontSize: 14, color: "#2D2A26", outline: "none", backgroundColor: "#FAFAF8", boxSizing: "border-box" as const },
  textarea: { width: "100%", padding: "9px 14px", border: "1px solid #E0DBD4", borderRadius: 8, fontSize: 13, fontFamily: "monospace", color: "#2D2A26", outline: "none", resize: "vertical" as const, lineHeight: 1.6, backgroundColor: "#FAFAF8", boxSizing: "border-box" as const },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" },
  saveBar: { position: "sticky" as const, bottom: 0, padding: "16px 0", display: "flex", gap: 12, justifyContent: "flex-end", backgroundColor: "#F7F4EF" },
  saveBtn: { display: "flex", alignItems: "center", gap: 6, padding: "10px 28px", backgroundColor: "#C8956C", color: "#fff", borderRadius: 8, fontSize: 14, fontWeight: 600 },
  resetBtn: { display: "flex", alignItems: "center", gap: 6, padding: "10px 20px", border: "1px solid #E0DBD4", borderRadius: 8, fontSize: 13, fontWeight: 500, color: "#6B6560", backgroundColor: "#fff" },
  msgBar: { display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 8, border: "1px solid", marginBottom: 16, fontSize: 14 },
  loading: { display: "flex", alignItems: "center", gap: 8, justifyContent: "center", padding: 60, color: "#8A8580", fontSize: 15 },
};
