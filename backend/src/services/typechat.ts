import { createJsonTranslator, createOpenAILanguageModel, TypeChatJsonValidator } from 'typechat';
import { logger } from '../utils/logger';

function success<T>(data: T): { success: true; data: T } { return { success: true, data }; }
function errorMsg(message: string): { success: false; message: string } { return { success: false, message }; }

function createValidator<T extends object>(schema: string, typeName: string): TypeChatJsonValidator<T> {
  return {
    getSchemaText: () => schema,
    getTypeName: () => typeName,
    validate(jsonObject: object) {
      if (typeof jsonObject !== 'object' || jsonObject === null) {
        return errorMsg('Response is not a JSON object');
      }
      return success(jsonObject as T);
    }
  };
}

function env(key: string, fallback?: string): string {
  return process.env[key] || fallback || '';
}

// TypeChat schema 字符串 — 分析结果
const SCRIPT_ANALYSIS_SCHEMA = `
interface Storyboard {
  title: string;
  description: string;
  duration: number;
  camera_angle: string;
  camera_movement: string;
  order_index: number;
}

interface Scene {
  title: string;
  description: string;
  location: string;
  time_of_day: string;
  mood: string;
  atmosphere: string;
  visual_description: string;
  image_prompt: string;
  order_index: number;
  storyboards: Storyboard[];
}

interface Chapter {
  title: string;
  content: string;
  order_index: number;
  scenes: Scene[];
}

interface Character {
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

interface Prop {
  name: string;
  description: string;
  image_prompt: string;
}

interface Dialogue {
  chapter_index: number;
  scene_index: number;
  storyboard_index: number;
  character_name: string;
  content: string;
  emotion: string;
  action_description: string;
  style: string;
}

interface Sentiment {
  positive: number;
  negative: number;
  neutral: number;
  dominant: string;
}

interface ScriptAnalysis {
  chapters: Chapter[];
  characters: Character[];
  props: Prop[];
  dialogues: Dialogue[];
  sentiment: Sentiment;
  style_recommendation: string;
  script: string;
}
`;

// TypeChat schema 字符串 — 集数建议
const EPISODE_SUGGESTION_SCHEMA = `
interface EpisodeBreak {
  episode_number: number;
  title: string;
  start_char: number;
  end_char: number;
  summary: string;
}

interface EpisodeSuggestion {
  suggested_episodes: number;
  recommended_minutes: number;
  episode_breaks: EpisodeBreak[];
  reasoning: string;
}
`;

// TypeChat schema 字符串 — 剧本审核
const SCRIPT_REVIEW_SCHEMA = `
interface ScriptReview {
  approved: boolean;
  issues: string[];
  suggestions: string[];
}
`;

// TypeScript 接口 — 用于代码类型检查
export interface ScriptAnalysis {
  chapters: Array<{
    title: string;
    content: string;
    order_index: number;
    scenes: Array<{
      title: string;
      description: string;
      location: string;
      time_of_day: string;
      mood: string;
      atmosphere: string;
      visual_description: string;
      image_prompt: string;
      order_index: number;
      storyboards: Array<{
        title: string;
        description: string;
        duration: number;
        camera_angle: string;
        camera_movement: string;
        order_index: number;
      }>;
    }>;
  }>;
  characters: Array<{
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
  }>;
  props: Array<{
    name: string;
    description: string;
    image_prompt: string;
  }>;
  dialogues: Array<{
    chapter_index: number;
    scene_index: number;
    storyboard_index: number;
    character_name: string;
    content: string;
    emotion: string;
    action_description: string;
    style: string;
  }>;
  sentiment: { positive: number; negative: number; neutral: number; dominant: string };
  style_recommendation: string;
  script: string;
}

export interface EpisodeSuggestion {
  suggested_episodes: number;
  recommended_minutes: number;
  episode_breaks: Array<{
    episode_number: number;
    title: string;
    start_char: number;
    end_char: number;
    summary: string;
  }>;
  reasoning: string;
}

export interface ScriptReview {
  approved: boolean;
  issues: string[];
  suggestions: string[];
}

