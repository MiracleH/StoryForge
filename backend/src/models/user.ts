import { getDatabase } from '../database/setup';

export const UserModel = {
  findByUsername(username: string) {
    return getDatabase().prepare('SELECT * FROM users WHERE username = ?').get(username);
  },

  findByEmail(email: string) {
    return getDatabase().prepare('SELECT * FROM users WHERE email = ?').get(email);
  },

  findById(id: number) {
    return getDatabase().prepare('SELECT id, username, email, avatar, created_at FROM users WHERE id = ?').get(id);
  },

  findByIdWithPassword(id: number) {
    return getDatabase().prepare('SELECT * FROM users WHERE id = ?').get(id);
  },

  existsByEmailOrUsername(email: string, username: string) {
    return getDatabase().prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
  },

  existsByEmailOrUsernameExcluding(email: string, username: string, excludeId: number) {
    return getDatabase().prepare('SELECT id FROM users WHERE (email = ? OR username = ?) AND id != ?').get(email, username, excludeId);
  },

  create(data: { username: string; email: string; password: string }) {
    const result = getDatabase().prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)').run(data.username, data.email, data.password);
    return { id: result.lastInsertRowid, username: data.username, email: data.email };
  },

  updateProfile(id: number, data: { username?: string; email?: string; avatar?: string }) {
    const updates: string[] = [];
    const values: any[] = [];
    if (data.username !== undefined && data.username !== null) { updates.push('username = ?'); values.push(data.username); }
    if (data.email !== undefined && data.email !== null) { updates.push('email = ?'); values.push(data.email); }
    if (data.avatar !== undefined) { updates.push('avatar = ?'); values.push(data.avatar); }
    if (updates.length === 0) return;
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    getDatabase().prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  },

  updatePassword(id: number, hashedPassword: string) {
    getDatabase().prepare('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hashedPassword, id);
  },
};
