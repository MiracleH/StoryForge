/**
 * Sora 视频生成服务
 * 使用 Sora API 生成视频片段
 */

import fs from 'fs';
import path from 'path';
import { getDatabase } from '../database/setup';
import { logger } from '../utils/logger';

function env(key: string, fallback?: string): string {
  return process.env[key] || fallback || '';
}

const uploadDir = process.env.UPLOAD_DIR || './uploads';
const videoClipDir = path.join(uploadDir, 'video-clips');

// 确保输出目录存在
if (!fs.existsSync(videoClipDir)) {
  fs.mkdirSync(videoClipDir, { recursive: true });
}

interface SoraVideoRequest {
  model: string;
  prompt: string;
  seconds: string;
  input_reference?: string; // file path for first/last frame
}

interface SoraVideoResponse {
  id: string;
  status: string;
  error?: string;
}

interface SoraVideoContent {
  url: string;
  expires_at?: number;
}

/**
 * 获取 Sora API 配置
 */
function getSoraConfig(): { api_key: string; base_url: string } {
  const api_key = env('AI_VIDEO_API_KEY') || env('AI_API_KEY');
  const base_url = env('AI_VIDEO_BASE_URL') || env('AI_BASE_URL');

  if (!api_key) {
    throw new Error('AI_VIDEO_API_KEY 或 AI_API_KEY 未配置');
  }
  if (!base_url) {
    throw new Error('AI_VIDEO_BASE_URL 或 AI_BASE_URL 未配置');
  }

  return { api_key, base_url };
}

/**
 * 创建视频生成任务
 */
async function createVideoTask(params: {
  prompt: string;
  seconds: number;
  referenceImagePath?: string;
  model?: string;
}): Promise<string> {
  const { api_key, base_url } = getSoraConfig();
  const model = params.model || env('AI_VIDEO_MODEL') || 'sora-2';

  const formData = new FormData();
  formData.append('model', model);
  formData.append('prompt', params.prompt);
  formData.append('seconds', String(params.seconds));

  // 如果有参考图片，添加到 formData
  if (params.referenceImagePath && fs.existsSync(params.referenceImagePath)) {
    const imageBuffer = fs.readFileSync(params.referenceImagePath);
    const blob = new Blob([imageBuffer], { type: 'image/png' });
    formData.append('input_reference', blob, 'reference.png');
  }

  const url = `${base_url.replace(/\/$/, '')}/v1/videos`;
  logger.info(`Creating Sora video task: ${url}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${api_key}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sora API error (${response.status}): ${errorText}`);
  }

  const result = await response.json() as SoraVideoResponse;
  if (!result.id) {
    throw new Error('Sora API 返回无效的任务 ID');
  }

  logger.info(`Sora video task created: ${result.id}`);
  return result.id;
}

/**
 * 查询视频任务状态
 */
async function getVideoTaskStatus(taskId: string): Promise<SoraVideoResponse> {
  const { api_key, base_url } = getSoraConfig();

  const url = `${base_url.replace(/\/$/, '')}/v1/videos/${taskId}`;
  logger.info(`Checking Sora video task status: ${taskId}`);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${api_key}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sora API error (${response.status}): ${errorText}`);
  }

  return await response.json() as SoraVideoResponse;
}

/**
 * 获取视频内容（下载链接）
 */
async function getVideoContent(taskId: string): Promise<SoraVideoContent> {
  const { api_key, base_url } = getSoraConfig();

  const url = `${base_url.replace(/\/$/, '')}/v1/videos/${taskId}/content`;
  logger.info(`Getting Sora video content: ${taskId}`);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${api_key}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sora API error (${response.status}): ${errorText}`);
  }

  return await response.json() as SoraVideoContent;
}

/**
 * 下载视频到本地
 */
async function downloadVideo(videoUrl: string, outputPath: string): Promise<void> {
  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  logger.info(`Video downloaded to: ${outputPath}`);
}

/**
 * 生成单个分镜的视频片段
 */
