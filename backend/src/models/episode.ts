import { getDatabase } from '../database/setup';

export interface Episode {
  id: number;
  project_id: number;
  title: string;
  description: string | null;
  episode_number: number;
  target_minutes: number;
  novel_text_segment: string | null;
  workflow_state: string;
  workflow_error: string | null;
  workflow_progress: number;
  style_preset: string;
  created_at: string;
  updated_at: string;
}

export const EpisodeModel = {
  findByProject(projectId: number): Episode[] {
    return getDatabase().prepare(
      'SELECT * FROM episodes WHERE project_id = ? ORDER BY episode_number'
    ).all(projectId) as Episode[];
  },

  findById(id: number): Episode | undefined {
    return getDatabase().prepare(
      'SELECT * FROM episodes WHERE id = ?'
    ).get(id) as Episode | undefined;
  },

  findByIdWithOwnership(id: number, userId: number): Episode | undefined {
    return getDatabase().prepare(`
      SELECT e.* FROM episodes e
      JOIN projects p ON e.project_id = p.id
      WHERE e.id = ? AND p.user_id = ?
    `).get(id, userId) as Episode | undefined;
  },

  create(data: {
    project_id: number;
    title: string;
    description?: string;
    episode_number: number;
    target_minutes?: number;
    novel_text_segment?: string;
    style_preset?: string;
  }): Episode {
    const result = getDatabase().prepare(`
      INSERT INTO episodes (project_id, title, description, episode_number, target_minutes, novel_text_segment, style_preset)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.project_id,
      data.title,
      data.description || null,
      data.episode_number,
      data.target_minutes || 3.0,
      data.novel_text_segment || null,
      data.style_preset || 'anime'
    );
    return this.findById(result.lastInsertRowid as number)!;
  },

  update(id: number, data: Partial<Pick<Episode, 'title' | 'description' | 'target_minutes' | 'novel_text_segment' | 'style_preset'>>): Episode | null {
    const existing = this.findById(id);
    if (!existing) return null;

    getDatabase().prepare(`
      UPDATE episodes SET
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        target_minutes = COALESCE(?, target_minutes),
        novel_text_segment = COALESCE(?, novel_text_segment),
        style_preset = COALESCE(?, style_preset),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      data.title ?? null,
      data.description ?? null,
      data.target_minutes ?? null,
      data.novel_text_segment ?? null,
      data.style_preset ?? null,
      id
    );
    return this.findById(id) || null;
  },

  delete(id: number): void {
    getDatabase().prepare('DELETE FROM episodes WHERE id = ?').run(id);
  },

  deleteByProject(projectId: number): void {
    getDatabase().prepare('DELETE FROM episodes WHERE project_id = ?').run(projectId);
  },

  updateWorkflowState(id: number, state: string): void {
    getDatabase().prepare(
      'UPDATE episodes SET workflow_state = ?, workflow_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(state, id);
  },

  setWorkflowError(id: number, error: string): void {
    getDatabase().prepare(
      "UPDATE episodes SET workflow_state = 'failed', workflow_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(error, id);
  },

  getWorkflowState(id: number): { state: string; progress: number; error: string | null; style_preset: string } | null {
    const row = getDatabase().prepare(
      'SELECT workflow_state as state, workflow_progress as progress, workflow_error as error, style_preset FROM episodes WHERE id = ?'
    ).get(id) as any;
    return row || null;
  },

  resetWorkflow(id: number): void {
    getDatabase().prepare(
      "UPDATE episodes SET workflow_state = 'idle', workflow_error = NULL, workflow_progress = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(id);
  },
};
