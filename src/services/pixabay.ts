import fs from "fs";
import path from "path";
import { loadConfig } from "./config.js";
const PIXABAY_API_URL = "https://pixabay.com/api/";

interface PixabayImage {
  id: number;
  webformatURL: string;
  largeImageURL: string;
  tags: string;
}

interface PixabayResponse {
  total: number;
  totalHits: number;
  hits: PixabayImage[];
}

/** 搜索 Pixabay 图片 */
export async function searchImage(
  query: string,
  options: {
    orientation?: "horizontal" | "vertical";
    category?: string;
    perPage?: number;
  } = {},
): Promise<PixabayImage[]> {
  const params = new URLSearchParams({
    key: loadConfig().apiKeys.pixabay,
    q: query,
    image_type: "photo",
    orientation: options.orientation || "horizontal",
    per_page: String(options.perPage || 5),
    safesearch: "true",
    lang: "en",
  });
  if (options.category) params.set("category", options.category);

  const response = await fetch(`${PIXABAY_API_URL}?${params}`);
  if (!response.ok) {
    throw new Error(`Pixabay API 错误: ${response.status}`);
  }

  const data = (await response.json()) as PixabayResponse;
  return data.hits;
}

/** 搜索并下载图片到指定路径 */
export async function fetchAndSaveImage(
  query: string,
  outputPath: string,
  fallbackQuery?: string,
): Promise<string | null> {
  let images = await searchImage(query);

  // 如果没有结果，尝试备用搜索词
  if (images.length === 0 && fallbackQuery) {
    images = await searchImage(fallbackQuery, { category: "people" });
  }

  if (images.length === 0) return null;

  // 选择第一张图片
  const imageUrl = images[0].largeImageURL;
  const response = await fetch(imageUrl);
  if (!response.ok) return null;

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buffer);

  return outputPath;
}
