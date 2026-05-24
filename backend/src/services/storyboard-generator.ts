/**
 * 分镜 JSON 生成服务
 * Stage 3: 基于已审核的剧本，用 LLM 为每个场景生成详细分镜
 */

import { generateText, generateTextStream } from './ai';
import { getDatabase } from '../database/setup';
import { logger } from '../utils/logger';

interface StoryboardShot {
  title: string;
  description: string;
  duration: number;
  camera_angle: string;
  camera_movement: string;
  character_positions: string;
  dialogue_timing: string;
  visual_composition: string;
  transition_type: string;
  transition_duration: number;
  order_index: number;
}

const STORYBOARD_PROMPT = `你是一个专业的分镜师。请为以下场景生成详细的分镜列表。

场景信息：
- 标题：{title}
- 描述：{description}
- 地点：{location}
- 时间：{time_of_day}
- 情绪：{mood}
- 氛围：{atmosphere}
- 视觉描述：{visual_description}

相关角色：
{characters}

相关对白：
{dialogues}

请生成分镜 JSON 数组，每个分镜包含：
{
  "storyboards": [
    {
      "title": "分镜标题",
      "description": "分镜内容描述",
      "duration": 3,
      "time_range": "0-3秒",
      "camera_angle": "wide/medium/close/extreme_close/low_angle/high_angle/dutch",
      "camera_movement": "static/pan_left/pan_right/tilt_up/tilt_down/dolly_in/dolly_out/zoom_in",
      "character_positions": "角色在画面中的位置描述，如：主角居中，配角左侧",
      "dialogue_timing": "对白时机，如：角色说完后停顿1秒",
      "visual_composition": "构图描述，如：三分法构图，主角在右三分之一处",
      "transition_type": "cut/dissolve/fade/wipe",
      "transition_duration": 1,
      "order_index": 0
    }
  ]
}

注意：
- 每个场景的场景/对话长度按比例生成分镜
- 每个镜头固定 3 秒，时间轴连续不重叠（0-3秒, 3-6秒, 6-9秒...）
- time_range 必须为连续区间
- camera_angle 和 camera_movement 使用指定枚举值
- duration 固定为 3
- transition_duration 必须为整数秒，通常 1 秒
- 请用 \`\`\`json 代码块包裹你的 JSON 输出
`;

