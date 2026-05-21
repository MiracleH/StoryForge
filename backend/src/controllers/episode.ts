import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { getDatabase } from '../database/setup';
import { EpisodeModel } from '../models/episode';
import { suggestEpisodes } from '../services/llm-analysis';
import { logger } from '../utils/logger';

function getProjectOwnership(projectId: number, userId: number): any {
  const db = getDatabase();
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(projectId, userId);
  if (!project) throw createError('Project not found', 404);
  return project;
}

function getLLMOpts(req: AuthRequest) {
  const { api_key, base_url, model } = req.body || {};
  return { api_key, base_url, model };
}

export const EpisodeController = {
  /**
   * AI 建议集数
   */
  async suggest(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    const project = getProjectOwnership(projectId, req.user!.id) as any;

    if (!project.novel_text) {
      throw createError('项目没有小说文本，请先导入或输入文本', 400);
    }

    const llmOpts = getLLMOpts(req);

    try {
      const suggestion = await suggestEpisodes(project.novel_text, llmOpts);
      res.json({ success: true, data: suggestion });
    } catch (err: any) {
      throw createError(`集数建议失败: ${err.message}`, 500);
    }
  },

  /**
   * 批量创建 episodes
   */
  createBatch(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    getProjectOwnership(projectId, req.user!.id);

    const { episodes } = req.body;
    if (!Array.isArray(episodes) || episodes.length === 0) {
      throw createError('请提供至少一个剧集', 400);
    }

    const db = getDatabase();
    const created: any[] = [];

    const insertStmt = db.prepare(`
      INSERT INTO episodes (project_id, title, description, episode_number, target_minutes, novel_text_segment, style_preset)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const tx = db.transaction(() => {
      for (const ep of episodes) {
        if (!ep.title || ep.episode_number == null) {
          throw createError('每个剧集需要 title 和 episode_number', 400);
        }
        const result = insertStmt.run(
          projectId,
          ep.title,
          ep.description || null,
          ep.episode_number,
          ep.target_minutes || 3.0,
          ep.novel_text_segment || null,
          ep.style_preset || 'anime'
        );
        created.push(EpisodeModel.findById(Number(result.lastInsertRowid)));
      }
    });

    tx();

    logger.info(`Created ${created.length} episodes for project ${projectId}`);
    res.json({ success: true, data: created });
  },

  /**
   * 获取项目的 episodes 列表
   */
  list(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    getProjectOwnership(projectId, req.user!.id);

    const episodes = EpisodeModel.findByProject(projectId);
    res.json({ success: true, data: episodes });
  },

  /**
   * 获取单个 episode
   */
  get(req: AuthRequest, res: Response) {
    const episodeId = Number(req.params.episodeId);
    const episode = EpisodeModel.findByIdWithOwnership(episodeId, req.user!.id);
    if (!episode) throw createError('Episode not found', 404);

    res.json({ success: true, data: episode });
  },

  /**
   * 更新 episode
   */
  update(req: AuthRequest, res: Response) {
    const episodeId = Number(req.params.episodeId);
    const episode = EpisodeModel.findByIdWithOwnership(episodeId, req.user!.id);
    if (!episode) throw createError('Episode not found', 404);

    const { title, description, target_minutes, novel_text_segment, style_preset } = req.body;
    const updated = EpisodeModel.update(episodeId, { title, description, target_minutes, novel_text_segment, style_preset });

    res.json({ success: true, data: updated });
  },

  /**
   * 删除 episode
   */
  delete(req: AuthRequest, res: Response) {
    const episodeId = Number(req.params.episodeId);
    const episode = EpisodeModel.findByIdWithOwnership(episodeId, req.user!.id);
    if (!episode) throw createError('Episode not found', 404);

    EpisodeModel.delete(episodeId);
    logger.info(`Deleted episode ${episodeId}`);
    res.json({ success: true });
  },
};
