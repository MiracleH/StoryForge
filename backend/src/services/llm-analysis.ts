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
  seedance_prompt: string;
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
}

export interface ReviseResult {
  script: string;
  chapters: AnalysisChapter[];
  characters: AnalysisCharacter[];
  props: AnalysisProp[];
  dialogues: AnalysisDialogue[];
  sentiment: { positive: number; negative: number; neutral: number; dominant: string };
  style_recommendation: string;
}

const ANALYSIS_PROMPT = `你是一个专业的剧本分析师和视觉叙事专家。请分析以下小说/剧本文本，输出严格的 JSON 格式结果。

要求：
1. 将文本拆分为章节（chapters），每个章节包含多个场景（scenes），每个场景包含多个分镜（storyboards）
2. 提取所有角色信息，包括详细的外貌描述用于 AI 绘图
3. 提取所有对白，标注说话人、情绪、动作描述
4. 为每个场景生成视觉描述用于 AI 背景图生成
5. 分析整体情感倾向
6. 提取剧本中出现的重要道具（如武器、信物、特殊物品等）
7. 生成 Seedance 2.0 格式的 script 字段（△镜头格式）

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
          "image_prompt": "[风格前缀]，[详细视觉描述]，[技术规格]。示例：Cinematic photorealistic style with dramatic lighting, ancient Chinese fortress in heavy snow, dark sky, cold atmosphere, 8K detail",
          "order_index": 0,
          "storyboards": [
            {
              "title": "分镜标题",
              "description": "分镜内容描述",
              "duration": 3,
              "camera_angle": "wide/medium/close/extreme_close/low_angle/high_angle/dutch",
              "camera_movement": "static/pan_left/pan_right/tilt_up/tilt_down/dolly_in/dolly_out/zoom_in",
              "time_range": "0-3秒",
              "seedance_prompt": "Seedance 2.0 格式的分镜提示词，包含：景别+运镜+画面描述+氛围。示例：中景推近，角色猛然抬头，眼中怒火燃烧，杀气冲天",
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
      "image_prompt": "格式：[风格前缀]，[详细视觉描述]，[技术规格]。示例：Chinese ink wash painting style mixed with anime cel-shading, a weathered warrior in his 30s with sharp features, wearing tattered cotton robe, holding a spear, high quality, detailed, full body, character design sheet",
      "voice_prompt": "声音特征描述，如：低沉磁性的男声，语速缓慢，带有威严感"
    }
  ],
  "props": [
    {
      "name": "道具名",
      "description": "道具描述和在故事中的作用",
      "image_prompt": "格式：[风格前缀]，[详细视觉描述]，[技术规格]。示例：Cinematic photorealistic style, ancient Chinese spear with silver blade and wooden shaft, weathered and battle-scarred, high quality, detailed"
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
  "style_recommendation": "推荐的视觉风格（如 anime/realistic/cinematic/ink_wash/watercolor）",
  "script": "Seedance 2.0 格式的完整剧本"
}

## script 字段格式规范（Seedance 2.0 格式）

script 字段必须按以下格式输出，可直接用于 Seedance 2.0 分镜、配音、剪辑：

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

### 分集格式（每集必须严格遵循）

第X集
X-X [日/夜] [内/外] [场景名称]
道具：[关键道具列表]
出场人物：[本场角色]

△ 【空镜/开场镜头】[详细镜头描述，包含景别、运镜、构图、光影、氛围]
△ [景别+运镜]，[画面描述]，[氛围营造]
角色名（os）：[内心独白/画外音]
△ [反应镜头描述]
角色名（对白/动作描述）：[台词内容]
△ [动作/情节描述]
【字幕：xxx】[需要屏幕文字时]
△ [场景继续]
△ 【闪回】[回忆场景描述]
[闪回内容]
【闪回结束】
△ [回到现实]
角色名（vo）：[画外音，人物不在画面中]
△ [高潮动作]
△ 【空镜】[结尾氛围镜头]
【字幕：xxx】

### 镜头语言规范（△ 开头）

每个镜头必须以 △ 开头，每个镜头固定 3 秒，时间轴连续不重叠（0-3秒, 3-6秒, 6-9秒...），包含具体的景别和运镜：

**景别：** 远景/全景/中景/近景/特写/大特写
**运镜：** 推镜头/拉镜头/摇镜头/移镜头/跟镜头/环绕镜头/升降镜头/希区柯克变焦/一镜到底/手持晃动
**组合示例：**
- △ 中景推近，角色猛然抬头，眼中怒火燃烧
- △ 特写环绕，刀刃上的血珠缓缓滑落
- △ 远景俯拍，茫茫雪原中一行孤寂的脚印
- △ 快速推近，枪尖直刺镜头
- △ 缓慢拉远，角色背影渐行渐远

### 台词格式

角色名（os）：内心独白/画外音（角色在画面中，内心声音）
角色名（vo）：画外音（角色不在画面中）
角色名（情绪）：带情绪的对白（如：惊/怒/喜/颤抖/冷笑）
角色名：普通对白

### 特殊标记

- 【空镜】— 建立氛围的无人物镜头
- 【闪回】/【闪回结束】— 回忆片段
- 【字幕：xxx】— 屏幕文字/标题
- → 用于动作序列：林冲一枪刺穿敌胸 → 鲜血喷溅 → 雪地染红

### 感官细节要求

- 视觉：颜色、光影、构图、氛围（如：水墨色的背景、火光映红门缝）
- 听觉：声音描述融入镜头（如：狂风呼啸、脚步踩雪的咯吱声）
- 触觉：寒冷、疼痛、质感（如：寒气刺骨、指节因用力而泛白）

### 四段式节奏
1. 钩子段：前10秒必须抓住观众
2. 升级段：每30-60秒需有增量点
3. 反转/爽点段：兑现情绪承诺
4. 续看段：抛出新悬念

注意：
- image_prompt 必须包含风格前缀 + 详细视觉描述，适合 AI 图像生成
- voice_prompt 用中文描述声音特征
- props 数组可以为空（如果剧本中没有重要道具）
- 每个场景至少有 1 个分镜
- 对白的 character_name 必须与 characters 中的 name 完全匹配
- camera_angle 和 camera_movement 必须使用指定的枚举值
- seedance_prompt 是该分镜的 Seedance 2.0 提示词，包含景别+运镜+画面+氛围
- duration 固定为 3 秒，时间轴连续不重叠（0-3秒, 3-6秒, 6-9秒...）
- script 字段是完整的 Seedance 2.0 格式剧本，包含 △ 镜头描述、对白、OS/VO、闪回、字幕
- 请用 \`\`\`json 代码块包裹你的 JSON 输出

以下是待分析的文本：

`;