function createModel(apiKey?: string, baseUrl?: string, model?: string) {
  const key = apiKey || env('AI_TEXT_API_KEY') || env('AI_API_KEY');
  const base = (baseUrl || env('AI_TEXT_BASE_URL') || env('AI_BASE_URL', 'https://api.openai.com/v1')).replace(/\/+$/, '');
  const endPoint = base.endsWith('/chat/completions') ? base : base + '/chat/completions';
  return createOpenAILanguageModel(key, model || env('AI_TEXT_MODEL', 'gpt-4o'), endPoint);
}

/**
 * TypeChat 分析剧本 — 自动验证 + 修复 JSON
 */
export async function analyzeWithTypeChat(
  text: string,
  style: string,
  opts?: { api_key?: string; base_url?: string; model?: string }
): Promise<ScriptAnalysis> {
  const model = createModel(opts?.api_key, opts?.base_url, opts?.model);
  const validator = createValidator<ScriptAnalysis>(SCRIPT_ANALYSIS_SCHEMA, 'ScriptAnalysis');
  const translator = createJsonTranslator<ScriptAnalysis>(model, validator);

  const prompt = `分析以下小说文本，提取章节、场景、分镜、角色、对白、道具信息，并生成漫剧剧本。

风格偏好：${style}

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

文本：
${text}`;

  logger.info('TypeChat 分析开始');

  const result = await translator.translate(prompt);

  if (!result.success) {
    logger.error('TypeChat 分析失败:', result.message);
    throw new Error(`TypeChat 分析失败: ${result.message}`);
  }

  logger.info(`TypeChat 分析完成: ${result.data.chapters?.length || 0} chapters`);
  return result.data;
}

/**
 * TypeChat 建议集数
 */
export async function suggestEpisodesWithTypeChat(
  text: string,
  opts?: { api_key?: string; base_url?: string; model?: string }
): Promise<EpisodeSuggestion> {
  const model = createModel(opts?.api_key, opts?.base_url, opts?.model);
  const validator = createValidator<EpisodeSuggestion>(EPISODE_SUGGESTION_SCHEMA, 'EpisodeSuggestion');
  const translator = createJsonTranslator<EpisodeSuggestion>(model, validator);

  const maxLen = 15000;
  const truncated = text.length > maxLen ? text.substring(0, maxLen) + '...(文本已截取前15000字)' : text;

  const prompt = `分析以下小说文本，建议拆分为多少集短剧，每集多长时间。
考虑：自然故事弧线断裂点、角色发展节奏、每集需要独立高潮或悬念、短剧平台常见时长。

文本：
${truncated}`;

  logger.info('TypeChat 集数建议开始');

  const result = await translator.translate(prompt);

  if (!result.success) {
    logger.error('TypeChat 集数建议失败:', result.message);
    throw new Error(`TypeChat 集数建议失败: ${result.message}`);
  }

  logger.info(`TypeChat 集数建议: ${result.data.suggested_episodes} episodes`);
  return result.data;
}

/**
 * TypeChat 审核剧本
 */
export async function reviewWithTypeChat(
  analysisJson: string,
  originalText: string,
  opts?: { api_key?: string; base_url?: string; model?: string }
): Promise<ScriptReview> {
  const model = createModel(opts?.api_key, opts?.base_url, opts?.model);
  const validator = createValidator<ScriptReview>(SCRIPT_REVIEW_SCHEMA, 'ScriptReview');
  const translator = createJsonTranslator<ScriptReview>(model, validator);

  const prompt = `审核以下剧本分析结果，检查结构合理性、角色完整性、对白匹配度。

分析结果：
${analysisJson}

原文（前2000字）：
${originalText.substring(0, 2000)}`;

  logger.info('TypeChat 审核开始');

  const result = await translator.translate(prompt);

  if (!result.success) {
    logger.error('TypeChat 审核失败:', result.message);
    throw new Error(`TypeChat 审核失败: ${result.message}`);
  }

  logger.info(`TypeChat 审核完成: approved=${result.data.approved}`);
  return result.data;
}