export async function generateVideoClipForStoryboard(params: {
  storyboardId: number;
  episodeId: number;
  projectId: number;
  prompt: string;
  duration: number;
  referenceImagePath?: string;
  model?: string;
}): Promise<string> {
  const { storyboardId, episodeId, projectId, prompt, duration, referenceImagePath, model } = params;

  // 创建生成记录
  const db = getDatabase();
  const existingAsset = db.prepare(
    "SELECT id FROM generated_assets WHERE episode_id = ? AND asset_type = 'video_clip' AND entity_type = 'storyboard' AND entity_id = ?"
  ).get(episodeId, storyboardId) as any;

  let assetId: number;
  if (existingAsset) {
    assetId = existingAsset.id;
    db.prepare("UPDATE generated_assets SET status = 'generating', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(assetId);
  } else {
    const result = db.prepare(`
      INSERT INTO generated_assets (project_id, episode_id, asset_type, entity_type, entity_id, prompt, image_url, style_preset, status, updated_at)
      VALUES (?, ?, 'video_clip', 'storyboard', ?, ?, 'pending', 'anime', 'generating', CURRENT_TIMESTAMP)
    `).run(projectId, episodeId, storyboardId, prompt);
    assetId = result.lastInsertRowid as number;
  }

  try {
    // 创建视频任务
    const taskId = await createVideoTask({
      prompt,
      seconds: duration,
      referenceImagePath,
      model,
    });

    // 更新任务 ID 到 metadata
    db.prepare("UPDATE generated_assets SET metadata = ? WHERE id = ?").run(
      JSON.stringify({ sora_task_id: taskId }),
      assetId
    );

    // 轮询任务状态
    let status = 'pending';
    let videoUrl: string | null = null;
    let error: string | null = null;
    const maxAttempts = 120; // 最多等待 10 分钟
    const pollInterval = 5000; // 每 5 秒查询一次

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      const taskStatus = await getVideoTaskStatus(taskId);
      status = taskStatus.status;

      if (status === 'completed' || status === 'succeeded') {
        // 获取视频内容
        const content = await getVideoContent(taskId);
        videoUrl = content.url;
        break;
      } else if (status === 'failed' || status === 'cancelled') {
        error = taskStatus.error || '视频生成失败';
        break;
      }

      logger.info(`Sora video task ${taskId} status: ${status} (attempt ${attempt + 1}/${maxAttempts})`);
    }

    if (!videoUrl) {
      throw new Error(error || '视频生成超时');
    }

    // 下载视频
    const outputPath = path.join(videoClipDir, `clip-${assetId}-${Date.now()}.mp4`);
    await downloadVideo(videoUrl, outputPath);

    // 更新记录
    const localUrl = `/uploads/video-clips/${path.basename(outputPath)}`;
    db.prepare("UPDATE generated_assets SET status = 'completed', image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(localUrl, assetId);

    logger.info(`Video clip generated for storyboard ${storyboardId}: ${localUrl}`);
    return localUrl;
  } catch (err: any) {
    logger.error(`Video clip generation failed for storyboard ${storyboardId}:`, err.message);
    db.prepare("UPDATE generated_assets SET status = 'failed', metadata = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
      JSON.stringify({ error: err.message }),
      assetId
    );
    throw err;
  }
}

/**
 * 批量生成剧集的所有分镜视频片段
 */
export async function generateVideoClipsForEpisode(params: {
  episodeId: number;
  projectId: number;
  version?: string;
  model?: string;
  onProgress?: (completed: number, total: number) => void;
}): Promise<void> {
  const { episodeId, projectId, version, model, onProgress } = params;

  const db = getDatabase();

  // 获取分镜列表
  const storyboards = db.prepare(`
    SELECT sb.*, s.title as scene_title, s.description as scene_description,
           s.visual_description, s.mood, s.atmosphere,
           c.title as chapter_title
    FROM storyboards sb
    JOIN scenes s ON sb.scene_id = s.id
    JOIN chapters c ON s.chapter_id = c.id
    WHERE c.episode_id = ? ${version ? "AND sb.version = ?" : ""}
    ORDER BY c.order_index, s.order_index, sb.order_index
  `).all(...(version ? [episodeId, version] : [episodeId])) as any[];

  if (storyboards.length === 0) {
    throw new Error('没有找到分镜数据');
  }

  // 获取参考素材
  const characterAssets = db.prepare(`
    SELECT ga.*, c.name as character_name
    FROM generated_assets ga
    JOIN characters c ON ga.entity_id = c.id
    WHERE ga.project_id = ? AND ga.asset_type = 'character_design'
      AND ga.entity_type = 'character' AND ga.status = 'completed'
      AND ga.image_url IS NOT NULL AND ga.image_url != 'pending'
  `).all(projectId) as any[];

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

  // 获取角色信息用于 prompt 增强
  const characters = db.prepare('SELECT * FROM characters WHERE project_id = ?').all(projectId) as any[];

  let completed = 0;
  const total = storyboards.length;

  // 串行生成视频片段（避免并发 API 调用过多）
  for (const sb of storyboards) {
    try {
      // 检查是否已生成
      const existing = db.prepare(
        "SELECT id FROM generated_assets WHERE episode_id = ? AND asset_type = 'video_clip' AND entity_type = 'storyboard' AND entity_id = ? AND status = 'completed'"
      ).get(episodeId, sb.id) as any;

      if (existing) {
        completed++;
        onProgress?.(completed, total);
        continue;
      }

      // 构建增强 prompt
      const dialogues = db.prepare(
        'SELECT * FROM dialogues WHERE storyboard_id = ? ORDER BY order_index'
      ).all(sb.id) as any[];

      const involvedCharacters: string[] = [];
      for (const d of dialogues) {
        if (d.character_id) {
          const char = characters.find((c: any) => c.id === d.character_id);
          if (char && !involvedCharacters.includes(char.name)) {
            involvedCharacters.push(char.name);
          }
        }
      }

      // 匹配参考图片
      const matchedChars = characterAssets.filter((a: any) => involvedCharacters.includes(a.character_name));
      const charRefs = (matchedChars.length > 0 ? matchedChars : characterAssets).slice(0, 2);
      const matchedBg = backgroundAssets.find((a: any) => a.scene_id === sb.scene_id);

      // 选择首帧或尾帧作为参考
      let referenceImagePath: string | undefined;
      if (sb.image_url && fs.existsSync(sb.image_url)) {
        referenceImagePath = sb.image_url;
      } else if (sb.last_frame_image && fs.existsSync(sb.last_frame_image)) {
        referenceImagePath = sb.last_frame_image;
      } else if (matchedBg?.image_url && fs.existsSync(matchedBg.image_url)) {
        referenceImagePath = matchedBg.image_url;
      }

      // 构建视频 prompt
      const charDescriptions = charRefs.map((c: any) => c.character_name).join('、');
      const sceneDesc = sb.visual_description || sb.scene_description || sb.description || '';
      const cameraInfo = [sb.camera_angle, sb.camera_movement].filter(Boolean).join(' ');

      const videoPrompt = [
        charDescriptions ? `角色: ${charDescriptions}` : '',
        `场景: ${sb.scene_title || ''} - ${sceneDesc}`,
        sb.description || sb.title || '',
        cameraInfo ? `镜头: ${cameraInfo}` : '',
        sb.seedance_prompt || sb.sora_prompt || '',
      ].filter(Boolean).join('\n');

      // 生成视频片段
      await generateVideoClipForStoryboard({
        storyboardId: sb.id,
        episodeId,
        projectId,
        prompt: videoPrompt,
        duration: sb.duration || 5,
        referenceImagePath,
        model,
      });

      completed++;
      onProgress?.(completed, total);
    } catch (err: any) {
      logger.error(`Failed to generate video clip for storyboard ${sb.id}:`, err.message);
      completed++;
      onProgress?.(completed, total);
    }
  }

  logger.info(`Video clip generation completed for episode ${episodeId}: ${completed}/${total}`);
}
