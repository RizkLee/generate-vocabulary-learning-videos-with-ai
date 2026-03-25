// 代理初始化必须在所有 API 调用前执行
import "../services/proxy-init.js";

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import wordlistRouter from "./routes/wordlist.js";
import generateRouter from "./routes/generate.js";
import renderRouter from "./routes/render.js";
import configRouter from "./routes/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../..");

const app = express();
app.use(express.json({ limit: "50mb" }));

// 静态文件: public 目录 (Remotion 资源)
app.use("/public", express.static(path.join(PROJECT_ROOT, "public")));
// 静态文件: output 目录 (渲染成品)
app.use("/output", express.static(path.join(PROJECT_ROOT, "output")));

// API 路由
app.use("/api/wordlists", wordlistRouter);
app.use("/api/generate", generateRouter);
app.use("/api/render", renderRouter);
app.use("/api/config", configRouter);

// 健康检查
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`\n  Server running at http://localhost:${PORT}`);
  console.log(`  Remotion Studio: npx remotion studio`);
  console.log(`  Vite Client: npm run dev:client\n`);
});

export default app;
