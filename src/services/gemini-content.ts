import { GoogleGenAI } from "@google/genai";
import type { WordEntry } from "../types/index";
import { loadConfig } from "./config.js";

let _ai: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!_ai) {
    const cfg = loadConfig();
    _ai = new GoogleGenAI({ vertexai: true, project: cfg.gcp.project, location: cfg.gcp.location });
  }
  return _ai;
}
export function resetContentClient() { _ai = null; }

export interface ContentGenerationOverrides {
  model?: string;
  prompt?: string;
}

/** 从 LLM 输出中提取有效 JSON */
function extractJSON(text: string): string {
  // 1. 尝试去掉 markdown 代码块
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) text = codeBlockMatch[1].trim();

  // 2. 找到第一个 [ 或 { 到最后一个 ] 或 }
  const firstBracket = text.search(/[\[{]/);
  if (firstBracket === -1) throw new Error("未找到 JSON 数据");
  const isArray = text[firstBracket] === "[";
  const closingChar = isArray ? "]" : "}";

  // 从末尾往前找最后一个对应的闭合符号
  const lastBracket = text.lastIndexOf(closingChar);
  if (lastBracket === -1) throw new Error("JSON 不完整 — 缺少闭合符号");

  return text.slice(firstBracket, lastBracket + 1);
}

/** 解析 JSON，带容错 */
function safeParseJSON(text: string): any {
  const cleaned = extractJSON(text);
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // 尝试修复常见问题

    // 1. 修复尾部逗号: ,] 或 ,}
    let fixed = cleaned
      .replace(/,\s*]/g, "]")
      .replace(/,\s*}/g, "}");
    try { return JSON.parse(fixed); } catch {}

    // 2. 尝试截断到最后一个完整对象
    const lastCompleteObj = cleaned.lastIndexOf("},");
    if (lastCompleteObj > 0) {
      const truncated = cleaned.slice(0, lastCompleteObj + 1) + "]";
      try {
        const result = JSON.parse(truncated);
        if (Array.isArray(result) && result.length > 0) return result;
      } catch {}
    }

    // 3. 尝试补全不完整的 JSON（缺少闭合括号）
    let attempt = cleaned;
    for (let i = 0; i < 5; i++) {
      const openBraces = (attempt.match(/{/g) || []).length;
      const closeBraces = (attempt.match(/}/g) || []).length;
      const openBrackets = (attempt.match(/\[/g) || []).length;
      const closeBrackets = (attempt.match(/]/g) || []).length;
      if (openBraces > closeBraces) attempt += "}";
      else if (openBrackets > closeBrackets) attempt += "]";
      else break;
    }
    try { return JSON.parse(attempt); } catch {}

    throw new Error(`JSON 解析失败: ${(e as Error).message}\n原始文本前200字符: ${cleaned.slice(0, 200)}`);
  }
}

/** 使用 Gemini Flash 生成单词内容 */
export async function generateWordContent(
  word: string,
  overrides?: ContentGenerationOverrides,
): Promise<Partial<WordEntry>> {
  const cfg = loadConfig();
  const response = await getAI().models.generateContent({
    model: overrides?.model || cfg.models.contentGeneration,
    contents: `请为以下英语单词/短语/句式生成教学内容：\n\n${word}`,
    config: {
      systemInstruction: overrides?.prompt || cfg.prompts.contentGeneration,
      responseMimeType: "application/json",
    },
  });

  const text = response.text;
  if (!text) throw new Error("Gemini Flash 未返回内容");

  const data = safeParseJSON(text);
  return {
    word: data.word,
    phonetic: data.phonetic,
    chineseMeaning: data.chineseMeaning,
    englishMeaning: data.englishMeaning,
    patterns: data.patterns,
    patternTranslations: data.patternTranslations || [],
    examples: data.examples,
  };
}

/** 批量生成单词列表 — 带重试 */
export async function generateWordList(
  theme: string,
  count: number,
): Promise<Partial<WordEntry>[]> {
  const cfg = loadConfig();

  // 如果请求数量多，分批生成以避免截断
  if (count > 3) {
    const results: Partial<WordEntry>[] = [];
    for (let i = 0; i < count; i += 3) {
      const batchSize = Math.min(3, count - i);
      const batch = await generateWordListBatch(cfg, theme, batchSize, results.map(w => w.word || ""));
      results.push(...batch);
    }
    return results;
  }

  return generateWordListBatch(cfg, theme, count, []);
}

async function generateWordListBatch(
  cfg: ReturnType<typeof loadConfig>,
  theme: string,
  count: number,
  existingWords: string[],
): Promise<Partial<WordEntry>[]> {
  const excludeNote = existingWords.length > 0
    ? `\n\n注意：不要重复以下已有的单词：${existingWords.join(", ")}`
    : "";

  const prompt = `请为"${theme}"主题生成 ${count} 个英语单词/短语/句式的教学内容。${excludeNote}

要求同上。输出为 JSON 数组格式，每个元素包含 word, phonetic, chineseMeaning, englishMeaning, patterns, patternTranslations, examples 字段。`;

  const maxRetries = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await getAI().models.generateContent({
        model: cfg.models.contentGeneration,
        contents: prompt,
        config: {
          systemInstruction: cfg.prompts.contentGeneration,
          responseMimeType: "application/json",
        },
      });

      const text = response.text;
      if (!text) throw new Error("Gemini Flash 未返回内容");

      const parsed = safeParseJSON(text);
      const arr = Array.isArray(parsed) ? parsed : [parsed];

      return arr.map((data: any) => ({
        word: data.word,
        phonetic: data.phonetic,
        chineseMeaning: data.chineseMeaning,
        englishMeaning: data.englishMeaning,
        patterns: data.patterns,
        patternTranslations: data.patternTranslations || [],
        examples: data.examples,
      }));
    } catch (e: any) {
      lastError = e;
      if (attempt < maxRetries) {
        console.log(`[Content] 第 ${attempt + 1} 次尝试失败，重试中: ${e.message}`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  throw lastError || new Error("生成失败");
}
