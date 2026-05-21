/**
 * 素材生成器服务
 * Stage 2: 批量生成角色/场景/道具素材，带并发控制、重试、进度追踪
 */

import { generateImage, generateSpeech, downloadImage, saveFile, isImageConfigured } from './ai';
import { buildCharacterPrompt, buildBackgroundPrompt } from './style-consistency';
import { GeneratedAssetModel } from '../models/generated-asset';
import { WorkflowTaskModel } from '../models/workflow-task';
import { getDatabase } from '../database/setup';
import { logger } from '../utils/logger';

const MAX_CONCURRENT = 3;

class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise(resolve => { this.queue.push(resolve); });
  }

  release() {
    const next = this.queue.shift();
    if (next) next();
    else this.permits++;
  }
}

function updateProjectProgress(projectId: number) {
  const counts = WorkflowTaskModel.countByStatus(projectId);
  const total = counts.pending + counts.running + counts.completed + counts.failed;
  const progress = total > 0 ? (counts.completed / total) * 100 : 0;
  getDatabase().prepare(
    'UPDATE projects SET workflow_progress = ? WHERE id = ?'
  ).run(Math.round(progress * 10) / 10, projectId);
}

async function generateWithRetry(
  taskId: number,
  generateFn: () => Promise<string>
): Promise<string> {
  const task = WorkflowTaskModel.findById(taskId) as any;
  const maxRetries = task?.max_retries || 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      WorkflowTaskModel.updateStatus(taskId, 'running');
      const result = await generateFn();
      WorkflowTaskModel.updateStatus(taskId, 'completed', undefined, result);
      return result;
    } catch (err: any) {
      logger.error(`Task ${taskId} attempt ${attempt + 1} failed:`, err.message);
      if (attempt >= maxRetries) {
        WorkflowTaskModel.updateStatus(taskId, 'failed', err.message);
        throw err;
      }
      const delay = Math.min(1000 * Math.pow(4, attempt), 30000);
      await new Promise(r => setTimeout(r, delay));
      if (attempt < maxRetries) {
        WorkflowTaskModel.incrementRetry(taskId);
      }
    }
  }
  throw new Error('Max retries exceeded');
}

export async function generateCharacterAsset(
  character: any,
  stylePreset: string,
  projectId: number
): Promise<any> {
  const prompt = character.image_prompt || buildCharacterPrompt(character, stylePreset);

  const asset = GeneratedAssetModel.create({
    project_id: projectId,
    asset_type: 'character_design',
    entity_type: 'character',
    entity_id: character.id,
    name: character.name,
    description: character.description,
    prompt,
    voice_prompt: character.voice_prompt || null,
    image_url: 'pending',
    style_preset: stylePreset,
    status: 'generating',
  });

  const task = WorkflowTaskModel.create({
    project_id: projectId,
    task_type: 'generate_character',
    entity_type: 'character',
    entity_id: character.id,
  });

  try {
    const imageUrl = await generateWithRetry((task as any).id, async () => {
      const url = await generateImage(prompt, { size: '1024x1024' });
      const buffer = await downloadImage(url);
      return saveFile(buffer, `ai-character-${character.id}-${Date.now()}.png`);
    });
    GeneratedAssetModel.updateStatus((asset as any).id, 'completed', imageUrl);
    return { ...(asset as any), image_url: imageUrl, status: 'completed' };
  } catch (err: any) {
    GeneratedAssetModel.updateStatus((asset as any).id, 'failed', undefined, err.message);
    return { ...(asset as any), status: 'failed', error_message: err.message };
  }
}

export async function generateBackgroundAsset(
  scene: any,
  stylePreset: string,
  projectId: number
): Promise<any> {
  const prompt = scene.image_prompt || buildBackgroundPrompt(scene, stylePreset);

  const asset = GeneratedAssetModel.create({
    project_id: projectId,
    asset_type: 'background',
    entity_type: 'scene',
    entity_id: scene.id,
    name: scene.title,
    description: scene.description,
    prompt,
    image_url: 'pending',
    style_preset: stylePreset,
    status: 'generating',
  });

  const task = WorkflowTaskModel.create({
    project_id: projectId,
    task_type: 'generate_background',
    entity_type: 'scene',
    entity_id: scene.id,
  });

  try {
    const imageUrl = await generateWithRetry((task as any).id, async () => {
      const url = await generateImage(prompt, { size: '1792x1024' });
      const buffer = await downloadImage(url);
      return saveFile(buffer, `ai-bg-${scene.id}-${Date.now()}.png`);
    });
    GeneratedAssetModel.updateStatus((asset as any).id, 'completed', imageUrl);
    return { ...(asset as any), image_url: imageUrl, status: 'completed' };
  } catch (err: any) {
    GeneratedAssetModel.updateStatus((asset as any).id, 'failed', undefined, err.message);
    return { ...(asset as any), status: 'failed', error_message: err.message };
  }
}

