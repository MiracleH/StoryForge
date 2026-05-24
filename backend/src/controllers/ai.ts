import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { CharacterModel } from '../models/character';
import { SceneModel } from '../models/scene';
import { StoryboardModel } from '../models/storyboard';
import { CharacterAssetModel } from '../models/character-asset';
import { DialogueModel } from '../models/dialogue';
import { isAIConfigured, isImageConfigured, isTTSConfigured, aiConfig, generateImage, generateSpeech, saveFile, testTextConnection } from '../services/ai';
import { logger } from '../utils/logger';

export const AIController = {
  async listModels(req: AuthRequest, res: Response) {
    const { base_url, api_key } = req.body;
    if (!api_key) throw createError('API Key is required', 400);

    const url = (base_url || 'https://api.openai.com/v1').replace(/\/+$/, '') + '/models';
    try {
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${api_key}` },
      });
      if (!response.ok) {
        const text = await response.text();
        throw createError(`Provider returned ${response.status}: ${text}`, 502);
      }
      const data = await response.json() as any;
      const models = (data.data || [])
        .map((m: any) => m.id)
        .filter((id: string) => !!id)
        .sort();
      res.json({ success: true, data: { models } });
    } catch (err: any) {
      if (err.statusCode) throw err;
      throw createError(`Failed to fetch models: ${err.message}`, 502);
    }
  },

  getConfig(_req: AuthRequest, res: Response) {
    res.json({
      success: true,
      data: {
        available: isAIConfigured(),
        text:    { available: !!process.env.AI_TEXT_API_KEY  || !!process.env.AI_API_KEY,  model: aiConfig.textModel },
        image:   { available: isImageConfigured(), model: aiConfig.imageModel },
        video:   { available: !!process.env.AI_VIDEO_API_KEY || !!process.env.AI_API_KEY, model: aiConfig.videoModel },
        tts:     { available: isTTSConfigured(),   model: aiConfig.ttsModel, voice: aiConfig.ttsVoice },
      },
    });
  },

  async testText(req: AuthRequest, res: Response) {
    const { model, api_key, base_url } = req.body || {};
    const result = await testTextConnection(model, { api_key, base_url });
    res.json({ success: result.ok, data: result });
  },

  async generateCharacterImage(req: AuthRequest, res: Response) {
    const { character_id } = req.body;
    if (!character_id) throw createError('Character ID is required', 400);
    if (!isImageConfigured()) throw createError('AI image service not configured', 503);

    const character = CharacterModel.findByIdWithOwnership(character_id, req.user!.id) as any;
    if (!character) throw createError('Character not found', 404);

    const prompt = buildCharacterPrompt(character);
    logger.info(`Generating character image for "${character.name}": ${prompt}`);

    const filePath = await generateImage(prompt, { size: '1024x1024' });

    CharacterModel.update(character_id, { avatar: filePath });
    res.json({ success: true, data: { avatar: filePath } });
  },

  async generateSceneImage(req: AuthRequest, res: Response) {
    const { scene_id } = req.body;
    if (!scene_id) throw createError('Scene ID is required', 400);
    if (!isImageConfigured()) throw createError('AI image service not configured', 503);

    const scene = SceneModel.findByIdWithOwnership(scene_id, req.user!.id) as any;
    if (!scene) throw createError('Scene not found', 404);

    const prompt = buildScenePrompt(scene);
    logger.info(`Generating scene image for "${scene.title}": ${prompt}`);

    const filePath = await generateImage(prompt, { size: '1792x1024' });

    SceneModel.update(scene_id, { background_image: filePath });
    res.json({ success: true, data: { background_image: filePath } });
  },

  async generateStoryboardImage(req: AuthRequest, res: Response) {
    const { storyboard_id } = req.body;
    if (!storyboard_id) throw createError('Storyboard ID is required', 400);
    if (!isImageConfigured()) throw createError('AI image service not configured', 503);

    const sb = StoryboardModel.findByIdWithOwnership(storyboard_id, req.user!.id) as any;
    if (!sb) throw createError('Storyboard not found', 404);

    const prompt = buildStoryboardPrompt(sb);
    logger.info(`Generating storyboard image for "${sb.title}": ${prompt}`);

    const filePath = await generateImage(prompt, { size: '1792x1024' });

    StoryboardModel.update(storyboard_id, { image_url: filePath });
    res.json({ success: true, data: { image_url: filePath } });
  },

  async generateExpressionImage(req: AuthRequest, res: Response) {
    const { expression_id, character_id } = req.body;
    if (!expression_id || !character_id) throw createError('Expression ID and Character ID are required', 400);
    if (!isImageConfigured()) throw createError('AI image service not configured', 503);

    const character = CharacterModel.findByIdWithOwnership(character_id, req.user!.id) as any;
    if (!character) throw createError('Character not found', 404);

    const expressions = CharacterAssetModel.findExpressions(character_id) as any[];
    const expression = expressions.find((e: any) => e.id === expression_id);
    if (!expression) throw createError('Expression not found', 404);

    const prompt = `${character.style || 'anime'} style character portrait, name: ${character.name}, ${expression.emotion || ''} expression, ${expression.description || expression.name}, high quality, detailed face`;
    logger.info(`Generating expression image: ${prompt}`);

    const filePath = await generateImage(prompt, { size: '1024x1024' });

    const { getDatabase } = require('../database/setup');
    getDatabase().prepare('UPDATE character_expressions SET image_url = ? WHERE id = ?').run(filePath, expression_id);
    res.json({ success: true, data: { image_url: filePath } });
  },

  async generateTTS(req: AuthRequest, res: Response) {
    const { dialogue_id } = req.body;
    if (!dialogue_id) throw createError('Dialogue ID is required', 400);
    if (!isTTSConfigured()) throw createError('AI TTS service not configured', 503);

    const dialogue = DialogueModel.findByIdWithOwnership(dialogue_id, req.user!.id) as any;
    if (!dialogue) throw createError('Dialogue not found', 404);

    const text = dialogue.content;
    logger.info(`Generating TTS for dialogue ${dialogue_id}: "${text.substring(0, 50)}..."`);

    const audioBuffer = await generateSpeech(text);
    const filename = `ai-tts-${dialogue_id}-${Date.now()}.mp3`;
    const audioDir = require('path').join(require('path').resolve(process.env.UPLOAD_DIR || './uploads'), 'audio');
    if (!require('fs').existsSync(audioDir)) require('fs').mkdirSync(audioDir, { recursive: true });
    const filePath = saveFile(audioBuffer, `audio/${filename}`);

    const { getDatabase } = require('../database/setup');
    getDatabase().prepare('UPDATE dialogues SET audio_path = ? WHERE id = ?').run(filePath, dialogue_id);
    res.json({ success: true, data: { audio_path: filePath } });
  },
};

function buildCharacterPrompt(character: any): string {
  const parts = [`${character.style || 'anime'} style character illustration`];
  if (character.name) parts.push(`name: ${character.name}`);
  if (character.appearance) parts.push(`appearance: ${character.appearance}`);
  if (character.personality) parts.push(`personality: ${character.personality}`);
  if (character.description) parts.push(`description: ${character.description}`);
  parts.push('high quality, detailed, full body, character design sheet');
  return parts.join(', ');
}

function buildScenePrompt(scene: any): string {
  const parts = ['Scene background illustration'];
  if (scene.title) parts.push(`title: ${scene.title}`);
  if (scene.description) parts.push(`description: ${scene.description}`);
  parts.push('cinematic lighting, high quality, detailed environment, no characters');
  return parts.join(', ');
}

function buildStoryboardPrompt(sb: any): string {
  const parts = ['Storyboard frame illustration'];
  if (sb.title) parts.push(`title: ${sb.title}`);
  if (sb.description) parts.push(`scene: ${sb.description}`);
  if (sb.camera_angle) parts.push(`camera angle: ${sb.camera_angle}`);
  if (sb.camera_movement) parts.push(`camera movement: ${sb.camera_movement}`);
  parts.push('cinematic, high quality, detailed');
  return parts.join(', ');
}
