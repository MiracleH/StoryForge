/**
 * 关键帧生成服务
 * Stage 4: 基于分镜 JSON + 素材库生成关键帧图片
 */

import { generateImage, isImageConfigured } from './ai';
import { buildKeyframePrompt } from './style-consistency';
import { GeneratedAssetModel } from '../models/generated-asset';
import { WorkflowTaskModel } from '../models/workflow-task';
import { getDatabase } from '../database/setup';
import { logger } from '../utils/logger';

export async function generateKeyframes(projectId: number, imageOpts?: { api_key?: string; base_url?: string; model?: string }): Promise<void> {
  if (!isImageConfigured() && !imageOpts?.api_key) {
    throw new Error('AI 图片生成未配置');
  }

  const db = getDatabase();
  const stylePreset = (db.prepare('SELECT style_preset FROM projects WHERE id = ?').get(projectId) as any)?.style_preset || 'anime';

  const storyboards = db.prepare(`
    SELECT sb.*, s.title as scene_title, s.description as scene_description,
           s.visual_description, s.mood, s.atmosphere
    FROM storyboards sb
    JOIN scenes s ON sb.scene_id = s.id
    JOIN chapters c ON s.chapter_id = c.id
    WHERE c.project_id = ?
    ORDER BY c.order_index, s.order_index, sb.order_index
  `).all(projectId) as any[];

  const characters = db.prepare('SELECT * FROM characters WHERE project_id = ?').all(projectId) as any[];

  for (const sb of storyboards) {
    const dialogues = db.prepare(
      'SELECT * FROM dialogues WHERE storyboard_id = ? ORDER BY order_index'
    ).all(sb.id) as any[];

    const involvedCharacters: any[] = [];
    const seenNames = new Set<string>();
    for (const d of dialogues) {
      if (d.character_id) {
        const char = characters.find((c: any) => c.id === d.character_id);
        if (char && !seenNames.has(char.name)) {
          involvedCharacters.push(char);
          seenNames.add(char.name);
        }
      }
    }

    const bgDescription = sb.visual_description || sb.scene_description || sb.description || '';

    const prompt = buildKeyframePrompt(
      { title: sb.title, description: sb.description, camera_angle: sb.camera_angle, camera_movement: sb.camera_movement },
      involvedCharacters,
      bgDescription,
      stylePreset
    );

    const asset = GeneratedAssetModel.create({
      project_id: projectId,
      asset_type: 'keyframe',
      entity_type: 'storyboard',
      entity_id: sb.id,
      prompt,
      image_url: 'pending',
      style_preset: stylePreset,
      status: 'generating',
    });

    const task = WorkflowTaskModel.create({
      project_id: projectId,
      task_type: 'generate_keyframe',
      entity_type: 'storyboard',
      entity_id: sb.id,
    });

    try {
      WorkflowTaskModel.updateStatus((task as any).id, 'running');

      const filePath = await generateImage(prompt, { size: '1792x1024', ...imageOpts });

      GeneratedAssetModel.updateStatus((asset as any).id, 'completed', filePath);
      WorkflowTaskModel.updateStatus((task as any).id, 'completed');

      db.prepare('UPDATE storyboards SET image_url = ? WHERE id = ?').run(filePath, sb.id);

      logger.info(`Keyframe generated for storyboard ${sb.id}`);
    } catch (err: any) {
      logger.error(`Keyframe generation failed for storyboard ${sb.id}:`, err.message);
      GeneratedAssetModel.updateStatus((asset as any).id, 'failed', undefined, err.message);
      WorkflowTaskModel.updateStatus((task as any).id, 'failed', err.message);
    }
  }
}

/**
 * Episode-scoped keyframe generation
 */
export async function generateKeyframesForEpisode(episodeId: number, imageOpts?: { api_key?: string; base_url?: string; model?: string }): Promise<void> {
  if (!isImageConfigured() && !imageOpts?.api_key) {
    throw new Error('AI 图片生成未配置');
  }

  const db = getDatabase();
  const episode = db.prepare('SELECT project_id, style_preset FROM episodes WHERE id = ?').get(episodeId) as any;
  if (!episode) throw new Error(`Episode ${episodeId} not found`);
  const projectId = episode.project_id;
  const stylePreset = episode.style_preset || 'anime';

  const storyboards = db.prepare(`
    SELECT sb.*, s.title as scene_title, s.description as scene_description,
           s.visual_description, s.mood, s.atmosphere
    FROM storyboards sb
    JOIN scenes s ON sb.scene_id = s.id
    JOIN chapters c ON s.chapter_id = c.id
    WHERE c.episode_id = ?
    ORDER BY c.order_index, s.order_index, sb.order_index
  `).all(episodeId) as any[];

  const characters = db.prepare('SELECT * FROM characters WHERE project_id = ?').all(projectId) as any[];

  for (const sb of storyboards) {
    const dialogues = db.prepare(
      'SELECT * FROM dialogues WHERE storyboard_id = ? ORDER BY order_index'
    ).all(sb.id) as any[];

    const involvedCharacters: any[] = [];
    const seenNames = new Set<string>();
    for (const d of dialogues) {
      if (d.character_id) {
        const char = characters.find((c: any) => c.id === d.character_id);
        if (char && !seenNames.has(char.name)) {
          involvedCharacters.push(char);
          seenNames.add(char.name);
        }
      }
    }

    const bgDescription = sb.visual_description || sb.scene_description || sb.description || '';

    const prompt = buildKeyframePrompt(
      { title: sb.title, description: sb.description, camera_angle: sb.camera_angle, camera_movement: sb.camera_movement },
      involvedCharacters,
      bgDescription,
      stylePreset
    );

    const asset = GeneratedAssetModel.createWithEpisode({
      project_id: projectId,
      episode_id: episodeId,
      asset_type: 'keyframe',
      entity_type: 'storyboard',
      entity_id: sb.id,
      prompt,
      image_url: 'pending',
      style_preset: stylePreset,
      status: 'generating',
    });

    const task = WorkflowTaskModel.createWithEpisode({
      project_id: projectId,
      episode_id: episodeId,
      task_type: 'generate_keyframe',
      entity_type: 'storyboard',
      entity_id: sb.id,
    });

    try {
      WorkflowTaskModel.updateStatus((task as any).id, 'running');

      const filePath = await generateImage(prompt, { size: '1792x1024', ...imageOpts });

      GeneratedAssetModel.updateStatus((asset as any).id, 'completed', filePath);
      WorkflowTaskModel.updateStatus((task as any).id, 'completed');

      db.prepare('UPDATE storyboards SET image_url = ? WHERE id = ?').run(filePath, sb.id);

      logger.info(`Keyframe generated for storyboard ${sb.id} (episode ${episodeId})`);
    } catch (err: any) {
      logger.error(`Keyframe generation failed for storyboard ${sb.id} (episode ${episodeId}):`, err.message);
      GeneratedAssetModel.updateStatus((asset as any).id, 'failed', undefined, err.message);
      WorkflowTaskModel.updateStatus((task as any).id, 'failed', err.message);
    }
  }
}
