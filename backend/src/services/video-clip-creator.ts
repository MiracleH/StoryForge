/**
 * 视频片段卡片创建服务
 * 为每个分镜创建视频片段占位卡片，关联关键帧图片作为参考
 */

import { getDatabase } from '../database/setup';
import { GeneratedAssetModel } from '../models/generated-asset';
import { logger } from '../utils/logger';

export function createVideoClipsForEpisode(episodeId: number) {
  const db = getDatabase();

  const episode = db.prepare('SELECT project_id, style_preset FROM episodes WHERE id = ?').get(episodeId) as any;
  if (!episode) throw new Error(`Episode ${episodeId} not found`);
  const projectId = episode.project_id;
  const style = episode.style_preset || 'anime';

  // Get all storyboards for this episode
  const storyboards = db.prepare(`
    SELECT sb.*, s.title as scene_title, s.description as scene_description,
           c.title as chapter_title, c.order_index as chapter_order
    FROM storyboards sb
    JOIN scenes s ON sb.scene_id = s.id
    JOIN chapters c ON s.chapter_id = c.id
    WHERE c.episode_id = ?
    ORDER BY c.order_index, s.order_index, sb.order_index
  `).all(episodeId) as any[];

  if (storyboards.length === 0) {
    throw new Error('该剧集没有分镜，请先生成分镜');
  }

  // Get existing keyframe cards for matching
  const keyframes = db.prepare(`
    SELECT * FROM generated_assets
    WHERE episode_id = ? AND asset_type = 'keyframe' AND status = 'completed'
      AND image_url IS NOT NULL AND image_url != 'pending'
  `).all(episodeId) as any[];

  // Delete existing video clip cards (full recreation)
  db.prepare(`
    DELETE FROM generated_assets
    WHERE episode_id = ? AND asset_type = 'video_clip'
  `).run(episodeId);

  let total = 0;

  for (const sb of storyboards) {
    const version = sb.version || 'standard';
    const versionPrompt = version === 'seedance' ? sb.seedance_prompt : version === 'sora' ? sb.sora_prompt : sb.description;

    // Match keyframe for this storyboard (same entity_id and version)
    const matchedKeyframe = keyframes.find(
      (kf: any) => kf.entity_id === sb.id && kf.entity_type === 'storyboard'
    );

    const clipPrompt = versionPrompt || sb.description || sb.title || '';
    const referenceImagePath = matchedKeyframe?.image_url || null;

    const metadata: any = {
      storyboard_version: version,
      storyboard_id: sb.id,
      storyboard_title: sb.title,
      storyboard_description: sb.description,
      duration: sb.duration || 5,
      seconds: String(sb.duration || 5),
      ratio: sb.ratio || '16:9',
      resolution: sb.resolution || '1080p',
      generate_audio: true,
      camera_fixed: sb.camera_fixed || false,
      reference_image: referenceImagePath,
      last_frame_image: matchedKeyframe?.thumbnail_url || sb.last_frame_image || null,
      seedance_prompt: sb.seedance_prompt,
      sora_prompt: sb.sora_prompt,
      scene_title: sb.scene_title,
      chapter_title: sb.chapter_title,
    };

    GeneratedAssetModel.createWithEpisode({
      project_id: projectId,
      episode_id: episodeId,
      asset_type: 'video_clip',
      entity_type: 'storyboard',
      entity_id: sb.id,
      name: sb.title || `视频片段 #${sb.order_index + 1}`,
      description: clipPrompt.slice(0, 200),
      prompt: clipPrompt,
      image_url: 'pending',
      style_preset: style,
      status: 'pending',
      width: 1920,
      height: 1080,
      metadata: JSON.stringify(metadata),
    });

    total++;
  }

  logger.info(`视频片段卡片创建完成: episode ${episodeId}, 共 ${total} 个`);
  return { total };
}
