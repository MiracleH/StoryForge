/**
 * Sora-2 分镜生成服务
 * 基于剧本(script)生成 Sora-2 平台的英文视频描述分镜
 */

import { generateText, generateTextStream } from './ai';
import { getDatabase } from '../database/setup';
import { logger } from '../utils/logger';

const SORA_PROMPT = `You are a professional Sora-2 video storyboard artist. Convert the following manga/drama script into Sora-2 optimized video generation prompts.

## Script Content
{script}

## Characters
{characters}

## Scenes
{scenes}

## Output Format

Generate a JSON array of video shots optimized for Sora-2 text-to-video generation:

{
  "storyboards": [
    {
      "scene_id": <scene_id>,
      "scene_title": "Scene title",
      "shots": [
        {
          "title": "Shot title",
          "description": "Brief shot description",
          "duration": 3,
          "time_range": "0-3s",
          "camera_angle": "wide shot / medium shot / close-up / extreme close-up / low angle / high angle / aerial",
          "camera_movement": "static / pan left / pan right / tilt up / tilt down / dolly in / dolly out / tracking shot / crane shot / handheld",
          "sora_prompt": "Detailed English video generation prompt optimized for Sora-2: describe visual elements, lighting, atmosphere, character positions, movements, colors, textures, and camera work in a single flowing paragraph. Max 300 words."
        }
      ]
    }
  ]
}

## Guidelines
- Each shot is exactly 3 seconds, time ranges tile continuously without gaps: 0-3s, 3-6s, 6-9s, 9-12s...
- duration must be 3, time_range must be the exact continuous interval
- Generate as many shots per scene as possible (recommended 10-20), the system will automatically group every 5 shots into one storyboard card
- sora_prompt must be English, highly descriptive, cinematic quality
- Include: shot type, lighting setup, color palette, character placement, action, mood, atmosphere, camera movement, focal point
- Use Sora-2 friendly language: concrete visual descriptions, avoid abstract concepts
- Do NOT include dialogue text in prompts (Sora doesn't generate speech)
- Describe character appearances consistently across shots
- Style: {style}
- Aspect ratio: {aspect_ratio}

Wrap output in \`\`\`json code block.`;

export async function generateSoraStoryboardsForEpisode(
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
    `- ${c.name}: ${c.description || ''} Appearance: ${c.appearance || ''} Visual: ${c.visual_prompt || ''}`
  ).join('\n');

  const sceneDesc = scenes.map((s: any) =>
    `- [ID:${s.id}] ${s.title}: ${s.description || ''} | Location: ${s.location || ''} | Time: ${s.time_of_day || ''} | Mood: ${s.mood || ''} | Atmosphere: ${s.atmosphere || ''} | Visuals: ${s.visual_description || ''}`
  ).join('\n');

  const prompt = SORA_PROMPT
    .replace('{script}', script || 'No script content')
    .replace('{characters}', charDesc || 'No character info')
    .replace('{scenes}', sceneDesc || 'No scene info')
    .replace('{style}', style)
    .replace('{aspect_ratio}', aspectRatio);

  // Delete existing sora storyboards for this episode
  db.prepare(`
    DELETE FROM storyboards WHERE scene_id IN (
      SELECT s.id FROM scenes s JOIN chapters c ON s.chapter_id = c.id WHERE c.episode_id = ?
    ) AND version = 'sora'
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
    const GROUP_SIZE = 5; // 5个镜头一组

    if (parsed.storyboards && Array.isArray(parsed.storyboards)) {
      for (const sceneSb of parsed.storyboards) {
        const sceneId = sceneSb.scene_id;

        if (sceneSb.shots && Array.isArray(sceneSb.shots)) {
          // 按 GROUP_SIZE 分组
          for (let i = 0; i < sceneSb.shots.length; i += GROUP_SIZE) {
            const group = sceneSb.shots.slice(i, i + GROUP_SIZE);

            // 合并标题：首个 ~ 末个
            const title = group.length === 1
              ? (group[0].title || `Shot Group #${totalGenerated + 1}`)
              : `${group[0].title || 'Shot ' + (i + 1)} ~ ${group[group.length - 1].title || 'Shot ' + (i + group.length)}`;

            // 合并描述
            const description = group.map((s: any, idx: number) => `[${idx + 1}] ${s.description || ''}`).join('\n');

            // 时长 = 组内镜头数 * 3秒
            const duration = group.length * 3;

            // 取第一个镜头的景别和运镜
            const cameraAngle = group[0].camera_angle || 'medium shot';
            const cameraMovement = group[0].camera_movement || 'static';

            // 合并 sora_prompt：取每组第一个镜头的 prompt
            const soraPrompt = group[0].sora_prompt || '';

            db.prepare(`
              INSERT INTO storyboards (scene_id, title, description, duration, camera_angle, camera_movement, order_index, transition_type, transition_duration, sora_prompt, version)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'cut', 0.5, ?, 'sora')
            `).run(
              sceneId,
              title,
              description,
              duration,
              cameraAngle,
              cameraMovement,
              totalGenerated,
              soraPrompt
            );
            totalGenerated++;
          }
        }
      }
    }
  } catch (err: any) {
    logger.error(`Sora-2 分镜生成失败 (episode ${episodeId}):`, err.message);
    throw err;
  }

  logger.info(`Sora-2 分镜生成完成: episode ${episodeId}, 共 ${totalGenerated} 个分镜`);
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
  throw new Error('Failed to extract JSON from LLM response');
}
