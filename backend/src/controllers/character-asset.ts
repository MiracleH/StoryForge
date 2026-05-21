import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { CharacterAssetModel } from '../models/character-asset';
import { CharacterModel } from '../models/character';

export const CharacterAssetController = {
  listExpressions(req: AuthRequest, res: Response) {
    const characterId = Number(req.params.characterId);
    if (!CharacterModel.findByIdWithOwnership(characterId, req.user!.id)) throw createError('Character not found', 404);
    res.json({ success: true, data: CharacterAssetModel.findExpressions(characterId) });
  },

  addExpression(req: AuthRequest, res: Response) {
    const characterId = Number(req.params.characterId);
    const { name, description, image_url, emotion } = req.body;
    if (!name) throw createError('Name is required', 400);
    if (!CharacterModel.findByIdWithOwnership(characterId, req.user!.id)) throw createError('Character not found', 404);
    const expression = CharacterAssetModel.addExpression(characterId, { name, description, image_url, emotion });
    res.status(201).json({ success: true, data: expression });
  },

  deleteExpression(req: AuthRequest, res: Response) {
    CharacterAssetModel.deleteExpression(Number(req.params.id));
    res.json({ success: true, message: 'Expression deleted' });
  },

  listActions(req: AuthRequest, res: Response) {
    const characterId = Number(req.params.characterId);
    if (!CharacterModel.findByIdWithOwnership(characterId, req.user!.id)) throw createError('Character not found', 404);
    res.json({ success: true, data: CharacterAssetModel.findActions(characterId) });
  },

  addAction(req: AuthRequest, res: Response) {
    const characterId = Number(req.params.characterId);
    const { name, description, image_url, category } = req.body;
    if (!name) throw createError('Name is required', 400);
    if (!CharacterModel.findByIdWithOwnership(characterId, req.user!.id)) throw createError('Character not found', 404);
    const action = CharacterAssetModel.addAction(characterId, { name, description, image_url, category });
    res.status(201).json({ success: true, data: action });
  },

  deleteAction(req: AuthRequest, res: Response) {
    CharacterAssetModel.deleteAction(Number(req.params.id));
    res.json({ success: true, message: 'Action deleted' });
  },
};
