import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { TemplateModel } from '../models/template';
import { ProjectModel } from '../models/project';

export const TemplateController = {
  list(req: AuthRequest, res: Response) {
    const { category, limit } = req.query;
    const templates = TemplateModel.findAll({ category: category as string, limit: limit ? Number(limit) : undefined });
    res.json({ success: true, data: templates });
  },

  getById(req: AuthRequest, res: Response) {
    const template = TemplateModel.findById(Number(req.params.id));
    if (!template) throw createError('Template not found', 404);
    res.json({ success: true, data: template });
  },

  create(req: AuthRequest, res: Response) {
    const { name, description, category, structure, thumbnail } = req.body;
    if (!name || !structure) throw createError('Name and structure are required', 400);
    const structureStr = typeof structure === 'string' ? structure : JSON.stringify(structure);
    const template = TemplateModel.create({ name, description, category, structure: structureStr, thumbnail });
    res.status(201).json({ success: true, data: template });
  },

  delete(req: AuthRequest, res: Response) {
    const template = TemplateModel.findById(Number(req.params.id)) as any;
    if (!template) throw createError('Template not found', 404);
    if (template.builtin) throw createError('Cannot delete builtin template', 400);
    TemplateModel.delete(Number(req.params.id));
    res.json({ success: true, message: 'Template deleted successfully' });
  },

  apply(req: AuthRequest, res: Response) {
    const { project_id } = req.body;
    if (!project_id) throw createError('Project ID is required', 400);
    if (!ProjectModel.verifyProjectOwnership(project_id, req.user!.id)) throw createError('Project not found', 404);
    TemplateModel.applyToProject(Number(req.params.id), project_id);
    res.json({ success: true, message: 'Template applied successfully' });
  },
};
