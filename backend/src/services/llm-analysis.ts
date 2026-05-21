/**
 * LLM 驱动的剧本分析服务
 * Stage 1: 分析 + 审核 + 用户修改循环
 */

import { generateText, generateTextStream, isTextConfigured } from './ai';
import { logger } from '../utils/logger';

export interface AnalysisChapter {
  title: string;
  content: string;
  order_index: number;
  scenes: AnalysisScene[];
}

export interface AnalysisScene {
  title: string;
  description: string;
  location: string;
  time_of_day: string;
  mood: string;
  atmosphere: string;
  visual_description: string;
  image_prompt: string;
  order_index: number;
  storyboards: AnalysisStoryboard[];
}

export interface AnalysisStoryboard {
  title: string;
  description: string;
  duration: number;
  camera_angle: string;
  camera_movement: string;
  order_index: number;
}

export interface AnalysisCharacter {
  name: string;
  description: string;
  personality: string;
  appearance: string;
  clothing: string;
  distinguishing_features: string;
  age_range: string;
  build: string;
  visual_prompt: string;
  image_prompt: string;
  voice_prompt: string;
}

export interface AnalysisProp {
  name: string;
  description: string;
  image_prompt: string;
}

export interface AnalysisDialogue {
  chapter_index: number;
  scene_index: number;
  storyboard_index: number;
  character_name: string;
  content: string;
  emotion: string;
  action_description: string;
  style: string;
}

export interface ScriptAnalysisResult {
  chapters: AnalysisChapter[];
  characters: AnalysisCharacter[];
  props: AnalysisProp[];
  dialogues: AnalysisDialogue[];
  sentiment: { positive: number; negative: number; neutral: number; dominant: string };
  style_recommendation: string;
  script?: string;
}

export interface ReviewResult {
  approved: boolean;
  issues: string[];
  suggestions: string[];
  revised_result?: ScriptAnalysisResult;
}