export async function generateStoryboardsForProject(
  projectId: number,
  opts?: { api_key?: string; base_url?: string; model?: string }
): Promise<void> {
  const db = getDatabase();

  // Get all scenes with chapter info
  const scenes = db.prepare(`
    SELECT s.*, c.title as chapter_title, c.order_index as chapter_order
    FROM scenes s
    JOIN chapters c ON s.chapter_id = c.id
    WHERE c.project_id = ?
    ORDER BY c.order_index, s.order_index
  `).all(projectId) as any[];

  // Get all characters for the project
  const characters = db.prepare(
    'SELECT name, description, visual_prompt FROM characters WHERE project_id = ?'
  ).all(projectId) as any[];

  // Get all dialogues with character info
  const dialogues = db.prepare(`
    SELECT d.content, d.emotion, d.style, c.name as character_name,
           sb.order_index as sb_order, s.order_index as scene_order, ch.order_index as chapter_order
    FROM dialogues d
    JOIN storyboards sb ON d.storyboard_id = sb.id
    JOIN scenes s ON sb.scene_id = s.id
    JOIN chapters ch ON s.chapter_id = ch.id
    LEFT JOIN characters c ON d.character_id = c.id
    WHERE ch.project_id = ?
    ORDER BY ch.order_index, s.order_index, sb.order_index, d.order_index
  `).all(projectId) as any[];

  // Clear existing storyboards for this project
  db.prepare(`
    DELETE FROM storyboards WHERE scene_id IN (
      SELECT s.id FROM scenes s
      JOIN chapters c ON s.chapter_id = c.id
      WHERE c.project_id = ?
    )
  `).run(projectId);

  let totalGenerated = 0;

  for (const scene of scenes) {
    const sceneChars = characters.map((c: any) => `- ${c.name}: ${c.description || ''} ${c.visual_prompt || ''}`).join('\n');
    const sceneDialogues = dialogues
      .filter((d: any) => d.chapter_order === scene.chapter_order && d.scene_order === scene.order_index)
      .map((d: any) => `[${d.character_name}]: ${d.content} (${d.emotion || ''})`)
      .join('\n');

    const prompt = STORYBOARD_PROMPT
      .replace('{title}', scene.title || '')
      .replace('{description}', scene.description || '')
      .replace('{location}', scene.location || '')
      .replace('{time_of_day}', scene.time_of_day || '')
      .replace('{mood}', scene.mood || '')
      .replace('{atmosphere}', scene.atmosphere || '')
      .replace('{visual_description}', scene.visual_description || '')
      .replace('{characters}', sceneChars || '无')
      .replace('{dialogues}', sceneDialogues || '无');

    try {
      const raw = await generateText(prompt, {
        temperature: 0.4,
        api_key: opts?.api_key,
        base_url: opts?.base_url,
        model: opts?.model,
      });

      const parsed = extractStoryboardJSON(raw);

      if (parsed.storyboards && Array.isArray(parsed.storyboards)) {
        for (const sb of parsed.storyboards) {
          db.prepare(`
            INSERT INTO storyboards (scene_id, title, description, duration, camera_angle, camera_movement, order_index, transition_type, transition_duration)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            scene.id,
            sb.title || '',
            sb.description || '',
            Math.round(sb.duration) || 3,
            sb.camera_angle || 'medium',
            sb.camera_movement || 'static',
            sb.order_index ?? totalGenerated,
            sb.transition_type || 'cut',
            Math.round(sb.transition_duration) || 1
          );
          totalGenerated++;
        }
      }
    } catch (err: any) {
      logger.error(`分镜生成失败 (scene ${scene.id}):`, err.message);
    }
  }

  logger.info(`分镜生成完成: 项目 ${projectId}, 共 ${totalGenerated} 个分镜`);
}

/**
 * 流式分镜生成，通过 onChunk 回调实时返回 LLM 输出
 */
export async function generateStoryboardsForProjectStream(
  projectId: number,
  opts: { api_key?: string; base_url?: string; model?: string } | undefined,
  onChunk: (chunk: string) => void
): Promise<void> {
  const db = getDatabase();

  const scenes = db.prepare(`
    SELECT s.*, c.title as chapter_title, c.order_index as chapter_order
    FROM scenes s
    JOIN chapters c ON s.chapter_id = c.id
    WHERE c.project_id = ?
    ORDER BY c.order_index, s.order_index
  `).all(projectId) as any[];

  const characters = db.prepare(
    'SELECT name, description, visual_prompt FROM characters WHERE project_id = ?'
  ).all(projectId) as any[];

  const dialogues = db.prepare(`
    SELECT d.content, d.emotion, d.style, c.name as character_name,
           sb.order_index as sb_order, s.order_index as scene_order, ch.order_index as chapter_order
    FROM dialogues d
    JOIN storyboards sb ON d.storyboard_id = sb.id
    JOIN scenes s ON sb.scene_id = s.id
    JOIN chapters ch ON s.chapter_id = ch.id
    LEFT JOIN characters c ON d.character_id = c.id
    WHERE ch.project_id = ?
    ORDER BY ch.order_index, s.order_index, sb.order_index, d.order_index
  `).all(projectId) as any[];

  db.prepare(`
    DELETE FROM storyboards WHERE scene_id IN (
      SELECT s.id FROM scenes s
      JOIN chapters c ON s.chapter_id = c.id
      WHERE c.project_id = ?
    )
  `).run(projectId);

  let totalGenerated = 0;

  for (let si = 0; si < scenes.length; si++) {
    const scene = scenes[si];
    onChunk(`\n\n--- 正在生成场景 ${si + 1}/${scenes.length} 的分镜: ${scene.title || ''} ---\n\n`);

    const sceneChars = characters.map((c: any) => `- ${c.name}: ${c.description || ''} ${c.visual_prompt || ''}`).join('\n');
    const sceneDialogues = dialogues
      .filter((d: any) => d.chapter_order === scene.chapter_order && d.scene_order === scene.order_index)
      .map((d: any) => `[${d.character_name}]: ${d.content} (${d.emotion || ''})`)
      .join('\n');

    const prompt = STORYBOARD_PROMPT
      .replace('{title}', scene.title || '')
      .replace('{description}', scene.description || '')
      .replace('{location}', scene.location || '')
      .replace('{time_of_day}', scene.time_of_day || '')
      .replace('{mood}', scene.mood || '')
      .replace('{atmosphere}', scene.atmosphere || '')
      .replace('{visual_description}', scene.visual_description || '')
      .replace('{characters}', sceneChars || '无')
      .replace('{dialogues}', sceneDialogues || '无');

    let raw = '';
    try {
      for await (const token of generateTextStream(prompt, {
        temperature: 0.4,
        api_key: opts?.api_key,
        base_url: opts?.base_url,
        model: opts?.model,
      })) {
        raw += token;
        onChunk(token);
      }

      const parsed = extractStoryboardJSON(raw);

      if (parsed.storyboards && Array.isArray(parsed.storyboards)) {
        for (const sb of parsed.storyboards) {
          db.prepare(`
            INSERT INTO storyboards (scene_id, title, description, duration, camera_angle, camera_movement, order_index, transition_type, transition_duration)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            scene.id,
            sb.title || '',
            sb.description || '',
            Math.round(sb.duration) || 3,
            sb.camera_angle || 'medium',
            sb.camera_movement || 'static',
            sb.order_index ?? totalGenerated,
            sb.transition_type || 'cut',
            Math.round(sb.transition_duration) || 1
          );
          totalGenerated++;
        }
      }
    } catch (err: any) {
      logger.error(`流式分镜生成失败 (scene ${scene.id}):`, err.message);
    }
  }

  logger.info(`流式分镜生成完成: 项目 ${projectId}, 共 ${totalGenerated} 个分镜`);
}

