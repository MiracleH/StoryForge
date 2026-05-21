import { getDatabase } from '../database/setup';

export const SceneModel = {
  findByChapter(chapterId: number) {
    return getDatabase().prepare('SELECT * FROM scenes WHERE chapter_id = ? ORDER BY order_index ASC').all(chapterId);
  },

  findById(id: number) {
    return getDatabase().prepare('SELECT * FROM scenes WHERE id = ?').get(id);
  },

  findByIdWithOwnership(id: number, userId: number) {
    return getDatabase().prepare(`
      SELECT s.* FROM scenes s JOIN chapters ch ON s.chapter_id = ch.id JOIN projects p ON ch.project_id = p.id
      WHERE s.id = ? AND p.user_id = ?
    `).get(id, userId);
  },

  verifyChapterOwnership(chapterId: number, userId: number) {
    return getDatabase().prepare(`
      SELECT ch.id FROM chapters ch JOIN projects p ON ch.project_id = p.id WHERE ch.id = ? AND p.user_id = ?
    `).get(chapterId, userId);
  },

  create(data: { chapter_id: number; title?: string; description?: string; background_image?: string; order_index?: number }) {
    const result = getDatabase().prepare(
      'INSERT INTO scenes (chapter_id, title, description, background_image, order_index) VALUES (?, ?, ?, ?, ?)'
    ).run(data.chapter_id, data.title || null, data.description || null, data.background_image || null, data.order_index || 0);
    return getDatabase().prepare('SELECT * FROM scenes WHERE id = ?').get(result.lastInsertRowid);
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
    getDatabase().prepare(`UPDATE scenes SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return getDatabase().prepare('SELECT * FROM scenes WHERE id = ?').get(id);
  },

  delete(id: number) {
    return getDatabase().prepare('DELETE FROM scenes WHERE id = ?').run(id);
  },

  reorder(chapterId: number, ids: number[]) {
    const db = getDatabase();
    const stmt = db.prepare('UPDATE scenes SET order_index = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND chapter_id = ?');
    const reorder = db.transaction((sceneIds: number[]) => {
      sceneIds.forEach((id, index) => stmt.run(index, id, chapterId));
    });
    reorder(ids);
    return db.prepare('SELECT * FROM scenes WHERE chapter_id = ? ORDER BY order_index ASC').all(chapterId);
  },
};