const ANALYSIS_PROMPT = `你是一个专业的剧本分析师和视觉叙事专家。请分析以下小说/剧本文本，输出严格的 JSON 格式结果。

要求：
1. 将文本拆分为章节（chapters），每个章节包含多个场景（scenes），每个场景包含多个分镜（storyboards）
2. 提取所有角色信息，包括详细的外貌描述用于 AI 绘图
3. 提取所有对白，标注说话人、情绪、动作描述
4. 为每个场景生成视觉描述用于 AI 背景图生成
5. 分析整体情感倾向
6. 提取剧本中出现的重要道具（如武器、信物、特殊物品等）
7. 生成标准漫剧剧本格式的 script 字段

输出 JSON 格式：
{
  "chapters": [
    {
      "title": "章节标题",
      "content": "章节原文",
      "order_index": 0,
      "scenes": [
        {
          "title": "场景标题",
          "description": "场景描述",
          "location": "地点",
          "time_of_day": "时间（如 黄昏/夜晚/清晨）",
          "mood": "情绪基调",
          "atmosphere": "氛围描述",
          "visual_description": "详细的视觉描述，用于 AI 生成背景图",
          "image_prompt": "英文，用于 AI 生成该场景背景图的完整 prompt",
          "order_index": 0,
          "storyboards": [
            {
              "title": "分镜标题",
              "description": "分镜内容描述",
              "duration": 5.0,
              "camera_angle": "wide/medium/close/extreme_close/low_angle/high_angle/dutch",
              "camera_movement": "static/pan_left/pan_right/tilt_up/tilt_down/dolly_in/dolly_out/zoom_in",
              "order_index": 0
            }
          ]
        }
      ]
    }
  ],
  "characters": [
    {
      "name": "角色名",
      "description": "角色简介",
      "personality": "性格特征",
      "appearance": "外貌特征",
      "clothing": "服装描述",
      "distinguishing_features": "标志性特征（如疤痕、饰品等）",
      "age_range": "年龄段",
      "build": "体型",
      "visual_prompt": "完整的视觉描述 prompt，用于 AI 生成角色图片，需包含：性别、年龄、发型发色、眼睛颜色、肤色、体型、服装、标志性特征。英文。",
      "image_prompt": "与 visual_prompt 相同，英文，用于 AI 绘图",
      "voice_prompt": "声音特征描述，如：低沉磁性的男声，语速缓慢，带有威严感"
    }
  ],
  "props": [
    {
      "name": "道具名",
      "description": "道具描述和在故事中的作用",
      "image_prompt": "英文，用于 AI 生成道具图片的 prompt"
    }
  ],
  "dialogues": [
    {
      "chapter_index": 0,
      "scene_index": 0,
      "storyboard_index": 0,
      "character_name": "说话人",
      "content": "对白内容",
      "emotion": "情绪（如 happy/sad/angry/surprised/calm/nervous）",
      "action_description": "说话时的动作描述",
      "style": "speech/shout/whisper"
    }
  ],
  "sentiment": {
    "positive": 0.3,
    "negative": 0.3,
    "neutral": 0.4,
    "dominant": "neutral"
  },
  "style_recommendation": "推荐的视觉风格（如 anime/realistic/watercolor）",
  "script": "标准漫剧剧本格式文本"
}

## script 字段格式规范（漫剧剧本格式）

script 字段必须按以下格式输出，可直接用于分镜、配音、剪辑：

### 文档头部
作品名：（不写括号补充信息）
题材：
类型：
简略梗概：
主要出场人物
  - 主角：
  - 其他角色：
人物简要描述
  - 角色名：简要描述

受众：
情绪承诺（主）：打脸爽/逆袭爽/虐爽/恐惧爽/治愈爽（只选1）

本集一句话：主角为了【目标】在【规则/限制】下，被【对手/压力】逼到【困境】，最后【变化】并引出【续看问题】
钩子：
增量：
反转/兑现：
续看：

### 分场格式
每场必须包含：
1. 场标题行：场号 场景名 日外/日内/夜外/夜内（如 1-1 妖兽谷 日外）
2. 人物表：人物：角色A、角色B
3. 画面说明（可选）：画面：环境描述
4. 镜头动作 + 台词

### 镜头动作（▲ 开头）
▲近景，角色猛然睁开眼，眼中闪过一丝精光
▲全景，众人围成一圈，气氛紧张

景别：远景/全景/中景/近景/特写

### 台词格式
角色名：台词内容
角色名（情绪）：台词内容
角色名VO：画外音内容
角色名OS：内心独白内容

### 特殊标记
- 【闪回】...【闪出】：回忆片段
- 【切镜】：转场
- 音效：声音效果
- BGM：背景音乐
- 特效：视觉效果
- 字幕：时间/地点字幕
- 系统：系统提示音

### 四段式节奏
1. 钩子段：前10秒必须抓住观众
2. 升级段：每30-60秒需有增量点
3. 反转/爽点段：兑现情绪承诺
4. 续看段：抛出新悬念

注意：
- image_prompt 必须是英文，详细描述，适合 DALL-E 3 生成
- voice_prompt 用中文描述声音特征
- props 数组可以为空（如果剧本中没有重要道具）
- 每个场景至少有 1 个分镜
- 对白的 character_name 必须与 characters 中的 name 完全匹配
- camera_angle 和 camera_movement 必须使用指定的枚举值
- duration 单位为秒，一般 3-8 秒
- script 字段是完整的漫剧剧本，包含所有场景的详细镜头动作和台词
- 请用 \`\`\`json 代码块包裹你的 JSON 输出

以下是待分析的文本：

`;

