/**
 * Seedance 2.0 分镜生成服务
 * 基于剧本(script)生成 Seedance 2.0 平台格式的分镜
 */

import { generateText, generateTextStream } from './ai';
import { getDatabase } from '../database/setup';
import { logger } from '../utils/logger';

const SEEDANCE_PROMPT = `你是一个专业的 Seedance 2.0 AI 视频分镜师。请将以下漫剧剧本转换为 Seedance 2.0 格式的分镜脚本。

## 剧本内容
{script}

## 角色信息
{characters}

## 场景信息
{scenes}

## 输出格式要求

请按场景生成 Seedance 2.0 分镜，输出 JSON 数组：

{
  "storyboards": [
    {
      "scene_id": <场景ID>,
      "scene_title": "场景标题",
      "seedance_prompt": "完整的 Seedance 2.0 提示词，包含【风格】【时长】【画幅】【时间轴】【声音】【参考】",
      "shots": [
        {
          "title": "镜头标题",
          "description": "△ 镜头描述，包含景别（远景/全景/中景/近景/特写/大特写）和运镜（推/拉/摇/移/跟/环绕/升降/希区柯克变焦）",
          "duration": 3,
          "time_range": "0-3秒",
          "camera_angle": "景别",
          "camera_movement": "运镜方式"
        }
      ]
    }
  ]
}

## 分镜规则
- 每个场景生成 1 个完整的 Seedance 2.0 提示词（含时间轴）
- 每个镜头固定 3 秒，时间轴连续平铺不重叠（0-3秒, 3-6秒, 6-9秒...）
- duration 必须为 3，time_range 必须为连续区间（如 "0-3秒", "3-6秒", "6-9秒"）
- 景别使用：远景/全景/中景/近景/特写/大特写
- 运镜使用：推镜头/拉镜头/摇镜头/移镜头/跟镜头/环绕镜头/升降镜头/希区柯克变焦/手持晃动/固定
- 每个 shot 的 description 以 "△ " 开头，包含画面描述+动作+氛围
- seedance_prompt 按 Seedance 2.0 标准公式：【风格】+【时长】+【画幅】+【时间轴镜头序列】+【声音设计】+【参考素材】
- 风格使用{style}风格
- 画幅使用{aspect_ratio}

请用 \`\`\`json 代码块包裹输出。`;

export async function generateSeedanceStoryboardsForEpisode(
  episodeId: number,
  opts?: { api_key?: string; base_url?: string; model?: string },
  onChunk?: (chunk: string) => void
): Promise<void> {
  const db = getDatabase();

  const episode = db.prepare('SELECT * FROM episodes WHERE id = ?').get(episodeId) as any;
  if (!episode) throw new Error(`Episode ${episodeId} not found`);

  const script = episode.script || '';
  const style = episode.style_preset || 'anime';
  const aspectRatio = episode.aspect_ratio || '16:9';

  const projectId = episode.project_id;

  const characters = db.prepare(
    'SELECT name, description, appearance, visual_prompt FROM characters WHERE project_id = ?'
  ).all(projectId) as any[];

  const scenes = db.prepare(`
    SELECT s.*, c.title as chapter_title, c.order_index as chapter_order
    FROM scenes s
    JOIN chapters c ON s.chapter_id = c.id
    WHERE c.episode_id = ?
    ORDER BY c.order_index, s.order_index
  `).all(episodeId) as any[];

  const charDesc = characters.map((c: any) =>
    `- ${c.name}: ${c.description || ''} ${c.appearance || ''} ${c.visual_prompt || ''}`
  ).join('\n');

  const sceneDesc = scenes.map((s: any) =>
    `- [ID:${s.id}] ${s.title}: ${s.description || ''} | 地点:${s.location || ''} | 时间:${s.time_of_day || ''} | 情绪:${s.mood || ''} | 氛围:${s.atmosphere || ''} | 视觉:${s.visual_description || ''}`
  ).join('\n');

  const prompt = SEEDANCE_PROMPT
    .replace('{script}', script || '无剧本内容')
    .replace('{characters}', charDesc || '无角色信息')
    .replace('{scenes}', sceneDesc || '无场景信息')
    .replace('{style}', style)
    .replace('{aspect_ratio}', aspectRatio);

  // Delete existing seedance storyboards for this episode
  db.prepare(`
    DELETE FROM storyboards WHERE scene_id IN (
      SELECT s.id FROM scenes s JOIN chapters c ON s.chapter_id = c.id WHERE c.episode_id = ?
    ) AND version = 'seedance'
  `).run(episodeId);

  let totalGenerated = 0;

  try {
    let raw: string;
    if (onChunk) {
      raw = '';
      for await (const token of generateTextStream(prompt, {
        temperature: 0.4,
        api_key: opts?.api_key,
        base_url: opts?.base_url,
        model: opts?.model,
      })) {
        raw += token;
        onChunk(token);
      }
    } else {
      raw = await generateText(prompt, {
        temperature: 0.4,
        api_key: opts?.api_key,
        base_url: opts?.base_url,
        model: opts?.model,
      });
    }

    const parsed = extractJSON(raw);

    if (parsed.storyboards && Array.isArray(parsed.storyboards)) {
      for (const sceneSb of parsed.storyboards) {
        const sceneId = sceneSb.scene_id;
        const seedancePrompt = sceneSb.seedance_prompt || '';

        if (sceneSb.shots && Array.isArray(sceneSb.shots)) {
          for (const shot of sceneSb.shots) {
            db.prepare(`
              INSERT INTO storyboards (scene_id, title, description, duration, camera_angle, camera_movement, order_index, transition_type, transition_duration, seedance_prompt, version)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'cut', 0.5, ?, 'seedance')
            `).run(
              sceneId,
              shot.title || `镜头 #${totalGenerated + 1}`,
              shot.description || '',
              Math.round(shot.duration) || 3,
              shot.camera_angle || '中景',
              shot.camera_movement || '固定',
              totalGenerated,
              seedancePrompt
            );
            totalGenerated++;
          }
        }
      }
    }
  } catch (err: any) {
    logger.error(`Seedance 分镜生成失败 (episode ${episodeId}):`, err.message);
    throw err;
  }

  logger.info(`Seedance 分镜生成完成: episode ${episodeId}, 共 ${totalGenerated} 个分镜`);
}

function extractJSON(text: string): any {
  try { return JSON.parse(text); } catch {}
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    try { return JSON.parse(codeBlockMatch[1].trim()); } catch {}
  }
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try { return JSON.parse(braceMatch[0]); } catch {}
  }
  throw new Error('无法从 LLM 响应中提取 JSON');
}
