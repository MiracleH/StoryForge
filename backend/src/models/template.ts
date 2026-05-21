import { getDatabase } from '../database/setup';

export const TemplateModel = {
  findAll(params: { category?: string; limit?: number }) {
    let sql = 'SELECT id, name, description, category, thumbnail, builtin, created_at FROM templates';
    const queryParams: any[] = [];
    if (params.category) { sql += ' WHERE category = ?'; queryParams.push(params.category); }
    sql += ' ORDER BY builtin DESC, created_at DESC';
    if (params.limit) { sql += ' LIMIT ?'; queryParams.push(params.limit); }
    return getDatabase().prepare(sql).all(...queryParams);
  },

  findById(id: number) {
    return getDatabase().prepare('SELECT * FROM templates WHERE id = ?').get(id);
  },

  create(data: { name: string; description?: string; category?: string; structure: string; thumbnail?: string }) {
    const result = getDatabase().prepare(
      'INSERT INTO templates (name, description, category, structure, thumbnail) VALUES (?, ?, ?, ?, ?)'
    ).run(data.name, data.description || null, data.category || 'drama', data.structure, data.thumbnail || null);
    return getDatabase().prepare('SELECT * FROM templates WHERE id = ?').get(result.lastInsertRowid);
  },

  delete(id: number) {
    return getDatabase().prepare('DELETE FROM templates WHERE id = ?').run(id);
  },

  applyToProject(templateId: number, projectId: number) {
    const db = getDatabase();
    const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(templateId) as any;
    if (!template) throw new Error('Template not found');

    const structure = JSON.parse(template.structure);
    const apply = db.transaction(() => {
      for (let ci = 0; ci < structure.chapters.length; ci++) {
        const ch = structure.chapters[ci];
        const chResult = db.prepare('INSERT INTO chapters (project_id, title, order_index) VALUES (?, ?, ?)').run(projectId, ch.title || `章节 ${ci + 1}`, ci);
        const chapterId = chResult.lastInsertRowid;
        for (let si = 0; si < (ch.scenes || []).length; si++) {
          const sc = ch.scenes[si];
          const scResult = db.prepare('INSERT INTO scenes (chapter_id, title, description, order_index) VALUES (?, ?, ?, ?)').run(chapterId, sc.title || `场景 ${si + 1}`, sc.description || null, si);
          const sceneId = scResult.lastInsertRowid;
          for (let bi = 0; bi < (sc.storyboards || []).length; bi++) {
            const sb = sc.storyboards[bi];
            db.prepare('INSERT INTO storyboards (scene_id, title, description, duration, camera_angle, order_index) VALUES (?, ?, ?, ?, ?, ?)').run(sceneId, sb.title || `分镜 ${bi + 1}`, sb.description || null, sb.duration || 5, sb.camera_angle || 'medium', bi);
          }
        }
      }
    });
    apply();
  },
};
