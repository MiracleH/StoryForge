import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { ProjectModel } from '../models/project';
import { extractTextFromFile } from '../utils/fileParser';

export const ProjectController = {
  list(req: AuthRequest, res: Response) {
    const { status, page = 1, limit = 10 } = req.query;
    const { projects, total } = ProjectModel.findByUser(req.user!.id, { status: status as string, page: Number(page), limit: Number(limit) });
    res.json({ success: true, data: { projects, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } } });
  },

  getById(req: AuthRequest, res: Response) {
    const project = ProjectModel.findById(Number(req.params.id), req.user!.id);
    if (!project) throw createError('Project not found', 404);
    res.json({ success: true, data: project });
  },

  async create(req: AuthRequest, res: Response) {
    const { title, description, novel_text } = req.body;
    if (!title) throw createError('Title is required', 400);

    let finalText = novel_text || '';

    // 如果上传了文件，解析提取文本
    const file = (req as any).file;
    if (file && file.buffer) {
      const extracted = await extractTextFromFile(file.buffer, file.originalname);
      if (extracted.trim()) {
        finalText = extracted;
      }
    }

    const project = ProjectModel.create(req.user!.id, { title, description, novel_text: finalText || undefined });
    res.status(201).json({ success: true, data: project });
  },

  update(req: AuthRequest, res: Response) {
    const { title, description, status, cover_image, novel_text } = req.body;
    if (title === undefined && description === undefined && status === undefined && cover_image === undefined && novel_text === undefined) {
      throw createError('No fields to update', 400);
    }
    const project = ProjectModel.update(Number(req.params.id), req.user!.id, { title, description, status, cover_image, novel_text });
    if (!project) throw createError('Project not found', 404);
    res.json({ success: true, data: project });
  },

  delete(req: AuthRequest, res: Response) {
    ProjectModel.delete(Number(req.params.id), req.user!.id);
    res.json({ success: true, message: 'Project deleted successfully' });
  },

  getStats(req: AuthRequest, res: Response) {
    res.json({ success: true, data: ProjectModel.getStats(req.user!.id) });
  },

  exportProject(req: AuthRequest, res: Response) {
    if (!ProjectModel.verifyProjectOwnership(Number(req.params.id), req.user!.id)) throw createError('Project not found', 404);
    const data = ProjectModel.getFullTree(Number(req.params.id));
    if (!data) throw createError('Project not found', 404);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="project-${req.params.id}-export.json"`);
    res.json({ ...data, exported_at: new Date().toISOString() });
  },
};
