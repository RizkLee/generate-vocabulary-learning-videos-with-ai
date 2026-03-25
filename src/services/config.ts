import fs from "fs";
import path from "path";

const CONFIG_PATH = path.resolve("data/config.json");

export interface AppConfig {
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
  proxy: {
    port: number;
    host: string;
    enabled: boolean;
  };
  budget: number;
}

let _cache: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (_cache) return _cache;
  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  _cache = JSON.parse(raw) as AppConfig;
  return _cache;
}

export function saveConfig(config: AppConfig): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  _cache = config;
}

export function reloadConfig(): AppConfig {
  _cache = null;
  return loadConfig();
}

/** 模板替换 {{key}} */
export function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || "");
}
