import { getDatabase } from '../database/setup';

export const AssetModel = {
  findByUser(userId: number, params: { type?: string; page: number; limit: number }) {
    const db = getDatabase();
    let query = 'SELECT * FROM assets WHERE user_id = ?';
    const queryParams: any[] = [userId];
    if (params.type) { query += ' AND type = ?'; queryParams.push(params.type); }
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    queryParams.push(params.limit, (params.page - 1) * params.limit);
    const assets = db.prepare(query).all(...queryParams);

    let countQuery = 'SELECT COUNT(*) as total FROM assets WHERE user_id = ?';
    const countParams: any[] = [userId];
    if (params.type) { countQuery += ' AND type = ?'; countParams.push(params.type); }
    const { total } = db.prepare(countQuery).get(...countParams) as any;

    return { assets, total };
  },

  findById(id: number, userId: number) {
    return getDatabase().prepare('SELECT * FROM assets WHERE id = ? AND user_id = ?').get(id, userId);
  },

  create(data: { user_id: number; name: string; type: string; file_path: string; metadata?: string }) {
    const result = getDatabase().prepare(
      'INSERT INTO assets (user_id, name, type, file_path, metadata) VALUES (?, ?, ?, ?, ?)'
    ).run(data.user_id, data.name, data.type, data.file_path, data.metadata || null);
    return getDatabase().prepare('SELECT * FROM assets WHERE id = ?').get(result.lastInsertRowid);
  },

  update(id: number, data: Record<string, any>) {
    const updates: string[] = [];
    const values: any[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) { updates.push(`${key} = ?`); values.push(value); }
    }
    if (updates.length === 0) return null;
    values.push(id);
    getDatabase().prepare(`UPDATE assets SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return getDatabase().prepare('SELECT * FROM assets WHERE id = ?').get(id);
  },

  delete(id: number) {
    return getDatabase().prepare('DELETE FROM assets WHERE id = ?').run(id);
  },
};
