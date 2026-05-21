import path from 'path';
import fs from 'fs';
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { AssetModel } from '../models/asset';

const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');

function resolveFilePath(filePath: string): string {
  // filePath stored as /uploads/filename.ext — strip leading /uploads and join with uploadDir
  const relative = filePath.replace(/^\/uploads\//, '');
  return path.join(uploadDir, relative);
}

export const AssetController = {
  list(req: AuthRequest, res: Response) {
    const { type, page = 1, limit = 20 } = req.query;
    const { assets, total } = AssetModel.findByUser(req.user!.id, { type: type as string, page: Number(page), limit: Number(limit) });
    res.json({
      success: true,
      data: {
        assets,
        pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
      },
    });
  },

  getById(req: AuthRequest, res: Response) {
    const asset = AssetModel.findById(Number(req.params.id), req.user!.id);
    if (!asset) throw createError('Asset not found', 404);
    res.json({ success: true, data: asset });
  },

  upload(req: AuthRequest, res: Response) {
    const { name, type, metadata } = req.body;
    const file = (req as any).file;
    if (!file) throw createError('File is required', 400);
    if (!name || !type) throw createError('Name and type are required', 400);

    const validTypes = ['character', 'scene', 'audio', 'font', 'template'];
    if (!validTypes.includes(type)) throw createError('Invalid asset type', 400);

    const filePath = `/uploads/${file.filename}`;
    const asset = AssetModel.create({ user_id: req.user!.id, name, type, file_path: filePath, metadata });
    res.status(201).json({ success: true, data: asset });
  },

  update(req: AuthRequest, res: Response) {
    const { name, metadata } = req.body;
    if (!AssetModel.findById(Number(req.params.id), req.user!.id)) throw createError('Asset not found', 404);
    if (name === undefined && metadata === undefined) throw createError('No fields to update', 400);
    const asset = AssetModel.update(Number(req.params.id), { name, metadata });
    res.json({ success: true, data: asset });
  },

  delete(req: AuthRequest, res: Response) {
    const asset = AssetModel.findById(Number(req.params.id), req.user!.id) as any;
    if (!asset) throw createError('Asset not found', 404);

    if (asset.file_path) {
      const fullPath = resolveFilePath(asset.file_path);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    }

    AssetModel.delete(Number(req.params.id));
    res.json({ success: true, message: 'Asset deleted successfully' });
  },
};
