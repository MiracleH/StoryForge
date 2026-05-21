import { getDatabase } from '../database/setup';

export const CharacterModel = {
  findByProject(projectId: number) {
    return getDatabase().prepare('SELECT * FROM characters WHERE project_id = ? ORDER BY created_at DESC').all(projectId);
  },

  findById(id: number) {
    return getDatabase().prepare('SELECT * FROM characters WHERE id = ?').get(id);
  },

  findByIdWithOwnership(id: number, userId: number) {
    return getDatabase().prepare(`
      SELECT c.* FROM characters c JOIN projects p ON c.project_id = p.id WHERE c.id = ? AND p.user_id = ?
    `).get(id, userId);
  },

  create(data: { project_id: number; name: string; description?: string; personality?: string; appearance?: string; avatar?: string; style?: string }) {
    const result = getDatabase().prepare(
      'INSERT INTO characters (project_id, name, description, personality, appearance, avatar, style) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(data.project_id, data.name, data.description || null, data.personality || null, data.appearance || null, data.avatar || null, data.style || 'anime');
    return getDatabase().prepare('SELECT * FROM characters WHERE id = ?').get(result.lastInsertRowid);
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
    getDatabase().prepare(`UPDATE characters SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return getDatabase().prepare('SELECT * FROM characters WHERE id = ?').get(id);
  },

  delete(id: number) {
    return getDatabase().prepare('DELETE FROM characters WHERE id = ?').run(id);
  },
};
