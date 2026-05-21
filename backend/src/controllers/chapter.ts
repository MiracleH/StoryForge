import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { ChapterModel } from '../models/chapter';
import { ProjectModel } from '../models/project';

export const ChapterController = {
  listByProject(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    if (!ProjectModel.verifyProjectOwnership(projectId, req.user!.id)) throw createError('Project not found', 404);
    res.json({ success: true, data: ChapterModel.findByProject(projectId) });
  },

  getById(req: AuthRequest, res: Response) {
    const chapter = ChapterModel.findByIdWithScenes(Number(req.params.id), req.user!.id);
    if (!chapter) throw createError('Chapter not found', 404);
    res.json({ success: true, data: chapter });
  },

  create(req: AuthRequest, res: Response) {
    const { project_id, title, content, order_index } = req.body;
    if (!project_id || !title) throw createError('Project ID and title are required', 400);
    if (!ProjectModel.verifyProjectOwnership(project_id, req.user!.id)) throw createError('Project not found', 404);
    const chapter = ChapterModel.create({ project_id, title, content, order_index });
    res.status(201).json({ success: true, data: chapter });
  },

  update(req: AuthRequest, res: Response) {
    const { title, content, order_index } = req.body;
    if (!ChapterModel.findByIdWithOwnership(Number(req.params.id), req.user!.id)) throw createError('Chapter not found', 404);
    const chapter = ChapterModel.update(Number(req.params.id), { title, content, order_index });
    res.json({ success: true, data: chapter });
  },

  delete(req: AuthRequest, res: Response) {
    if (!ChapterModel.findByIdWithOwnership(Number(req.params.id), req.user!.id)) throw createError('Chapter not found', 404);
    ChapterModel.delete(Number(req.params.id));
    res.json({ success: true, message: 'Chapter deleted successfully' });
  },

  reorder(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    const { chapter_ids } = req.body;
    if (!Array.isArray(chapter_ids)) throw createError('chapter_ids must be an array', 400);
    if (!ProjectModel.verifyProjectOwnership(projectId, req.user!.id)) throw createError('Project not found', 404);
    ChapterModel.reorder(projectId, chapter_ids);
    res.json({ success: true, message: 'Chapters reordered successfully' });
  },
};