export async function generatePropAsset(
  prop: any,
  stylePreset: string,
  projectId: number
): Promise<any> {
  const prompt = prop.image_prompt || `${stylePreset} style, ${prop.name}, ${prop.description}, high quality, detailed`;

  const asset = GeneratedAssetModel.create({
    project_id: projectId,
    asset_type: 'prop',
    entity_type: 'project',
    entity_id: projectId,
    name: prop.name,
    description: prop.description,
    prompt,
    image_url: 'pending',
    style_preset: stylePreset,
    status: 'generating',
  });

  const task = WorkflowTaskModel.create({
    project_id: projectId,
    task_type: 'generate_prop',
    entity_type: 'project',
    entity_id: projectId,
  });

  try {
    const imageUrl = await generateWithRetry((task as any).id, async () => {
      const url = await generateImage(prompt, { size: '1024x1024' });
      const buffer = await downloadImage(url);
      return saveFile(buffer, `ai-prop-${Date.now()}.png`);
    });
    GeneratedAssetModel.updateStatus((asset as any).id, 'completed', imageUrl);
    return { ...(asset as any), image_url: imageUrl, status: 'completed' };
  } catch (err: any) {
    GeneratedAssetModel.updateStatus((asset as any).id, 'failed', undefined, err.message);
    return { ...(asset as any), status: 'failed', error_message: err.message };
  }
}

export async function generateAssetAudio(
  assetId: number,
  voicePrompt: string
): Promise<string> {
  const asset = GeneratedAssetModel.findById(assetId) as any;
  if (!asset) throw new Error('Asset not found');

  const task = WorkflowTaskModel.create({
    project_id: asset.project_id,
    task_type: 'generate_asset_audio',
    entity_type: 'generated_asset',
    entity_id: assetId,
  });

  try {
    const audioUrl = await generateWithRetry((task as any).id, async () => {
      const buffer = await generateSpeech(voicePrompt);
      return saveFile(buffer, `audio/ai-voice-${assetId}-${Date.now()}.mp3`);
    });
    GeneratedAssetModel.updateAudio(assetId, audioUrl);
    return audioUrl;
  } catch (err: any) {
    logger.error(`Audio generation failed for asset ${assetId}:`, err.message);
    throw err;
  }
}

export async function processAssetQueue(projectId: number): Promise<void> {
  if (!isImageConfigured()) {
    throw new Error('AI 图片生成未配置，请设置 AI_IMAGE_API_KEY 或 AI_API_KEY');
  }

  const db = getDatabase();
  const characters = db.prepare('SELECT * FROM characters WHERE project_id = ?').all(projectId) as any[];
  const scenes = db.prepare(
    'SELECT s.* FROM scenes s JOIN chapters c ON s.chapter_id = c.id WHERE c.project_id = ?'
  ).all(projectId) as any[];

  // Get props from generated_assets where asset_type='prop' and status='pending'
  const pendingProps = db.prepare(
    "SELECT * FROM generated_assets WHERE project_id = ? AND asset_type = 'prop' AND status = 'pending'"
  ).all(projectId) as any[];

  const stylePreset = (db.prepare('SELECT style_preset FROM projects WHERE id = ?').get(projectId) as any)?.style_preset || 'anime';

  const sem = new Semaphore(MAX_CONCURRENT);
  const tasks: Promise<void>[] = [];

  for (const char of characters) {
    tasks.push(
      (async () => {
        await sem.acquire();
        try {
          await generateCharacterAsset(char, stylePreset, projectId);
          updateProjectProgress(projectId);
        } finally {
          sem.release();
        }
      })()
    );
  }

  for (const scene of scenes) {
    tasks.push(
      (async () => {
        await sem.acquire();
        try {
          await generateBackgroundAsset(scene, stylePreset, projectId);
          updateProjectProgress(projectId);
        } finally {
          sem.release();
        }
      })()
    );
  }

  for (const prop of pendingProps) {
    tasks.push(
      (async () => {
        await sem.acquire();
        try {
          const url = await generateWithRetry(0, async () => {
            const imgUrl = await generateImage(prop.prompt, { size: '1024x1024' });
            const buffer = await downloadImage(imgUrl);
            return saveFile(buffer, `ai-prop-${prop.id}-${Date.now()}.png`);
          });
          GeneratedAssetModel.updateStatus(prop.id, 'completed', url);
          updateProjectProgress(projectId);
        } catch (err: any) {
          GeneratedAssetModel.updateStatus(prop.id, 'failed', undefined, err.message);
        } finally {
          sem.release();
        }
      })()
    );
  }

  await Promise.allSettled(tasks);
}

// ==================== Episode-scoped version ====================

function updateEpisodeProgress(episodeId: number) {
  const counts = WorkflowTaskModel.countByEpisode(episodeId);
  const total = counts.pending + counts.running + counts.completed + counts.failed;
  const progress = total > 0 ? (counts.completed / total) * 100 : 0;
  getDatabase().prepare(
    'UPDATE episodes SET workflow_progress = ? WHERE id = ?'
  ).run(Math.round(progress * 10) / 10, episodeId);
}

