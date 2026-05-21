import { getDatabase } from '../database/setup';

export const VideoModel = {
  findByProject(projectId: number) {
    return getDatabase().prepare('SELECT * FROM videos WHERE project_id = ? ORDER BY created_at DESC').all(projectId);
  },

  findById(id: number) {
    return getDatabase().prepare('SELECT * FROM videos WHERE id = ?').get(id);
  },

  findByIdWithOwnership(id: number, userId: number) {
    return getDatabase().prepare(`
      SELECT v.* FROM videos v JOIN projects p ON v.project_id = p.id WHERE v.id = ? AND p.user_id = ?
    `).get(id, userId);
  },

  findByIdWithFilePath(id: number, userId: number) {
    return getDatabase().prepare(`
      SELECT v.id, v.file_path FROM videos v JOIN projects p ON v.project_id = p.id WHERE v.id = ? AND p.user_id = ?
    `).get(id, userId);
  },

  verifyProjectOwnership(projectId: number, userId: number) {
    return getDatabase().prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(projectId, userId);
  },

  create(data: { project_id: number; title?: string; description?: string; resolution?: string; bgm_path?: string | null; bgm_volume?: number }) {
    const result = getDatabase().prepare(
      'INSERT INTO videos (project_id, title, description, resolution, status, bgm_path, bgm_volume) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(data.project_id, data.title || null, data.description || null, data.resolution || '1080p', 'pending', data.bgm_path || null, data.bgm_volume ?? 0.5);
    return getDatabase().prepare('SELECT * FROM videos WHERE id = ?').get(result.lastInsertRowid);
  },

  updateStatus(id: number, data: { status: string; file_path?: string; thumbnail?: string; duration?: number }) {
    const updates: string[] = ['status = ?'];
    const values: any[] = [data.status];
    if (data.file_path !== undefined) { updates.push('file_path = ?'); values.push(data.file_path); }
    if (data.thumbnail !== undefined) { updates.push('thumbnail = ?'); values.push(data.thumbnail); }
    if (data.duration !== undefined) { updates.push('duration = ?'); values.push(data.duration); }
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    getDatabase().prepare(`UPDATE videos SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return getDatabase().prepare('SELECT * FROM videos WHERE id = ?').get(id);
  },

  delete(id: number) {
    return getDatabase().prepare('DELETE FROM videos WHERE id = ?').run(id);
  },

  getStats(projectId: number) {
    return getDatabase().prepare(`
      SELECT COUNT(*) as total_videos,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_videos,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing_videos,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_videos,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_videos,
        SUM(CASE WHEN status = 'completed' THEN duration ELSE 0 END) as total_duration
      FROM videos WHERE project_id = ?
    `).get(projectId);
  },

  getAssetPath(assetId: number) {
    return getDatabase().prepare('SELECT file_path FROM assets WHERE id = ? AND type = ?').get(assetId, 'audio');
  },
};