const REVIEW_PROMPT = `你是一个专业的短剧剧本审核专家。请审核以下 Seedance 2.0 格式剧本，检查：

1. **结构节奏**：是否遵循四段式节奏（钩子段→升级段→反转/爽点段→续看段），每 30-60 秒是否有增量点
2. **镜头质量**：△镜头描述是否包含景别（远景/全景/中景/近景/特写）、运镜方式、画面细节、氛围营造
3. **对白质量**：台词是否与角色性格匹配，是否有冗余对话，信息密度是否足够
4. **场景衔接**：场景之间过渡是否流畅，昼夜内外景安排是否合理
5. **完整性**：道具、出场人物标注是否齐全

请输出严格的 JSON 格式（用 \`\`\`json 代码块包裹）：
{
  "approved": true或false,
  "issues": ["具体问题1", "具体问题2"],
  "suggestions": ["改进建议1", "改进建议2"]
}

不需要返回 revised_result 字段。

原始小说文本（前2000字，供参考）：
`;

const REVISE_PROMPT = `你是一个专业的短剧剧本编辑。用户对以下 Seedance 2.0 格式剧本提出了修改意见，请根据意见进行局部修改。

重要要求：
1. 保留大部分未被提及的内容不变，只修改用户指出的部分
2. 在 \`\`\`seedance 代码块中输出修改后的完整 Seedance 2.0 格式剧本
3. 在 \`\`\`json 代码块中输出完整的 ScriptAnalysisResult JSON，包含从修改后剧本中提取的 chapters、scenes、storyboards、dialogues、characters、props
4. chapters/scenes/storyboards 必须与 seedance 代码块中的内容完全对应，不能凭空编造不存在的镜头

用户修改意见：
`;

