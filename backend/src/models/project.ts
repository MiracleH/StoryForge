import { getDatabase } from '../database/setup';

export const ProjectModel = {
  findByUser(userId: number, params: { status?: string; page: number; limit: number }) {
    const db = getDatabase();
    let query = 'SELECT * FROM projects WHERE user_id = ?';
    const queryParams: any[] = [userId];
    if (params.status) { query += ' AND status = ?'; queryParams.push(params.status); }
    query += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
    queryParams.push(params.limit, (params.page - 1) * params.limit);
    const projects = db.prepare(query).all(...queryParams);

    let countQuery = 'SELECT COUNT(*) as total FROM projects WHERE user_id = ?';
    const countParams: any[] = [userId];
    if (params.status) { countQuery += ' AND status = ?'; countParams.push(params.status); }
    const { total } = db.prepare(countQuery).get(...countParams) as any;

    return { projects, total };
  },

  findById(id: number, userId: number) {
    return getDatabase().prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(id, userId);
  },

  findByIdOnly(id: number) {
    return getDatabase().prepare('SELECT * FROM projects WHERE id = ?').get(id);
  },

  verifyProjectOwnership(projectId: number, userId: number) {
    return getDatabase().prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(projectId, userId);
  },

  create(userId: number, data: { title: string; description?: string; novel_text?: string }) {
    const result = getDatabase().prepare(
      'INSERT INTO projects (user_id, title, description, novel_text) VALUES (?, ?, ?, ?)'
    ).run(userId, data.title, data.description || null, data.novel_text || null);
    return getDatabase().prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
  },

  update(id: number, userId: number, data: Record<string, any>) {
    const updates: string[] = [];
    const values: any[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) { updates.push(`${key} = ?`); values.push(value); }
    }
    if (updates.length === 0) return null;
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id, userId);
    const result = getDatabase().prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);
    if (result.changes === 0) return null;
    return getDatabase().prepare('SELECT * FROM projects WHERE id = ?').get(id);
  },

  delete(id: number, userId: number) {
    return getDatabase().prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').run(id, userId);
  },

  getStats(userId: number) {
    return getDatabase().prepare(`
      SELECT COUNT(*) as total_projects,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft_projects,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_projects,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_projects
      FROM projects WHERE user_id = ?
    `).get(userId);
  },

  getFullTree(projectId: number) {
    const db = getDatabase();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
    if (!project) return null;

    const chapters = db.prepare('SELECT * FROM chapters WHERE project_id = ? ORDER BY order_index').all(projectId) as any[];
    const chaptersWithDetails = chapters.map((chapter: any) => {
      const scenes = db.prepare('SELECT * FROM scenes WHERE chapter_id = ? ORDER BY order_index').all(chapter.id) as any[];
      const scenesWithStoryboards = scenes.map((scene: any) => {
        const storyboards = db.prepare('SELECT * FROM storyboards WHERE scene_id = ? ORDER BY order_index').all(scene.id) as any[];
        const storyboardsWithDialogues = storyboards.map((sb: any) => {
          const dialogues = db.prepare('SELECT * FROM dialogues WHERE storyboard_id = ? ORDER BY order_index').all(sb.id);
          return { ...sb, dialogues };
        });
        return { ...scene, storyboards: storyboardsWithDialogues };
      });
      return { ...chapter, scenes: scenesWithStoryboards };
    });

    const characters = db.prepare('SELECT * FROM characters WHERE project_id = ?').all(projectId);
    const videos = db.prepare('SELECT * FROM videos WHERE project_id = ?').all(projectId);

    return { project, chapters: chaptersWithDetails, characters, videos };
  },
};
