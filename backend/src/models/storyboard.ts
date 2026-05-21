import { getDatabase } from '../database/setup';

export const StoryboardModel = {
  findByScene(sceneId: number) {
    return getDatabase().prepare('SELECT * FROM storyboards WHERE scene_id = ? ORDER BY order_index ASC').all(sceneId);
  },

  findById(id: number) {
    return getDatabase().prepare('SELECT * FROM storyboards WHERE id = ?').get(id);
  },

  findByIdWithOwnership(id: number, userId: number) {
    return getDatabase().prepare(`
      SELECT sb.* FROM storyboards sb JOIN scenes s ON sb.scene_id = s.id JOIN chapters ch ON s.chapter_id = ch.id JOIN projects p ON ch.project_id = p.id
      WHERE sb.id = ? AND p.user_id = ?
    `).get(id, userId);
  },

  findByIdWithDialogues(id: number, userId: number) {
    const sb = getDatabase().prepare(`
      SELECT sb.* FROM storyboards sb JOIN scenes s ON sb.scene_id = s.id JOIN chapters ch ON s.chapter_id = ch.id JOIN projects p ON ch.project_id = p.id
      WHERE sb.id = ? AND p.user_id = ?
    `).get(id, userId);
    if (!sb) return null;
    const dialogues = getDatabase().prepare(`
      SELECT d.*, c.name as character_name, c.avatar as character_avatar FROM dialogues d LEFT JOIN characters c ON d.character_id = c.id
      WHERE d.storyboard_id = ? ORDER BY d.order_index ASC
    `).all(id);
    return { ...(sb as any), dialogues };
  },

  verifySceneOwnership(sceneId: number, userId: number) {
    return getDatabase().prepare(`
      SELECT s.id FROM scenes s JOIN chapters ch ON s.chapter_id = ch.id JOIN projects p ON ch.project_id = p.id
      WHERE s.id = ? AND p.user_id = ?
    `).get(sceneId, userId);
  },

  create(data: { scene_id: number; title?: string; description?: string; image_url?: string; duration?: number; camera_angle?: string; camera_movement?: string; order_index?: number; transition_type?: string; transition_duration?: number }) {
    const result = getDatabase().prepare(
      'INSERT INTO storyboards (scene_id, title, description, image_url, duration, camera_angle, camera_movement, order_index, transition_type, transition_duration) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(data.scene_id, data.title || null, data.description || null, data.image_url || null, data.duration || 5.0, data.camera_angle || null, data.camera_movement || null, data.order_index || 0, data.transition_type || 'cut', data.transition_duration ?? 0.5);
    return getDatabase().prepare('SELECT * FROM storyboards WHERE id = ?').get(result.lastInsertRowid);
  },

  update(id: number, data: Record<string, any>) {
    const updates: string[] = [];
    const values: any[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) { updates.push(`${key} = ?`); values.push(value); }
    }
    if (updates.length === 0) return null;
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    getDatabase().prepare(`UPDATE storyboards SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return getDatabase().prepare('SELECT * FROM storyboards WHERE id = ?').get(id);
  },

  delete(id: number) {
    return getDatabase().prepare('DELETE FROM storyboards WHERE id = ?').run(id);
  },

  reorder(sceneId: number, ids: number[]) {
    const db = getDatabase();
    const stmt = db.prepare('UPDATE storyboards SET order_index = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND scene_id = ?');
    const reorder = db.transaction((sbIds: number[]) => {
      sbIds.forEach((id, index) => stmt.run(index, id, sceneId));
    });
    reorder(ids);
    return db.prepare('SELECT * FROM storyboards WHERE scene_id = ? ORDER BY order_index ASC').all(sceneId);
  },
};
