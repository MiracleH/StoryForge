import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { StoryboardModel } from '../models/storyboard';
import { DialogueModel } from '../models/dialogue';

export const StoryboardController = {
  listByScene(req: AuthRequest, res: Response) {
    const sceneId = Number(req.params.sceneId);
    if (!StoryboardModel.verifySceneOwnership(sceneId, req.user!.id)) throw createError('Scene not found', 404);
    res.json({ success: true, data: StoryboardModel.findByScene(sceneId) });
  },

  getById(req: AuthRequest, res: Response) {
    const sb = StoryboardModel.findByIdWithDialogues(Number(req.params.id), req.user!.id);
    if (!sb) throw createError('Storyboard not found', 404);
    res.json({ success: true, data: sb });
  },

  create(req: AuthRequest, res: Response) {
    const { scene_id, title, description, image_url, duration, camera_angle, camera_movement, order_index, transition_type, transition_duration } = req.body;
    if (!scene_id) throw createError('Scene ID is required', 400);
    if (!StoryboardModel.verifySceneOwnership(scene_id, req.user!.id)) throw createError('Scene not found', 404);
    const sb = StoryboardModel.create({ scene_id, title, description, image_url, duration, camera_angle, camera_movement, order_index, transition_type, transition_duration });
    res.status(201).json({ success: true, data: sb });
  },

  update(req: AuthRequest, res: Response) {
    const { title, description, image_url, duration, camera_angle, camera_movement, order_index, transition_type, transition_duration } = req.body;
    if (!StoryboardModel.findByIdWithOwnership(Number(req.params.id), req.user!.id)) throw createError('Storyboard not found', 404);
    const sb = StoryboardModel.update(Number(req.params.id), { title, description, image_url, duration, camera_angle, camera_movement, order_index, transition_type, transition_duration });
    res.json({ success: true, data: sb });
  },

  delete(req: AuthRequest, res: Response) {
    if (!StoryboardModel.findByIdWithOwnership(Number(req.params.id), req.user!.id)) throw createError('Storyboard not found', 404);
    StoryboardModel.delete(Number(req.params.id));
    res.json({ success: true, message: 'Storyboard deleted successfully' });
  },

  addDialogue(req: AuthRequest, res: Response) {
    const { character_id, content, position_x, position_y, style, order_index } = req.body;
    if (!content) throw createError('Content is required', 400);
    if (!StoryboardModel.findByIdWithOwnership(Number(req.params.id), req.user!.id)) throw createError('Storyboard not found', 404);
    const dialogue = DialogueModel.create(Number(req.params.id), { character_id, content, position_x, position_y, style, order_index });
    res.status(201).json({ success: true, data: dialogue });
  },

  updateDialogue(req: AuthRequest, res: Response) {
    const { character_id, content, position_x, position_y, style, order_index } = req.body;
    if (!DialogueModel.findByIdWithOwnership(Number(req.params.id), req.user!.id)) throw createError('Dialogue not found', 404);
    const dialogue = DialogueModel.update(Number(req.params.id), { character_id, content, position_x, position_y, style, order_index });
    res.json({ success: true, data: dialogue });
  },

  deleteDialogue(req: AuthRequest, res: Response) {
    if (!DialogueModel.findByIdWithOwnership(Number(req.params.id), req.user!.id)) throw createError('Dialogue not found', 404);
    DialogueModel.delete(Number(req.params.id));
    res.json({ success: true, message: 'Dialogue deleted successfully' });
  },

  reorder(req: AuthRequest, res: Response) {
    const sceneId = Number(req.params.sceneId);
    const { storyboard_ids } = req.body;
    if (!Array.isArray(storyboard_ids)) throw createError('Storyboard IDs array is required', 400);
    if (!StoryboardModel.verifySceneOwnership(sceneId, req.user!.id)) throw createError('Scene not found', 404);
    const storyboards = StoryboardModel.reorder(sceneId, storyboard_ids);
    res.json({ success: true, data: storyboards });
  },
};