function fixJSON(text: string): string {
  // 去掉 BOM、零宽字符
  let s = text.replace(/^﻿/, '').replace(/[​‌‍﻿]/g, '');
  // 去掉行尾注释 // ...
  s = s.replace(/\/\/[^\n]*/g, '');
  // 去掉尾部逗号 (对象/数组末尾)
  s = s.replace(/,\s*([\]}])/g, '$1');
  return s;
}

function repairTruncatedJSON(text: string): string {
  let s = fixJSON(text);
  // 去掉末尾不完整的 key-value（如 "key": "未完成的值...）
  s = s.replace(/,\s*"[^"]*":\s*"[^"]*$/, '');
  s = s.replace(/,\s*"[^"]*":\s*$/, '');
  // 追踪括号栈，确保按正确逆序闭合
  const stack: ('{' | '[')[] = [];
  let inString = false, escape = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') stack.push('{');
    else if (ch === '[') stack.push('[');
    else if (ch === '}') { if (stack[stack.length - 1] === '{') stack.pop(); }
    else if (ch === ']') { if (stack[stack.length - 1] === '[') stack.pop(); }
  }
  // 如果在字符串中被截断，先关闭字符串
  if (inString) s += '"';
  // 去掉末尾悬挂的逗号
  s = s.replace(/,\s*$/, '');
  // 按逆序闭合括号
  for (let i = stack.length - 1; i >= 0; i--) {
    s += stack[i] === '{' ? '}' : ']';
  }
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
      try { return JSON.parse(repairTruncatedJSON(inner)); } catch {}
    }
  }

  // 3b. 未闭合的 ```json 代码块（LLM 输出被截断）
  const unclosedBlock = text.match(/```(?:json)?\s*\n?([\s\S]+)$/);
  if (unclosedBlock && !codeBlockMatches) {
    const inner = unclosedBlock[1].trim();
    try { return JSON.parse(inner); } catch {}
    try { return JSON.parse(fixJSON(inner)); } catch {}
    try { return JSON.parse(repairTruncatedJSON(inner)); } catch {}
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

  // 6. 尝试修复截断的 JSON（LLM 输出被 max_tokens 截断时）
  const braceStart2 = text.indexOf('{');
  if (braceStart2 !== -1) {
    const truncated = text.slice(braceStart2);
    try {
      const repaired = repairTruncatedJSON(truncated);
      const result = JSON.parse(repaired);
      logger.warn('JSON 通过截断修复成功解析');
      return result;
    } catch {}
  }

  // 7. 激进修复：把单引号换双引号，加引号给无引号 key
  try {
    let aggressive = text;
    // 提取 { } 之间的内容
    const m = aggressive.match(/\{[\s\S]*\}/);
    if (m) aggressive = m[0];
    // 单引号字符串 → 双引号
    aggressive = aggressive.replace(/'([^']*)'/g, (_, inner) => `"${inner.replace(/"/g, '\\"')}"`);
    // 无引号的 key: word:
    aggressive = aggressive.replace(/([{,]\s*)([a-zA-Z_]\w*)\s*:/g, '$1"$2":');
    // 尾部逗号
    aggressive = aggressive.replace(/,\s*([}\]])/g, '$1');
    const result = JSON.parse(aggressive);
    logger.warn('JSON 通过激进修复成功解析');
    return result;
  } catch {}

  const preview = text.substring(0, 300).replace(/\n/g, '\\n');
  logger.error('JSON 提取失败，原始响应前500字:', text.substring(0, 500));
  logger.error('JSON 提取失败，原始响应后500字:', text.substring(text.length - 500));
  throw new Error(`无法从 LLM 响应中提取有效 JSON。响应开头: ${preview}...`);
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

    // 对白索引需要加上偏移量，与 chapters 的 order_index 对齐
    for (const d of (result.dialogues || [])) {
      merged.dialogues.push({
        ...d,
        chapter_index: d.chapter_index + (chapterOffset - result.chapters.length),
      });
    }

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

  const episodePrefix = episodeContext
    ? `[当前正在分析第 ${episodeContext.episodeNumber} 集：${episodeContext.episodeTitle}]\n\n`
    : '';

  const prompt = episodePrefix + ANALYSIS_PROMPT + text;
  logger.info(`LLM 分析: 文本 ${text.length} 字, prompt 总长 ${prompt.length} 字`);

  try {
    const raw = await generateText(prompt, {
      temperature: 0.3,
      api_key: opts?.api_key,
      base_url: opts?.base_url,
      model: opts?.model,
    });

    const parsed = extractJSON(raw) as ScriptAnalysisResult;

    if (!parsed.chapters || !Array.isArray(parsed.chapters)) {
      const keys = Object.keys(parsed || {});
      logger.error(`LLM 返回 JSON keys: [${keys.join(', ')}], raw 长度: ${raw.length}, 末尾100字: ${raw.slice(-100)}`);
      function findChapters(obj: any, depth: number = 0): { key: string; val: any } | null {
        if (!obj || typeof obj !== 'object' || depth > 5) return null;
        for (const k of Object.keys(obj)) {
          const v = obj[k];
          if (v && typeof v === 'object' && Array.isArray(v.chapters)) return { key: k, val: v };
        }
        for (const k of Object.keys(obj)) {
          const v = obj[k];
          if (v && typeof v === 'object' && !Array.isArray(v)) {
            const found = findChapters(v, depth + 1);
            if (found) return found;
          }
        }
        return null;
      }
      const found = findChapters(parsed);
      if (found) {
        logger.info(`从嵌套路径中找到 chapters (key: "${found.key}")`);
        Object.assign(parsed, found.val);
      }
      if (!parsed.chapters || !Array.isArray(parsed.chapters)) {
        const preview = JSON.stringify(parsed).slice(0, 300);
        throw new Error(`LLM 返回数据缺少 chapters（keys: [${keys.join(', ')}], preview: ${preview}）`);
      }
    }
    if (!parsed.characters || !Array.isArray(parsed.characters)) parsed.characters = [];
    if (!parsed.props || !Array.isArray(parsed.props)) parsed.props = [];
    if (!parsed.dialogues || !Array.isArray(parsed.dialogues)) parsed.dialogues = [];
    if (!parsed.sentiment) {
      parsed.sentiment = { positive: 0.33, negative: 0.33, neutral: 0.34, dominant: 'neutral' };
    }

    logger.info(`LLM 分析完成: ${parsed.chapters.length} 章, ${parsed.characters.length} 角色, ${parsed.props.length} 道具, ${parsed.dialogues.length} 对白`);
    return parsed;
  } catch (err: any) {
    logger.error(`LLM 分析失败:`, err.message);
    throw new Error(`LLM 剧本分析失败: ${err.message}`);
  }
}

