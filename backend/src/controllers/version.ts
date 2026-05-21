import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { VersionModel } from '../models/version';
import { ProjectModel } from '../models/project';
import { getDatabase } from '../database/setup';

export const VersionController = {
  listByProject(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    if (!ProjectModel.verifyProjectOwnership(projectId, req.user!.id)) throw createError('Project not found', 404);
    res.json({ success: true, data: VersionModel.findByProject(projectId) });
  },

  getById(req: AuthRequest, res: Response) {
    const version = VersionModel.findByIdWithOwnership(Number(req.params.id), req.user!.id);
    if (!version) throw createError('Version not found', 404);
    res.json({ success: true, data: version });
  },

  create(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    const { label } = req.body;
    if (!ProjectModel.verifyProjectOwnership(projectId, req.user!.id)) throw createError('Project not found', 404);
    const version = VersionModel.createSnapshot(projectId, label);
    res.status(201).json({ success: true, data: version });
  },

  restore(req: AuthRequest, res: Response) {
    const version = VersionModel.findByIdWithOwnership(Number(req.params.id), req.user!.id) as any;
    if (!version) throw createError('Version not found', 404);

    const snapshot = JSON.parse(version.snapshot);
    const projectId = version.project_id;
    const db = getDatabase();

    const restore = db.transaction(() => {
      db.prepare('DELETE FROM dialogues WHERE storyboard_id IN (SELECT sb.id FROM storyboards sb JOIN scenes s ON sb.scene_id = s.id JOIN chapters ch ON s.chapter_id = ch.id WHERE ch.project_id = ?)').run(projectId);
      db.prepare('DELETE FROM storyboards WHERE scene_id IN (SELECT s.id FROM scenes s JOIN chapters ch ON s.chapter_id = ch.id WHERE ch.project_id = ?)').run(projectId);
      db.prepare('DELETE FROM scenes WHERE chapter_id IN (SELECT id FROM chapters WHERE project_id = ?)').run(projectId);
      db.prepare('DELETE FROM chapters WHERE project_id = ?').run(projectId);
      db.prepare('DELETE FROM characters WHERE project_id = ?').run(projectId);

      for (const ch of snapshot.chapters) {
        const chResult = db.prepare('INSERT INTO chapters (project_id, title, order_index) VALUES (?, ?, ?)').run(projectId, ch.title, ch.order_index);
        const chapterId = chResult.lastInsertRowid;

        for (const sc of ch.scenes) {
          const scResult = db.prepare('INSERT INTO scenes (chapter_id, title, description, background_image, order_index) VALUES (?, ?, ?, ?, ?)').run(chapterId, sc.title, sc.description, sc.background_image, sc.order_index);
          const sceneId = scResult.lastInsertRowid;

          for (const sb of sc.storyboards) {
            const sbResult = db.prepare('INSERT INTO storyboards (scene_id, title, description, image_url, duration, camera_angle, camera_movement, order_index, transition_type, transition_duration) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(sceneId, sb.title, sb.description, sb.image_url, sb.duration, sb.camera_angle, sb.camera_movement, sb.order_index, sb.transition_type || 'cut', sb.transition_duration || 0.5);
            const sbId = sbResult.lastInsertRowid;

            for (const d of sb.dialogues || []) {
              db.prepare('INSERT INTO dialogues (storyboard_id, character_id, content, position_x, position_y, style, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)').run(sbId, d.character_id, d.content, d.position_x, d.position_y, d.style, d.order_index);
            }
          }
        }
      }

      for (const ch of snapshot.characters || []) {
        db.prepare('INSERT INTO characters (project_id, name, description, personality, appearance, style) VALUES (?, ?, ?, ?, ?, ?)').run(projectId, ch.name, ch.description, ch.personality, ch.appearance, ch.style);
      }
    });

    restore();
    res.json({ success: true, message: `Restored to version ${version.version_num}` });
  },

  delete(req: AuthRequest, res: Response) {
    if (!VersionModel.findByIdWithOwnership(Number(req.params.id), req.user!.id)) throw createError('Version not found', 404);
    VersionModel.delete(Number(req.params.id));
    res.json({ success: true, message: 'Version deleted' });
  },
};
