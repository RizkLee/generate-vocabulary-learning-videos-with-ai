import { Router } from "express";
import { loadConfig, saveConfig, reloadConfig } from "../../services/config.js";
import { resetTtsClient } from "../../services/gemini-tts.js";
import { resetVeoClient } from "../../services/veo.js";
import { resetSubtitleClient } from "../../services/subtitle.js";
import { resetContentClient } from "../../services/gemini-content.js";

const router = Router();

router.get("/", (_req, res) => {
  res.json({ success: true, data: loadConfig() });
});

router.put("/", (req, res) => {
  try {
    saveConfig(req.body);
    // 清除所有 AI 客户端缓存，使新配置生效
    resetTtsClient();
    resetVeoClient();
    resetSubtitleClient();
    resetContentClient();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put("/budget", (req, res) => {
  try {
    const budget = Number(req.body?.budget);
    if (!Number.isFinite(budget) || budget < 0) {
      return res.status(400).json({ success: false, error: "预算必须是大于等于0的数字" });
    }

    const config = loadConfig();
    saveConfig({ ...config, budget });
    res.json({ success: true, data: { budget } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
