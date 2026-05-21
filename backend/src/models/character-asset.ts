import { getDatabase } from '../database/setup';

export const CharacterAssetModel = {
  findExpressions(characterId: number) {
    return getDatabase().prepare('SELECT * FROM character_expressions WHERE character_id = ? ORDER BY created_at DESC').all(characterId);
  },

  addExpression(characterId: number, data: { name: string; description?: string; image_url?: string; emotion?: string }) {
    const result = getDatabase().prepare(
      'INSERT INTO character_expressions (character_id, name, description, image_url, emotion) VALUES (?, ?, ?, ?, ?)'
    ).run(characterId, data.name, data.description || null, data.image_url || null, data.emotion || null);
    return getDatabase().prepare('SELECT * FROM character_expressions WHERE id = ?').get(result.lastInsertRowid);
  },

  deleteExpression(id: number) {
    return getDatabase().prepare('DELETE FROM character_expressions WHERE id = ?').run(id);
  },

  findActions(characterId: number) {
    return getDatabase().prepare('SELECT * FROM character_actions WHERE character_id = ? ORDER BY created_at DESC').all(characterId);
  },

  addAction(characterId: number, data: { name: string; description?: string; image_url?: string; category?: string }) {
    const result = getDatabase().prepare(
      'INSERT INTO character_actions (character_id, name, description, image_url, category) VALUES (?, ?, ?, ?, ?)'
    ).run(characterId, data.name, data.description || null, data.image_url || null, data.category || 'general');
    return getDatabase().prepare('SELECT * FROM character_actions WHERE id = ?').get(result.lastInsertRowid);
  },

  deleteAction(id: number) {
    return getDatabase().prepare('DELETE FROM character_actions WHERE id = ?').run(id);
  },
};