function extractStoryboardJSON(text: string): any {
  try { return JSON.parse(text); } catch {}
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    try { return JSON.parse(codeBlockMatch[1].trim()); } catch {}
  }
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try { return JSON.parse(braceMatch[0]); } catch {}
  }
  throw new Error('无法从 LLM 响应中提取分镜 JSON');
}

/**
 * Episode-scoped: 流式分镜生成
 */
export async function generateStoryboardsForEpisode(
  episodeId: number,
  opts: { api_key?: string; base_url?: string; model?: string } | undefined,
  onChunk?: (chunk: string) => void
): Promise<void> {
  const db = getDatabase();

  // Get projectId from episode
  const episode = db.prepare('SELECT project_id FROM episodes WHERE id = ?').get(episodeId) as any;
  if (!episode) throw new Error(`Episode ${episodeId} not found`);
  const projectId = episode.project_id;

  const scenes = db.prepare(`
    SELECT s.*, c.title as chapter_title, c.order_index as chapter_order
    FROM scenes s
    JOIN chapters c ON s.chapter_id = c.id
    WHERE c.episode_id = ?
    ORDER BY c.order_index, s.order_index
  `).all(episodeId) as any[];

  const characters = db.prepare(
    'SELECT name, description, visual_prompt FROM characters WHERE project_id = ?'
  ).all(projectId) as any[];

  const dialogues = db.prepare(`
    SELECT d.content, d.emotion, d.style, c.name as character_name,
           sb.order_index as sb_order, s.order_index as scene_order, ch.order_index as chapter_order
    FROM dialogues d
    JOIN storyboards sb ON d.storyboard_id = sb.id
    JOIN scenes s ON sb.scene_id = s.id
    JOIN chapters ch ON s.chapter_id = ch.id
    LEFT JOIN characters c ON d.character_id = c.id
    WHERE ch.episode_id = ?
    ORDER BY ch.order_index, s.order_index, sb.order_index, d.order_index
  `).all(episodeId) as any[];

  db.prepare(`
    DELETE FROM storyboards WHERE scene_id IN (
      SELECT s.id FROM scenes s
      JOIN chapters c ON s.chapter_id = c.id
      WHERE c.episode_id = ?
    )
  `).run(episodeId);

  let totalGenerated = 0;

  for (let si = 0; si < scenes.length; si++) {
    const scene = scenes[si];
    onChunk?.(`\n\n--- 正在生成场景 ${si + 1}/${scenes.length} 的分镜: ${scene.title || ''} ---\n\n`);

    const sceneChars = characters.map((c: any) => `- ${c.name}: ${c.description || ''} ${c.visual_prompt || ''}`).join('\n');
    const sceneDialogues = dialogues
      .filter((d: any) => d.chapter_order === scene.chapter_order && d.scene_order === scene.order_index)
      .map((d: any) => `[${d.character_name}]: ${d.content} (${d.emotion || ''})`)
      .join('\n');

    const prompt = STORYBOARD_PROMPT
      .replace('{title}', scene.title || '')
      .replace('{description}', scene.description || '')
      .replace('{location}', scene.location || '')
      .replace('{time_of_day}', scene.time_of_day || '')
      .replace('{mood}', scene.mood || '')
      .replace('{atmosphere}', scene.atmosphere || '')
      .replace('{visual_description}', scene.visual_description || '')
      .replace('{characters}', sceneChars || '无')
      .replace('{dialogues}', sceneDialogues || '无');

    let raw = '';
    try {
      for await (const token of generateTextStream(prompt, {
        temperature: 0.4,
        api_key: opts?.api_key,
        base_url: opts?.base_url,
        model: opts?.model,
      })) {
        raw += token;
        onChunk?.(token);
      }

      const parsed = extractStoryboardJSON(raw);

      if (parsed.storyboards && Array.isArray(parsed.storyboards)) {
        for (const sb of parsed.storyboards) {
          db.prepare(`
            INSERT INTO storyboards (scene_id, title, description, duration, camera_angle, camera_movement, order_index, transition_type, transition_duration)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            scene.id,
            sb.title || '',
            sb.description || '',
            Math.round(sb.duration) || 3,
            sb.camera_angle || 'medium',
            sb.camera_movement || 'static',
            sb.order_index ?? totalGenerated,
            sb.transition_type || 'cut',
            Math.round(sb.transition_duration) || 1
          );
          totalGenerated++;
        }
      }
    } catch (err: any) {
      logger.error(`Episode 分镜生成失败 (scene ${scene.id}):`, err.message);
    }
  }

  logger.info(`Episode 分镜生成完成: episode ${episodeId}, 共 ${totalGenerated} 个分镜`);
}
