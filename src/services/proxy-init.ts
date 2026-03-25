/**
 * 初始化 HTTP 代理（在中国大陆访问 Google API 必需）。
 * 优先从 data/config.json 读取代理设置，
 * 其次从环境变量 HTTPS_PROXY/HTTP_PROXY/ALL_PROXY 读取，
 * 最后自动检测常见代理端口 (10808, 7890, 10809, 1080)。
 */
import { ProxyAgent, fetch as undiciFetch } from "undici";
import fs from "fs";
import path from "path";
import net from "net";

function tryLoadConfigProxy(): { host: string; port: number; enabled: boolean } | null {
  try {
    const cfgPath = path.resolve("data/config.json");
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
      if (cfg.proxy && cfg.proxy.enabled && cfg.proxy.port) {
        return cfg.proxy;
      }
    }
  } catch { /* ignore */ }
  return null;
}

function checkPort(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(500);
    socket.on("connect", () => { socket.destroy(); resolve(true); });
    socket.on("timeout", () => { socket.destroy(); resolve(false); });
    socket.on("error", () => { socket.destroy(); resolve(false); });
    socket.connect(port, host);
  });
}

async function detectProxy(): Promise<string | null> {
  const commonPorts = [10808, 7890, 10809, 1080];
  for (const port of commonPorts) {
    if (await checkPort("127.0.0.1", port)) {
      return `http://127.0.0.1:${port}`;
    }
  }
  return null;
}

async function initProxy() {
  let proxyUrl: string | null = null;
  let source = "";

  // 1. 从 config 读取
  const cfgProxy = tryLoadConfigProxy();
  if (cfgProxy) {
    proxyUrl = `http://${cfgProxy.host}:${cfgProxy.port}`;
    source = "config.json";
  }

  // 2. 从环境变量读取
  if (!proxyUrl) {
    proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY || null;
    if (proxyUrl) source = "env";
  }

  // 3. 自动检测常见端口
  if (!proxyUrl) {
    proxyUrl = await detectProxy();
    if (proxyUrl) source = "auto-detect";
  }

  if (proxyUrl) {
    const dispatcher = new ProxyAgent(proxyUrl);

    // @ts-expect-error -- 覆写全局 fetch
    globalThis.fetch = (input: any, init?: any) => {
      return undiciFetch(input, { ...init, dispatcher });
    };

    // 同时设置环境变量，使 Google Auth 等使用原生 HTTP 的库也走代理
    process.env.HTTPS_PROXY = proxyUrl;
    process.env.HTTP_PROXY = proxyUrl;

    console.log(`  Proxy: ${proxyUrl} (${source})`);
  } else {
    console.log("  Proxy: none (Google API may be unreachable in mainland China)");
  }
}

// 立即执行
await initProxy();
