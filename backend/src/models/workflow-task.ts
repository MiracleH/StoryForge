import { getDatabase } from '../database/setup';

export const WorkflowTaskModel = {
  findByProject(projectId: number, status?: string) {
    const db = getDatabase();
    let query = 'SELECT * FROM workflow_tasks WHERE project_id = ?';
    const params: any[] = [projectId];
    if (status) { query += ' AND status = ?'; params.push(status); }
    query += ' ORDER BY created_at ASC';
    return db.prepare(query).all(...params);
  },

  findById(id: number) {
    return getDatabase().prepare('SELECT * FROM workflow_tasks WHERE id = ?').get(id);
  },

  findPending(projectId: number) {
    return getDatabase().prepare(
      "SELECT * FROM workflow_tasks WHERE project_id = ? AND status = 'pending' ORDER BY created_at ASC"
    ).all(projectId);
  },

  countByStatus(projectId: number) {
    const rows = getDatabase().prepare(
      'SELECT status, COUNT(*) as count FROM workflow_tasks WHERE project_id = ? GROUP BY status'
    ).all(projectId) as Array<{ status: string; count: number }>;

    const counts = { pending: 0, running: 0, completed: 0, failed: 0, cancelled: 0 };
    for (const row of rows) {
      if (row.status in counts) (counts as any)[row.status] = row.count;
    }
    return counts;
  },

  create(data: {
    project_id: number;
    task_type: string;
    entity_type?: string;
    entity_id?: number;
    max_retries?: number;
  }) {
    const result = getDatabase().prepare(
      'INSERT INTO workflow_tasks (project_id, task_type, entity_type, entity_id, max_retries) VALUES (?, ?, ?, ?, ?)'
    ).run(data.project_id, data.task_type, data.entity_type || null, data.entity_id || null, data.max_retries || 3);
    return getDatabase().prepare('SELECT * FROM workflow_tasks WHERE id = ?').get(result.lastInsertRowid);
  },

  updateStatus(id: number, status: string, errorMessage?: string, resultData?: string) {
    const updates = ['status = ?'];
    const values: any[] = [status];

    if (status === 'running') {
      updates.push('started_at = CURRENT_TIMESTAMP');
    } else if (status === 'completed' || status === 'failed') {
      updates.push('completed_at = CURRENT_TIMESTAMP');
    }
    if (errorMessage !== undefined) { updates.push('error_message = ?'); values.push(errorMessage); }
    if (resultData !== undefined) { updates.push('result_data = ?'); values.push(resultData); }

    values.push(id);
    getDatabase().prepare(`UPDATE workflow_tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return getDatabase().prepare('SELECT * FROM workflow_tasks WHERE id = ?').get(id);
  },

  incrementRetry(id: number) {
    getDatabase().prepare(
      "UPDATE workflow_tasks SET retry_count = retry_count + 1, status = 'pending' WHERE id = ?"
    ).run(id);
    return getDatabase().prepare('SELECT * FROM workflow_tasks WHERE id = ?').get(id);
  },

  deleteByProject(projectId: number) {
    return getDatabase().prepare('DELETE FROM workflow_tasks WHERE project_id = ?').run(projectId);
  },

  countByEpisode(episodeId: number) {
    const rows = getDatabase().prepare(
      'SELECT status, COUNT(*) as count FROM workflow_tasks WHERE episode_id = ? GROUP BY status'
    ).all(episodeId) as Array<{ status: string; count: number }>;

    const counts = { pending: 0, running: 0, completed: 0, failed: 0, cancelled: 0 };
    for (const row of rows) {
      if (row.status in counts) (counts as any)[row.status] = row.count;
    }
    return counts;
  },

  findByEpisode(episodeId: number, status?: string) {
    const db = getDatabase();
    let query = 'SELECT * FROM workflow_tasks WHERE episode_id = ?';
    const params: any[] = [episodeId];
    if (status) { query += ' AND status = ?'; params.push(status); }
    query += ' ORDER BY created_at ASC';
    return db.prepare(query).all(...params);
  },

  deleteByEpisode(episodeId: number) {
    return getDatabase().prepare('DELETE FROM workflow_tasks WHERE episode_id = ?').run(episodeId);
  },

  createWithEpisode(data: {
    project_id: number;
    episode_id: number;
    task_type: string;
    entity_type?: string;
    entity_id?: number;
    max_retries?: number;
  }) {
    const result = getDatabase().prepare(
      'INSERT INTO workflow_tasks (project_id, episode_id, task_type, entity_type, entity_id, max_retries) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(data.project_id, data.episode_id, data.task_type, data.entity_type || null, data.entity_id || null, data.max_retries || 3);
    return getDatabase().prepare('SELECT * FROM workflow_tasks WHERE id = ?').get(result.lastInsertRowid);
  },
};
