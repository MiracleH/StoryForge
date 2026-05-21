import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { SceneModel } from '../models/scene';

export const SceneController = {
  listByChapter(req: AuthRequest, res: Response) {
    const chapterId = Number(req.params.chapterId);
    if (!SceneModel.verifyChapterOwnership(chapterId, req.user!.id)) throw createError('Chapter not found', 404);
    res.json({ success: true, data: SceneModel.findByChapter(chapterId) });
  },

  getById(req: AuthRequest, res: Response) {
    const scene = SceneModel.findByIdWithOwnership(Number(req.params.id), req.user!.id);
    if (!scene) throw createError('Scene not found', 404);
    res.json({ success: true, data: scene });
  },

  create(req: AuthRequest, res: Response) {
    const { chapter_id, title, description, background_image, order_index } = req.body;
    if (!chapter_id) throw createError('Chapter ID is required', 400);
    if (!SceneModel.verifyChapterOwnership(chapter_id, req.user!.id)) throw createError('Chapter not found', 404);
    const scene = SceneModel.create({ chapter_id, title, description, background_image, order_index });
    res.status(201).json({ success: true, data: scene });
  },

  update(req: AuthRequest, res: Response) {
    const { title, description, background_image, order_index } = req.body;
    if (!SceneModel.findByIdWithOwnership(Number(req.params.id), req.user!.id)) throw createError('Scene not found', 404);
    const scene = SceneModel.update(Number(req.params.id), { title, description, background_image, order_index });
    res.json({ success: true, data: scene });
  },

  delete(req: AuthRequest, res: Response) {
    if (!SceneModel.findByIdWithOwnership(Number(req.params.id), req.user!.id)) throw createError('Scene not found', 404);
    SceneModel.delete(Number(req.params.id));
    res.json({ success: true, message: 'Scene deleted successfully' });
  },

  reorder(req: AuthRequest, res: Response) {
    const chapterId = Number(req.params.chapterId);
    const { scene_ids } = req.body;
    if (!Array.isArray(scene_ids)) throw createError('Scene IDs array is required', 400);
    if (!SceneModel.verifyChapterOwnership(chapterId, req.user!.id)) throw createError('Chapter not found', 404);
    const scenes = SceneModel.reorder(chapterId, scene_ids);
    res.json({ success: true, data: scenes });
  },
};
