import { getDatabase } from '../database/setup';

export const ChapterModel = {
  findByProject(projectId: number) {
    return getDatabase().prepare('SELECT * FROM chapters WHERE project_id = ? ORDER BY order_index').all(projectId);
  },

  findById(id: number) {
    return getDatabase().prepare('SELECT * FROM chapters WHERE id = ?').get(id);
  },

  findByIdWithOwnership(id: number, userId: number) {
    return getDatabase().prepare(`
      SELECT c.* FROM chapters c JOIN projects p ON c.project_id = p.id WHERE c.id = ? AND p.user_id = ?
    `).get(id, userId);
  },

  findByIdWithScenes(id: number, userId: number) {
    const chapter = getDatabase().prepare(`
      SELECT c.* FROM chapters c JOIN projects p ON c.project_id = p.id WHERE c.id = ? AND p.user_id = ?
    `).get(id, userId);
    if (!chapter) return null;
    const scenes = getDatabase().prepare('SELECT * FROM scenes WHERE chapter_id = ? ORDER BY order_index').all(id);
    return { ...(chapter as any), scenes };
  },

  create(data: { project_id: number; title: string; content?: string; order_index?: number }) {
    const result = getDatabase().prepare(
      'INSERT INTO chapters (project_id, title, content, order_index) VALUES (?, ?, ?, ?)'
    ).run(data.project_id, data.title, data.content || null, data.order_index ?? 0);
    return getDatabase().prepare('SELECT * FROM chapters WHERE id = ?').get(result.lastInsertRowid);
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
    getDatabase().prepare(`UPDATE chapters SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return getDatabase().prepare('SELECT * FROM chapters WHERE id = ?').get(id);
  },

  delete(id: number) {
    return getDatabase().prepare('DELETE FROM chapters WHERE id = ?').run(id);
  },

  reorder(projectId: number, ids: number[]) {
    const db = getDatabase();
    const stmt = db.prepare('UPDATE chapters SET order_index = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?');
    const reorder = db.transaction((chapterIds: number[]) => {
      chapterIds.forEach((id, index) => stmt.run(index, id, projectId));
    });
    reorder(ids);
  },
};
