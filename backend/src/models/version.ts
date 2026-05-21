import { getDatabase } from '../database/setup';

export const VersionModel = {
  findByProject(projectId: number) {
    return getDatabase().prepare(
      'SELECT id, project_id, version_num, label, created_at FROM project_versions WHERE project_id = ? ORDER BY version_num DESC'
    ).all(projectId);
  },

  findById(id: number) {
    return getDatabase().prepare('SELECT * FROM project_versions WHERE id = ?').get(id);
  },

  findByIdWithOwnership(id: number, userId: number) {
    return getDatabase().prepare(`
      SELECT pv.* FROM project_versions pv JOIN projects p ON pv.project_id = p.id WHERE pv.id = ? AND p.user_id = ?
    `).get(id, userId);
  },

  getNextVersionNum(projectId: number) {
    const maxVer = getDatabase().prepare('SELECT MAX(version_num) as max_ver FROM project_versions WHERE project_id = ?').get(projectId) as any;
    return (maxVer?.max_ver || 0) + 1;
  },

  createSnapshot(projectId: number, label?: string) {
    const db = getDatabase();
    const nextVer = this.getNextVersionNum(projectId);

    const chapters = db.prepare('SELECT * FROM chapters WHERE project_id = ? ORDER BY order_index').all(projectId) as any[];
    const characters = db.prepare('SELECT * FROM characters WHERE project_id = ?').all(projectId) as any[];

    const snapshotChapters = [];
    for (const ch of chapters) {
      const scenes = db.prepare('SELECT * FROM scenes WHERE chapter_id = ? ORDER BY order_index').all(ch.id) as any[];
      const snapshotScenes = [];
      for (const sc of scenes) {
        const storyboards = db.prepare('SELECT * FROM storyboards WHERE scene_id = ? ORDER BY order_index').all(sc.id) as any[];
        const snapshotSBs = storyboards.map((sb: any) => ({
          ...sb,
          dialogues: db.prepare('SELECT * FROM dialogues WHERE storyboard_id = ? ORDER BY order_index').all(sb.id),
        }));
        snapshotScenes.push({ ...sc, storyboards: snapshotSBs });
      }
      snapshotChapters.push({ ...ch, scenes: snapshotScenes });
    }

    const snapshot = JSON.stringify({ chapters: snapshotChapters, characters });
    db.prepare('INSERT INTO project_versions (project_id, version_num, label, snapshot) VALUES (?, ?, ?, ?)').run(projectId, nextVer, label || `v${nextVer}`, snapshot);
    return db.prepare('SELECT id, project_id, version_num, label, created_at FROM project_versions WHERE project_id = ? AND version_num = ?').get(projectId, nextVer);
  },

  delete(id: number) {
    return getDatabase().prepare('DELETE FROM project_versions WHERE id = ?').run(id);
  },
};
