/**
 * 关键帧卡片创建服务
 * 为每个分镜创建关键帧占位卡片，关联 Stage 2 生成的素材作为参考图片
 */

import { getDatabase } from '../database/setup';
import { GeneratedAssetModel } from '../models/generated-asset';
import { logger } from '../utils/logger';

interface KeyframeCardResult {
  total: number;
  byVersion: { seedance: number; sora: number; standard: number };
}

export function createKeyframeCardsForEpisode(
  episodeId: number,
  stylePreset?: string
): KeyframeCardResult {
  const db = getDatabase();

  const episode = db.prepare('SELECT project_id, style_preset FROM episodes WHERE id = ?').get(episodeId) as any;
  if (!episode) throw new Error(`Episode ${episodeId} not found`);
  const projectId = episode.project_id;
  const style = stylePreset || episode.style_preset || 'anime';

  // Get all storyboards for this episode
  const storyboards = db.prepare(`
    SELECT sb.*, s.id as scene_id, s.title as scene_title, s.description as scene_description,
           s.location, s.time_of_day, s.mood, s.atmosphere, s.visual_description,
           c.title as chapter_title, c.order_index as chapter_order
    FROM storyboards sb
    JOIN scenes s ON sb.scene_id = s.id
    JOIN chapters c ON s.chapter_id = c.id
    WHERE c.episode_id = ?
    ORDER BY c.order_index, s.order_index, sb.order_index
  `).all(episodeId) as any[];

  // Get all completed character design assets
  const characterAssets = db.prepare(`
    SELECT ga.*, c.name as character_name
    FROM generated_assets ga
    JOIN characters c ON ga.entity_id = c.id
    WHERE ga.project_id = ? AND ga.asset_type = 'character_design'
      AND ga.entity_type = 'character' AND ga.status = 'completed'
      AND ga.image_url IS NOT NULL AND ga.image_url != 'pending'
  `).all(projectId) as any[];

  // Get all completed background assets
  const backgroundAssets = db.prepare(`
    SELECT ga.*, s.id as scene_id
    FROM generated_assets ga
    JOIN scenes s ON ga.entity_id = s.id
    JOIN chapters c ON s.chapter_id = c.id
    WHERE ga.project_id = ? AND ga.asset_type = 'background'
      AND ga.entity_type = 'scene' AND ga.status = 'completed'
      AND ga.image_url IS NOT NULL AND ga.image_url != 'pending'
      AND c.episode_id = ?
  `).all(projectId, episodeId) as any[];

  // Get all completed prop assets
  const propAssets = db.prepare(`
    SELECT * FROM generated_assets
    WHERE project_id = ? AND asset_type = 'prop'
      AND status = 'completed'
      AND image_url IS NOT NULL AND image_url != 'pending'
  `).all(projectId) as any[];

  // Get characters for dialogue matching
  const allCharacters = db.prepare(
    'SELECT id, name FROM characters WHERE project_id = ?'
  ).all(projectId) as any[];

  // Delete all existing keyframe cards for this episode (full recreation)
  db.prepare(`
    DELETE FROM generated_assets
    WHERE episode_id = ? AND asset_type = 'keyframe'
  `).run(episodeId);

  const byVersion = { seedance: 0, sora: 0, standard: 0 };

  for (const sb of storyboards) {
    // Get dialogues for this storyboard's scene to find involved characters
    const dialogues = db.prepare(`
      SELECT d.character_id FROM dialogues d
      JOIN storyboards sbd ON d.storyboard_id = sbd.id
      WHERE sbd.scene_id = ?
    `).all(sb.scene_id) as any[];

    const involvedCharIds = new Set(dialogues.map((d: any) => d.character_id).filter(Boolean));

    // Match character reference images (max 2)
    const matchedChars = characterAssets.filter((a: any) => involvedCharIds.has(a.entity_id));
    const charRefs = (matchedChars.length > 0 ? matchedChars : characterAssets).slice(0, 2);

    // Match background reference image
    const matchedBg = backgroundAssets.find((a: any) => a.scene_id === sb.scene_id);

    // Build reference image list (characters + scene only, no props — keep request small)
    const referenceImages: { assetId: number; imageUrl: string; label: string }[] = [];
    const referenceAssetIds: number[] = [];

    charRefs.forEach((ca: any) => {
      referenceImages.push({
        assetId: ca.id,
        imageUrl: ca.image_url,
        label: `${ca.character_name || '角色'}`,
      });
      referenceAssetIds.push(ca.id);
    });

    if (matchedBg) {
      referenceImages.push({
        assetId: matchedBg.id,
        imageUrl: matchedBg.image_url,
        label: '场景背景',
      });
      referenceAssetIds.push(matchedBg.id);
    }

    // Build concise prompt — keep it short for edits API
    const refLabels = referenceImages.map((r, i) => `@image${i + 1}:${r.label}`).join(' ');
    const versionTag = sb.version === 'seedance' ? '[Seedance]' : sb.version === 'sora' ? '[Sora]' : '';
    const cameraInfo = [sb.camera_angle, sb.camera_movement].filter(Boolean).join(', ');

    const prompt = [
      refLabels,
      `${versionTag} ${sb.title || ''}: ${sb.description || ''}`,
      cameraInfo ? `镜头: ${cameraInfo}` : '',
      sb.scene_description ? `场景: ${sb.scene_description.slice(0, 100)}` : '',
    ].filter(Boolean).join('; ');

    GeneratedAssetModel.createWithEpisode({
      project_id: projectId,
      episode_id: episodeId,
      asset_type: 'keyframe',
      entity_type: 'storyboard',
      entity_id: sb.id,
      name: sb.title || `分镜 #${sb.order_index + 1}`,
      description: sb.description || '',
      prompt,
      image_url: 'pending',
      style_preset: style,
      status: 'pending',
      width: 1792,
      height: 1024,
      metadata: JSON.stringify({ reference_asset_ids: referenceAssetIds }),
    });

    const version = (sb.version || 'standard') as keyof typeof byVersion;
    if (version in byVersion) {
      byVersion[version]++;
    }
  }

  // Also update the episode style_preset if changed
  if (stylePreset && stylePreset !== episode.style_preset) {
    db.prepare('UPDATE episodes SET style_preset = ? WHERE id = ?').run(stylePreset, episodeId);
  }

  const total = byVersion.seedance + byVersion.sora + byVersion.standard;
  logger.info(`关键帧卡片创建完成: episode ${episodeId}, 共 ${total} 个 (seedance:${byVersion.seedance} sora:${byVersion.sora} standard:${byVersion.standard})`);

  return { total, byVersion };
}