const REVIEW_PROMPT = `你是一个专业的剧本审核专家。请审核以下剧本分析结果，检查：
1. 章节/场景/分镜结构是否合理
2. 角色信息是否完整（visual_prompt 是否足够详细用于 AI 绘图）
3. 对白是否与角色匹配
4. 场景描述是否有遗漏
5. 道具提取是否完整

请输出严格的 JSON 格式：
{
  "approved": true/false,
  "issues": ["问题1", "问题2"],
  "suggestions": ["建议1", "建议2"],
  "revised_result": null 或完整的修正后的 ScriptAnalysisResult（如果 approved=false）
}

如果 approved=false，必须提供 revised_result，包含修正后的完整数据。

原始文本（前2000字）：
`;

const REVISE_PROMPT = `你是一个专业的剧本编辑。用户对以下剧本分析结果提出了修改意见，请根据意见进行局部修改。

重要：保留大部分未被提及的内容不变，只修改用户指出的部分。

请输出修改后的完整 ScriptAnalysisResult JSON（用 \`\`\`json 代码块包裹）。

用户修改意见：
`;

function fixJSON(text: string): string {
  // 去掉 BOM、零宽字符
  let s = text.replace(/^﻿/, '').replace(/[​‌‍﻿]/g, '');
  // 去掉行尾注释 // ...
  s = s.replace(/\/\/[^\n]*/g, '');
  // 去掉尾部逗号 (对象/数组末尾)
  s = s.replace(/,\s*([\]}])/g, '$1');
  // 单引号 → 双引号（简单替换，仅用于非嵌套场景）
  // 不做单引号替换，避免破坏内容中的引号
  return s;
}

function extractJSON(text: string): any {
  // 1. 直接解析
  try { return JSON.parse(text); } catch {}

  // 2. 修复后直接解析
  try { return JSON.parse(fixJSON(text)); } catch {}

  // 3. 提取 ```json 代码块
  const codeBlockMatches = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/g);
  if (codeBlockMatches) {
    for (const block of codeBlockMatches) {
      const inner = block.replace(/```(?:json)?\s*\n?/, '').replace(/```$/, '').trim();
      try { return JSON.parse(inner); } catch {}
      try { return JSON.parse(fixJSON(inner)); } catch {}
    }
  }

  // 4. 提取最外层 {...}（非贪婪，匹配第一个完整的对象）
  const braceStart = text.indexOf('{');
  if (braceStart !== -1) {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = braceStart; i < text.length; i++) {
      const ch = text[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          const candidate = text.slice(braceStart, i + 1);
          try { return JSON.parse(candidate); } catch {}
          try { return JSON.parse(fixJSON(candidate)); } catch {}
          break;
        }
      }
    }
  }

  // 5. 提取 [...]
  const bracketStart = text.indexOf('[');
  if (bracketStart !== -1) {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = bracketStart; i < text.length; i++) {
      const ch = text[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '[') depth++;
      if (ch === ']') {
        depth--;
        if (depth === 0) {
          const candidate = text.slice(bracketStart, i + 1);
          try { return JSON.parse(candidate); } catch {}
          try { return JSON.parse(fixJSON(candidate)); } catch {}
          break;
        }
      }
    }
  }

  logger.error('JSON 提取失败，原始响应前500字:', text.substring(0, 500));
  throw new Error('无法从 LLM 响应中提取有效 JSON');
}

