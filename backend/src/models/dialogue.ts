import { getDatabase } from '../database/setup';

export const DialogueModel = {
  findByStoryboard(storyboardId: number) {
    return getDatabase().prepare(`
      SELECT d.*, c.name as character_name, c.avatar as character_avatar
      FROM dialogues d LEFT JOIN characters c ON d.character_id = c.id
      WHERE d.storyboard_id = ? ORDER BY d.order_index ASC
    `).all(storyboardId);
  },

  findById(id: number) {
    return getDatabase().prepare(`
      SELECT d.*, c.name as character_name, c.avatar as character_avatar
      FROM dialogues d LEFT JOIN characters c ON d.character_id = c.id WHERE d.id = ?
    `).get(id);
  },

  findByIdWithOwnership(id: number, userId: number) {
    return getDatabase().prepare(`
      SELECT d.id FROM dialogues d JOIN storyboards sb ON d.storyboard_id = sb.id JOIN scenes s ON sb.scene_id = s.id
      JOIN chapters ch ON s.chapter_id = ch.id JOIN projects p ON ch.project_id = p.id
      WHERE d.id = ? AND p.user_id = ?
    `).get(id, userId);
  },

  create(storyboardId: number, data: { character_id?: number; content: string; position_x?: number; position_y?: number; style?: string; order_index?: number }) {
    const result = getDatabase().prepare(
      'INSERT INTO dialogues (storyboard_id, character_id, content, position_x, position_y, style, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(storyboardId, data.character_id || null, data.content, data.position_x || 50, data.position_y || 50, data.style || 'speech', data.order_index || 0);
    return getDatabase().prepare(`
      SELECT d.*, c.name as character_name, c.avatar as character_avatar
      FROM dialogues d LEFT JOIN characters c ON d.character_id = c.id WHERE d.id = ?
    `).get(result.lastInsertRowid);
  },

  update(id: number, data: Record<string, any>) {
    const updates: string[] = [];
    const values: any[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) { updates.push(`${key} = ?`); values.push(value); }
    }
    if (updates.length === 0) return null;
    values.push(id);
    getDatabase().prepare(`UPDATE dialogues SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return getDatabase().prepare(`
      SELECT d.*, c.name as character_name, c.avatar as character_avatar
      FROM dialogues d LEFT JOIN characters c ON d.character_id = c.id WHERE d.id = ?
    `).get(id);
  },

  delete(id: number) {
    return getDatabase().prepare('DELETE FROM dialogues WHERE id = ?').run(id);
  },
};