export async function reviewScriptWithLLM(
  script: string,
  originalText: string,
  opts?: { api_key?: string; base_url?: string; model?: string }
): Promise<ReviewResult> {
  const textPreview = originalText.substring(0, 2000);
  const prompt = REVIEW_PROMPT + textPreview + '\n\n待审核的 Seedance 格式剧本：\n```seedance\n' + script + '\n```';

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
  script: string,
  feedback: string,
  opts?: { api_key?: string; base_url?: string; model?: string },
  existingCharacters?: AnalysisCharacter[]
): Promise<ReviseResult> {
  const prompt = REVISE_PROMPT + feedback + '\n\n当前 Seedance 格式剧本：\n```seedance\n' + script + '\n```';

  try {
    const raw = await generateText(prompt, {
      temperature: 0.3,
      api_key: opts?.api_key,
      base_url: opts?.base_url,
      model: opts?.model,
    });

    // 提取 seedance 文本块
    const seedanceMatch = raw.match(/```seedance\s*\n([\s\S]*?)```/);
    if (!seedanceMatch) throw new Error('修改结果中缺少 seedance 代码块');
    const revisedScript = seedanceMatch[1].trim();

    // 提取 JSON
    const parsed = extractJSON(raw) as any;

    if (!parsed.chapters || !Array.isArray(parsed.chapters)) {
      throw new Error('修改结果缺少 chapters');
    }
    if (!parsed.characters || !Array.isArray(parsed.characters) || parsed.characters.length === 0) {
      parsed.characters = existingCharacters || [];
    }
    if (!parsed.props || !Array.isArray(parsed.props)) parsed.props = [];
    if (!parsed.dialogues || !Array.isArray(parsed.dialogues)) parsed.dialogues = [];
    if (!parsed.sentiment) parsed.sentiment = { positive: 0.33, negative: 0.33, neutral: 0.34, dominant: 'neutral' };

    // 确保每个 chapter 都有 scenes，每个 scene 都有 storyboards
    parsed.chapters = parsed.chapters.map((ch: any) => ({
      ...ch,
      scenes: Array.isArray(ch.scenes) ? ch.scenes.map((sc: any) => ({
        ...sc,
        storyboards: Array.isArray(sc.storyboards) ? sc.storyboards : [],
      })) : [],
    }));

    return {
      script: revisedScript,
      chapters: parsed.chapters,
      characters: parsed.characters,
      props: parsed.props,
      dialogues: parsed.dialogues,
      sentiment: parsed.sentiment,
      style_recommendation: parsed.style_recommendation || 'anime',
    };
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

  logger.info(`LLM 流式分析: 文本 ${text.length} 字`);

  const episodePrefix = episodeContext
    ? `[当前正在分析第 ${episodeContext.episodeNumber} 集：${episodeContext.episodeTitle}]\n\n`
    : '';

  const prompt = episodePrefix + ANALYSIS_PROMPT + text;
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
      const keys = Object.keys(parsed || {});
      logger.error(`LLM 返回 JSON keys: [${keys.join(', ')}], raw 长度: ${raw.length}, 末尾100字: ${raw.slice(-100)}`);
      function findChapters(obj: any, depth: number = 0): { key: string; val: any } | null {
        if (!obj || typeof obj !== 'object' || depth > 5) return null;
        for (const k of Object.keys(obj)) {
          const v = obj[k];
          if (v && typeof v === 'object' && Array.isArray(v.chapters)) return { key: k, val: v };
        }
        for (const k of Object.keys(obj)) {
          const v = obj[k];
          if (v && typeof v === 'object' && !Array.isArray(v)) {
            const found = findChapters(v, depth + 1);
            if (found) return found;
          }
        }
        return null;
      }
      const found = findChapters(parsed);
      if (found) {
        logger.info(`从嵌套路径中找到 chapters (key: "${found.key}")`);
        Object.assign(parsed, found.val);
      }
      if (!parsed.chapters || !Array.isArray(parsed.chapters)) {
        const preview = JSON.stringify(parsed).slice(0, 300);
        throw new Error(`LLM 返回数据缺少 chapters（keys: [${keys.join(', ')}], preview: ${preview}）`);
      }
    }
    if (!parsed.characters || !Array.isArray(parsed.characters)) parsed.characters = [];
    if (!parsed.props || !Array.isArray(parsed.props)) parsed.props = [];
    if (!parsed.dialogues || !Array.isArray(parsed.dialogues)) parsed.dialogues = [];
    if (!parsed.sentiment) {
      parsed.sentiment = { positive: 0.33, negative: 0.33, neutral: 0.34, dominant: 'neutral' };
    }

    logger.info(`LLM 流式分析完成: ${parsed.chapters.length} 章, ${parsed.characters.length} 角色`);
    return parsed;
  } catch (err: any) {
    logger.error(`LLM 流式分析失败:`, err.message);
    throw new Error(`LLM 剧本分析失败: ${err.message}`);
  }
}

