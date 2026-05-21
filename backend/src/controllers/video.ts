import path from 'path';
import fs from 'fs';
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { VideoModel } from '../models/video';
import { enqueueVideoRender, isFFmpegAvailable } from '../services/videoRenderer';
import { logger } from '../utils/logger';

const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');

function resolveFilePath(filePath: string): string {
  const relative = filePath.replace(/^\/uploads\//, '');
  const resolved = path.resolve(uploadDir, relative);
  if (!resolved.startsWith(path.resolve(uploadDir))) {
    throw createError('Invalid file path', 400);
  }
  return resolved;
}

export const VideoController = {
  listByProject(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    if (!VideoModel.verifyProjectOwnership(projectId, req.user!.id)) throw createError('Project not found', 404);
    res.json({ success: true, data: VideoModel.findByProject(projectId) });
  },

  getById(req: AuthRequest, res: Response) {
    const video = VideoModel.findByIdWithOwnership(Number(req.params.id), req.user!.id);
    if (!video) throw createError('Video not found', 404);
    res.json({ success: true, data: video });
  },

  create(req: AuthRequest, res: Response) {
    const { project_id, title, description, resolution, bgm_asset_id, bgm_volume } = req.body;
    if (!project_id) throw createError('Project ID is required', 400);
    if (!VideoModel.verifyProjectOwnership(project_id, req.user!.id)) throw createError('Project not found', 404);

    let bgmPath: string | null = null;
    if (bgm_asset_id) {
      const asset = VideoModel.getAssetPath(bgm_asset_id) as any;
      if (asset) bgmPath = asset.file_path;
    }

    const video = VideoModel.create({ project_id, title, description, resolution, bgm_path: bgmPath, bgm_volume });

    if (isFFmpegAvailable()) {
      enqueueVideoRender({
        videoId: (video as any).id,
        projectId: project_id,
        resolution: resolution || '1080p',
        bgmPath: bgmPath || undefined,
        bgmVolume: bgm_volume ?? 0.5,
      });
      logger.info(`Video generation task queued: ${(video as any).id}`);
    } else {
      logger.warn(`Video ${(video as any).id} created but FFmpeg unavailable`);
    }

    res.status(201).json({ success: true, data: video });
  },

  updateStatus(req: AuthRequest, res: Response) {
    const { status, file_path, thumbnail, duration } = req.body;
    if (!status) throw createError('Status is required', 400);
    if (!VideoModel.findByIdWithOwnership(Number(req.params.id), req.user!.id)) throw createError('Video not found', 404);
    const video = VideoModel.updateStatus(Number(req.params.id), { status, file_path, thumbnail, duration });
    res.json({ success: true, data: video });
  },

  delete(req: AuthRequest, res: Response) {
    const video = VideoModel.findByIdWithFilePath(Number(req.params.id), req.user!.id) as any;
    if (!video) throw createError('Video not found', 404);

    if (video.file_path) {
      const filePath = resolveFilePath(video.file_path);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    VideoModel.delete(Number(req.params.id));
    res.json({ success: true, message: 'Video deleted successfully' });
  },

  getStats(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    if (!VideoModel.verifyProjectOwnership(projectId, req.user!.id)) throw createError('Project not found', 404);
    res.json({ success: true, data: VideoModel.getStats(projectId) });
  },

  getFFmpegStatus(_req: AuthRequest, res: Response) {
    res.json({ success: true, data: { available: isFFmpegAvailable() } });
  },
};