export async function processAssetQueueForEpisode(projectId: number, episodeId: number): Promise<void> {
  if (!isImageConfigured()) {
    throw new Error('AI 图片生成未配置，请设置 AI_IMAGE_API_KEY 或 AI_API_KEY');
  }

  const db = getDatabase();

  // Characters are project-level (shared across episodes)
  const characters = db.prepare('SELECT * FROM characters WHERE project_id = ?').all(projectId) as any[];

  // Scenes are scoped to this episode
  const scenes = db.prepare(
    'SELECT s.* FROM scenes s JOIN chapters c ON s.chapter_id = c.id WHERE c.episode_id = ?'
  ).all(episodeId) as any[];

  // Props are project-level
  const pendingProps = db.prepare(
    "SELECT * FROM generated_assets WHERE project_id = ? AND asset_type = 'prop' AND status = 'pending' AND (episode_id IS NULL OR episode_id = ?)"
  ).all(projectId, episodeId) as any[];

  const stylePreset = (db.prepare('SELECT style_preset FROM episodes WHERE id = ?').get(episodeId) as any)?.style_preset || 'anime';

  const sem = new Semaphore(MAX_CONCURRENT);
  const tasks: Promise<void>[] = [];

  for (const char of characters) {
    tasks.push(
      (async () => {
        await sem.acquire();
        try {
          // Use episode-aware create methods
          const prompt = char.image_prompt || buildCharacterPrompt(char, stylePreset);
          const asset = GeneratedAssetModel.createWithEpisode({
            project_id: projectId,
            episode_id: episodeId,
            asset_type: 'character_design',
            entity_type: 'character',
            entity_id: char.id,
            name: char.name,
            description: char.description,
            prompt,
            voice_prompt: char.voice_prompt || null,
            image_url: 'pending',
            style_preset: stylePreset,
            status: 'generating',
          });
          const task = WorkflowTaskModel.createWithEpisode({
            project_id: projectId,
            episode_id: episodeId,
            task_type: 'generate_character',
            entity_type: 'character',
            entity_id: char.id,
          });
          const imageUrl = await generateWithRetry((task as any).id, async () => {
            const url = await generateImage(prompt, { size: '1024x1024' });
            const buffer = await downloadImage(url);
            return saveFile(buffer, `ai-character-${char.id}-${Date.now()}.png`);
          });
          GeneratedAssetModel.updateStatus((asset as any).id, 'completed', imageUrl);
          updateEpisodeProgress(episodeId);
        } catch (err: any) {
          logger.error(`Character asset failed for episode ${episodeId}:`, err.message);
        } finally {
          sem.release();
        }
      })()
    );
  }

  for (const scene of scenes) {
    tasks.push(
      (async () => {
        await sem.acquire();
        try {
          const prompt = scene.image_prompt || buildBackgroundPrompt(scene, stylePreset);
          const asset = GeneratedAssetModel.createWithEpisode({
            project_id: projectId,
            episode_id: episodeId,
            asset_type: 'background',
            entity_type: 'scene',
            entity_id: scene.id,
            name: scene.title,
            description: scene.description,
            prompt,
            image_url: 'pending',
            style_preset: stylePreset,
            status: 'generating',
          });
          const task = WorkflowTaskModel.createWithEpisode({
            project_id: projectId,
            episode_id: episodeId,
            task_type: 'generate_background',
            entity_type: 'scene',
            entity_id: scene.id,
          });
          const imageUrl = await generateWithRetry((task as any).id, async () => {
            const url = await generateImage(prompt, { size: '1792x1024' });
            const buffer = await downloadImage(url);
            return saveFile(buffer, `ai-bg-${scene.id}-${Date.now()}.png`);
          });
          GeneratedAssetModel.updateStatus((asset as any).id, 'completed', imageUrl);
          updateEpisodeProgress(episodeId);
        } catch (err: any) {
          logger.error(`Background asset failed for episode ${episodeId}:`, err.message);
        } finally {
          sem.release();
        }
      })()
    );
  }

  for (const prop of pendingProps) {
    tasks.push(
      (async () => {
        await sem.acquire();
        try {
          const asset = GeneratedAssetModel.createWithEpisode({
            project_id: projectId,
            episode_id: episodeId,
            asset_type: 'prop',
            entity_type: 'project',
            entity_id: projectId,
            name: prop.name,
            description: prop.description,
            prompt: prop.prompt,
            image_url: 'pending',
            style_preset: stylePreset,
            status: 'generating',
          });
          const task = WorkflowTaskModel.createWithEpisode({
            project_id: projectId,
            episode_id: episodeId,
            task_type: 'generate_prop',
            entity_type: 'project',
            entity_id: projectId,
          });
          const imageUrl = await generateWithRetry((task as any).id, async () => {
            const url = await generateImage(prop.prompt, { size: '1024x1024' });
            const buffer = await downloadImage(url);
            return saveFile(buffer, `ai-prop-${prop.id}-${Date.now()}.png`);
          });
          GeneratedAssetModel.updateStatus((asset as any).id, 'completed', imageUrl);
          updateEpisodeProgress(episodeId);
        } catch (err: any) {
          logger.error(`Prop asset failed for episode ${episodeId}:`, err.message);
        } finally {
          sem.release();
        }
      })()
    );
  }

  await Promise.allSettled(tasks);
}