/**
 * 流式剧本审核，通过 onChunk 回调实时返回 LLM 输出
 */
export async function reviewScriptWithLLMStream(
  script: string,
  originalText: string,
  opts: { api_key?: string; base_url?: string; model?: string } | undefined,
  onChunk: (chunk: string) => void
): Promise<ReviewResult> {
  const textPreview = originalText.substring(0, 2000);
  const prompt = REVIEW_PROMPT + textPreview + '\n\n待审核的 Seedance 格式剧本：\n```seedance\n' + script + '\n```';

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
  script: string,
  feedback: string,
  opts: { api_key?: string; base_url?: string; model?: string } | undefined,
  onChunk: (chunk: string) => void,
  existingCharacters?: AnalysisCharacter[]
): Promise<ReviseResult> {
  const prompt = REVISE_PROMPT + feedback + '\n\n当前 Seedance 格式剧本：\n```seedance\n' + script + '\n```';

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

    // 提取 seedance 文本块
    const seedanceMatch = raw.match(/```seedance\s*\n([\s\S]*?)```/);
    if (!seedanceMatch) throw new Error('修改结果中缺少 seedance 代码块');
    const revisedScript = seedanceMatch[1].trim();

    // 提取 JSON
    const parsed = extractJSON(raw) as any;

    if (!parsed.chapters || !Array.isArray(parsed.chapters)) {
      throw new Error('修改结果缺少 chapters');
    }
    if (!parsed.characters || !Array.isArray(parsed.characters) || parsed.characters.length === 0) {
      parsed.characters = existingCharacters || [];
    }
    if (!parsed.props || !Array.isArray(parsed.props)) parsed.props = [];
    if (!parsed.dialogues || !Array.isArray(parsed.dialogues)) parsed.dialogues = [];
    if (!parsed.sentiment) parsed.sentiment = { positive: 0.33, negative: 0.33, neutral: 0.34, dominant: 'neutral' };

    // 确保每个 chapter 都有 scenes，每个 scene 都有 storyboards
    parsed.chapters = parsed.chapters.map((ch: any) => ({
      ...ch,
      scenes: Array.isArray(ch.scenes) ? ch.scenes.map((sc: any) => ({
        ...sc,
        storyboards: Array.isArray(sc.storyboards) ? sc.storyboards : [],
      })) : [],
    }));

    return {
      script: revisedScript,
      chapters: parsed.chapters,
      characters: parsed.characters,
      props: parsed.props,
      dialogues: parsed.dialogues,
      sentiment: parsed.sentiment,
      style_recommendation: parsed.style_recommendation || 'anime',
    };
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

  const prompt = SUGGEST_EPISODES_PROMPT + text;
  logger.info(`剧集建议: 原文 ${text.length} 字，完整发送`);

  try {
    const raw = await generateText(prompt, {
      temperature: 0.4,
      api_key: opts?.api_key,
      base_url: opts?.base_url,
      model: opts?.model,
      systemMessage: '你是一个专业的短视频编剧。你必须只返回 JSON 格式，不要返回任何其他内容。',
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

    // Clamp to text length
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