function chunkText(text: string, maxChunkSize: number): string[] {
  if (text.length <= maxChunkSize) return [text];
  const chunks: string[] = [];
  const paragraphs = text.split(/\n\s*\n/);
  let current = '';
  for (const para of paragraphs) {
    if (current.length + para.length > maxChunkSize && current.length > 0) {
      chunks.push(current.trim());
      current = '';
    }
    current += para + '\n\n';
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function mergeResults(results: ScriptAnalysisResult[]): ScriptAnalysisResult {
  if (results.length === 1) return results[0];

  const merged: ScriptAnalysisResult = {
    chapters: [],
    characters: [],
    props: [],
    dialogues: [],
    sentiment: { positive: 0, negative: 0, neutral: 0, dominant: 'neutral' },
    style_recommendation: results[0].style_recommendation,
  };

  let chapterOffset = 0;
  const characterMap = new Map<string, AnalysisCharacter>();
  const propMap = new Map<string, AnalysisProp>();

  for (const result of results) {
    for (const chapter of result.chapters) {
      merged.chapters.push({
        ...chapter,
        order_index: chapter.order_index + chapterOffset,
        scenes: chapter.scenes.map(scene => ({ ...scene, storyboards: scene.storyboards.map(sb => sb) })),
      });
    }
    chapterOffset += result.chapters.length;

    for (const char of result.characters) {
      if (!characterMap.has(char.name)) characterMap.set(char.name, char);
    }

    for (const prop of (result.props || [])) {
      if (!propMap.has(prop.name)) propMap.set(prop.name, prop);
    }

    merged.dialogues.push(...result.dialogues);
    merged.sentiment.positive += result.sentiment.positive;
    merged.sentiment.negative += result.sentiment.negative;
    merged.sentiment.neutral += result.sentiment.neutral;
  }

  merged.characters = Array.from(characterMap.values());
  merged.props = Array.from(propMap.values());
  merged.sentiment.positive /= results.length;
  merged.sentiment.negative /= results.length;
  merged.sentiment.neutral /= results.length;

  const { positive, negative, neutral } = merged.sentiment;
  if (positive >= negative && positive >= neutral) merged.sentiment.dominant = 'positive';
  else if (negative >= positive && negative >= neutral) merged.sentiment.dominant = 'negative';
  else merged.sentiment.dominant = 'neutral';

  return merged;
}

export async function analyzeScriptWithLLM(
  text: string,
  style?: string,
  opts?: { api_key?: string; base_url?: string; model?: string },
  episodeContext?: { episodeNumber: number; episodeTitle: string }
): Promise<ScriptAnalysisResult> {
  if (!opts?.api_key && !isTextConfigured()) {
    throw new Error('AI 文本分析未配置，请设置 AI_TEXT_API_KEY 或 AI_API_KEY');
  }

  const maxChunkSize = 8000;
  const chunks = chunkText(text, maxChunkSize);
  logger.info(`LLM 分析: 文本 ${text.length} 字，分为 ${chunks.length} 个块`);

  const results: ScriptAnalysisResult[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const contextPrefix = chunks.length > 1
      ? `[这是第 ${i + 1}/${chunks.length} 部分，请只分析此部分内容]\n\n`
      : '';

    const episodePrefix = episodeContext
      ? `[当前正在分析第 ${episodeContext.episodeNumber} 集：${episodeContext.episodeTitle}]\n\n`
      : '';

    const prompt = contextPrefix + episodePrefix + ANALYSIS_PROMPT + chunk;

    try {
      const raw = await generateText(prompt, {
        temperature: 0.3,
        api_key: opts?.api_key,
        base_url: opts?.base_url,
        model: opts?.model,
      });

      const parsed = extractJSON(raw) as ScriptAnalysisResult;

      if (!parsed.chapters || !Array.isArray(parsed.chapters)) {
        throw new Error('LLM 返回数据缺少 chapters');
      }
      if (!parsed.characters || !Array.isArray(parsed.characters)) parsed.characters = [];
      if (!parsed.props || !Array.isArray(parsed.props)) parsed.props = [];
      if (!parsed.dialogues || !Array.isArray(parsed.dialogues)) parsed.dialogues = [];
      if (!parsed.sentiment) {
        parsed.sentiment = { positive: 0.33, negative: 0.33, neutral: 0.34, dominant: 'neutral' };
      }

      results.push(parsed);
    } catch (err: any) {
      logger.error(`LLM 分析第 ${i + 1} 块失败:`, err.message);
      throw new Error(`LLM 剧本分析失败: ${err.message}`);
    }
  }

  const merged = mergeResults(results);
  logger.info(`LLM 分析完成: ${merged.chapters.length} 章, ${merged.characters.length} 角色, ${merged.props.length} 道具, ${merged.dialogues.length} 对白`);
  return merged;
}

export async function reviewScriptWithLLM(
  result: ScriptAnalysisResult,
  originalText: string,
  opts?: { api_key?: string; base_url?: string; model?: string }
): Promise<ReviewResult> {
  const textPreview = originalText.substring(0, 2000);
  const prompt = REVIEW_PROMPT + textPreview + '\n\n当前分析结果：\n```json\n' + JSON.stringify(result, null, 2) + '\n```';

  try {
    const raw = await generateText(prompt, {
      temperature: 0.2,
      api_key: opts?.api_key,
      base_url: opts?.base_url,
      model: opts?.model,
    });

    const parsed = extractJSON(raw) as ReviewResult;

    if (typeof parsed.approved !== 'boolean') {
      return { approved: true, issues: [], suggestions: [] };
    }

    if (!parsed.issues || !Array.isArray(parsed.issues)) parsed.issues = [];
    if (!parsed.suggestions || !Array.isArray(parsed.suggestions)) parsed.suggestions = [];

    return parsed;
  } catch (err: any) {
    logger.error('LLM 审核失败:', err.message);
    return { approved: true, issues: [`审核过程出错: ${err.message}`], suggestions: [] };
  }
}

export async function reviseScriptWithLLM(
  currentResult: ScriptAnalysisResult,
  feedback: string,
  opts?: { api_key?: string; base_url?: string; model?: string }
): Promise<ScriptAnalysisResult> {
  const prompt = REVISE_PROMPT + feedback + '\n\n当前分析结果：\n```json\n' + JSON.stringify(currentResult, null, 2) + '\n```';

  try {
    const raw = await generateText(prompt, {
      temperature: 0.3,
      api_key: opts?.api_key,
      base_url: opts?.base_url,
      model: opts?.model,
    });

    const parsed = extractJSON(raw) as ScriptAnalysisResult;

    if (!parsed.chapters || !Array.isArray(parsed.chapters)) {
      throw new Error('修改后的结果缺少 chapters');
    }
    if (!parsed.characters) parsed.characters = currentResult.characters;
    if (!parsed.props) parsed.props = currentResult.props;
    if (!parsed.dialogues) parsed.dialogues = currentResult.dialogues;
    if (!parsed.sentiment) parsed.sentiment = currentResult.sentiment;

    return parsed;
  } catch (err: any) {
    logger.error('LLM 修改失败:', err.message);
    throw new Error(`剧本修改失败: ${err.message}`);
  }
}

// ==================== Streaming versions ====================

/**
 * 流式剧本分析，通过 onChunk 回调实时返回 LLM 输出
 */
export async function analyzeScriptWithLLMStream(
  text: string,
  style: string | undefined,
  opts: { api_key?: string; base_url?: string; model?: string } | undefined,
  onChunk: (chunk: string) => void,
  episodeContext?: { episodeNumber: number; episodeTitle: string }
): Promise<ScriptAnalysisResult> {
  if (!opts?.api_key && !isTextConfigured()) {
    throw new Error('AI 文本分析未配置，请设置 AI_TEXT_API_KEY 或 AI_API_KEY');
  }

  const maxChunkSize = 8000;
  const chunks = chunkText(text, maxChunkSize);
  logger.info(`LLM 流式分析: 文本 ${text.length} 字，分为 ${chunks.length} 个块`);

  const results: ScriptAnalysisResult[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const contextPrefix = chunks.length > 1
      ? `[这是第 ${i + 1}/${chunks.length} 部分，请只分析此部分内容]\n\n`
      : '';

    if (chunks.length > 1) {
      onChunk(`\n\n--- 正在分析第 ${i + 1}/${chunks.length} 部分 ---\n\n`);
    }

    const episodePrefix = episodeContext
      ? `[当前正在分析第 ${episodeContext.episodeNumber} 集：${episodeContext.episodeTitle}]\n\n`
      : '';

    const prompt = contextPrefix + episodePrefix + ANALYSIS_PROMPT + chunk;
    let raw = '';

    try {
      for await (const token of generateTextStream(prompt, {
        temperature: 0.3,
        api_key: opts?.api_key,
        base_url: opts?.base_url,
        model: opts?.model,
      })) {
        raw += token;
        onChunk(token);
      }

      const parsed = extractJSON(raw) as ScriptAnalysisResult;

      if (!parsed.chapters || !Array.isArray(parsed.chapters)) {
        throw new Error('LLM 返回数据缺少 chapters');
      }
      if (!parsed.characters || !Array.isArray(parsed.characters)) parsed.characters = [];
      if (!parsed.props || !Array.isArray(parsed.props)) parsed.props = [];
      if (!parsed.dialogues || !Array.isArray(parsed.dialogues)) parsed.dialogues = [];
      if (!parsed.sentiment) {
        parsed.sentiment = { positive: 0.33, negative: 0.33, neutral: 0.34, dominant: 'neutral' };
      }

      results.push(parsed);
    } catch (err: any) {
      logger.error(`LLM 流式分析第 ${i + 1} 块失败:`, err.message);
      throw new Error(`LLM 剧本分析失败: ${err.message}`);
    }
  }

  const merged = mergeResults(results);
  logger.info(`LLM 流式分析完成: ${merged.chapters.length} 章, ${merged.characters.length} 角色`);
  return merged;
}

/**
 * 流式剧本审核，通过 onChunk 回调实时返回 LLM 输出
 */
export async function reviewScriptWithLLMStream(
  result: ScriptAnalysisResult,
  originalText: string,
  opts: { api_key?: string; base_url?: string; model?: string } | undefined,
  onChunk: (chunk: string) => void
): Promise<ReviewResult> {
  const textPreview = originalText.substring(0, 2000);
  const prompt = REVIEW_PROMPT + textPreview + '\n\n当前分析结果：\n```json\n' + JSON.stringify(result, null, 2) + '\n```';

  let raw = '';
  try {
    for await (const token of generateTextStream(prompt, {
      temperature: 0.2,
      api_key: opts?.api_key,
      base_url: opts?.base_url,
      model: opts?.model,
    })) {
      raw += token;
      onChunk(token);
    }

    const parsed = extractJSON(raw) as ReviewResult;

    if (typeof parsed.approved !== 'boolean') {
      return { approved: true, issues: [], suggestions: [] };
    }
    if (!parsed.issues || !Array.isArray(parsed.issues)) parsed.issues = [];
    if (!parsed.suggestions || !Array.isArray(parsed.suggestions)) parsed.suggestions = [];

    return parsed;
  } catch (err: any) {
    logger.error('LLM 流式审核失败:', err.message);
    return { approved: true, issues: [`审核过程出错: ${err.message}`], suggestions: [] };
  }
}

/**
 * 流式剧本修改，通过 onChunk 回调实时返回 LLM 输出
 */
export async function reviseScriptWithLLMStream(
  currentResult: ScriptAnalysisResult,
  feedback: string,
  opts: { api_key?: string; base_url?: string; model?: string } | undefined,
  onChunk: (chunk: string) => void
): Promise<ScriptAnalysisResult> {
  const prompt = REVISE_PROMPT + feedback + '\n\n当前分析结果：\n```json\n' + JSON.stringify(currentResult, null, 2) + '\n```';

  let raw = '';
  try {
    for await (const token of generateTextStream(prompt, {
      temperature: 0.3,
      api_key: opts?.api_key,
      base_url: opts?.base_url,
      model: opts?.model,
    })) {
      raw += token;
      onChunk(token);
    }

    const parsed = extractJSON(raw) as ScriptAnalysisResult;

    if (!parsed.chapters || !Array.isArray(parsed.chapters)) {
      throw new Error('修改后的结果缺少 chapters');
    }
    if (!parsed.characters) parsed.characters = currentResult.characters;
    if (!parsed.props) parsed.props = currentResult.props;
    if (!parsed.dialogues) parsed.dialogues = currentResult.dialogues;
    if (!parsed.sentiment) parsed.sentiment = currentResult.sentiment;

    return parsed;
  } catch (err: any) {
    logger.error('LLM 流式修改失败:', err.message);
    throw new Error(`剧本修改失败: ${err.message}`);
  }
}

// ==================== Episode Suggestion ====================

export interface EpisodeBreak {
  episode_number: number;
  title: string;
  start_char: number;
  end_char: number;
  summary: string;
}

export interface EpisodeSuggestion {
  suggested_episodes: number;
  recommended_minutes: number;
  episode_breaks: EpisodeBreak[];
  reasoning: string;
}

const SUGGEST_EPISODES_PROMPT = `你是一个专业的短视频编剧和内容策划专家。请分析以下小说文本，建议将其拆分为多少集短剧，每集多长时间。

考虑因素：
1. 自然的故事弧线断裂点（悬念、转折、高潮）
2. 角色出场和发展的节奏
3. 每集需要有独立的小高潮或悬念（钩子）
4. 短剧平台的常见时长（1-5分钟/集）
5. 文本总长度和内容密度

输出严格的 JSON 格式：
{
  "suggested_episodes": 5,
  "recommended_minutes": 3.0,
  "episode_breaks": [
    {
      "episode_number": 1,
      "title": "集标题",
      "start_char": 0,
      "end_char": 2000,
      "summary": "本集内容简介，包含主要事件和悬念"
    }
  ],
  "reasoning": "整体拆分理由说明"
}

注意：
- start_char 和 end_char 是原文字符偏移量，用于切分文本
- 每集建议 2-5 分钟
- episode_breaks 数组长度必须等于 suggested_episodes
- end_char 不能超过文本总长度
- 请用 \`\`\`json 代码块包裹你的 JSON 输出

以下是小说文本：

`;

export async function suggestEpisodes(
  text: string,
  opts?: { api_key?: string; base_url?: string; model?: string }
): Promise<EpisodeSuggestion> {
  if (!opts?.api_key && !isTextConfigured()) {
    throw new Error('AI 文本分析未配置');
  }

  // Truncate to reasonable length for suggestion
  const maxLen = 15000;
  const truncated = text.length > maxLen ? text.substring(0, maxLen) + '...(文本已截取前15000字)' : text;

  const prompt = SUGGEST_EPISODES_PROMPT + truncated;

  try {
    const raw = await generateText(prompt, {
      temperature: 0.4,
      api_key: opts?.api_key,
      base_url: opts?.base_url,
      model: opts?.model,
    });

    const parsed = extractJSON(raw) as EpisodeSuggestion;

    // Validate
    if (!parsed.suggested_episodes || parsed.suggested_episodes < 1) {
      parsed.suggested_episodes = 1;
    }
    if (!parsed.recommended_minutes || parsed.recommended_minutes < 1) {
      parsed.recommended_minutes = 3.0;
    }
    if (!Array.isArray(parsed.episode_breaks)) {
      parsed.episode_breaks = [];
    }
    if (!parsed.reasoning) {
      parsed.reasoning = '';
    }

    // Clamp end_char to text length
    for (const ep of parsed.episode_breaks) {
      if (ep.end_char > text.length) ep.end_char = text.length;
      if (ep.start_char < 0) ep.start_char = 0;
    }

    logger.info(`Episode suggestion: ${parsed.suggested_episodes} episodes, ${parsed.recommended_minutes} min each`);
    return parsed;
  } catch (err: any) {
    logger.error('LLM 集数建议失败:', err.message);
    throw new Error(`集数建议失败: ${err.message}`);
  }
}
