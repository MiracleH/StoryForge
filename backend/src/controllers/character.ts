import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { CharacterModel } from '../models/character';
import { ProjectModel } from '../models/project';

export const CharacterController = {
  listByProject(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    if (!ProjectModel.verifyProjectOwnership(projectId, req.user!.id)) throw createError('Project not found', 404);
    res.json({ success: true, data: CharacterModel.findByProject(projectId) });
  },

  getById(req: AuthRequest, res: Response) {
    const character = CharacterModel.findByIdWithOwnership(Number(req.params.id), req.user!.id);
    if (!character) throw createError('Character not found', 404);
    res.json({ success: true, data: character });
  },

  create(req: AuthRequest, res: Response) {
    const { project_id, name, description, personality, appearance, avatar, style } = req.body;
    if (!project_id || !name) throw createError('Project ID and name are required', 400);
    if (!ProjectModel.verifyProjectOwnership(project_id, req.user!.id)) throw createError('Project not found', 404);
    const character = CharacterModel.create({ project_id, name, description, personality, appearance, avatar, style });
    res.status(201).json({ success: true, data: character });
  },

  update(req: AuthRequest, res: Response) {
    const { name, description, personality, appearance, avatar, style } = req.body;
    if (!CharacterModel.findByIdWithOwnership(Number(req.params.id), req.user!.id)) throw createError('Character not found', 404);
    const character = CharacterModel.update(Number(req.params.id), { name, description, personality, appearance, avatar, style });
    res.json({ success: true, data: character });
  },

  delete(req: AuthRequest, res: Response) {
    if (!CharacterModel.findByIdWithOwnership(Number(req.params.id), req.user!.id)) throw createError('Character not found', 404);
    CharacterModel.delete(Number(req.params.id));
    res.json({ success: true, message: 'Character deleted successfully' });
  },
};
