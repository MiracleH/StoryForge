/**
 * 工作流状态机 — 4 阶段流水线
 *
 * idle → analyzing → reviewing → generating_assets → assets_ready
 *      → generating_storyboards → storyboards_ready → generating_keyframes → completed
 * any → failed
 */

import { getDatabase } from '../database/setup';
import { logger } from '../utils/logger';

export type WorkflowState =
  | 'idle'
  | 'analyzing'
  | 'reviewing'
  | 'generating_assets'
  | 'assets_ready'
  | 'generating_storyboards'
  | 'storyboards_ready'
  | 'generating_keyframes'
  | 'completed'
  | 'failed';

const VALID_TRANSITIONS: Record<string, string[]> = {
  idle: ['analyzing'],
  analyzing: ['reviewing', 'failed'],
  reviewing: ['generating_assets', 'analyzing', 'failed'],
  generating_assets: ['assets_ready', 'failed'],
  assets_ready: ['generating_storyboards', 'reviewing'],
  generating_storyboards: ['storyboards_ready', 'failed'],
  storyboards_ready: ['generating_keyframes'],
  generating_keyframes: ['completed', 'failed'],
  completed: ['idle'],
  failed: ['idle', 'reviewing'],
};

export function transitionWorkflow(projectId: number, from: WorkflowState, to: WorkflowState): boolean {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    logger.warn(`Invalid workflow transition: ${from} -> ${to} for project ${projectId}`);
    return false;
  }

  const db = getDatabase();
  const result = db.prepare(
    'UPDATE projects SET workflow_state = ?, workflow_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND workflow_state = ?'
  ).run(to, projectId, from);

  if (result.changes > 0) {
    logger.info(`Workflow transition: ${from} -> ${to} for project ${projectId}`);
    return true;
  }

  logger.warn(`Workflow transition failed (state mismatch): expected ${from}, project ${projectId}`);
  return false;
}

export function setWorkflowError(projectId: number, error: string): void {
  const db = getDatabase();
  db.prepare(
    "UPDATE projects SET workflow_state = 'failed', workflow_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(error, projectId);
  logger.error(`Workflow failed for project ${projectId}: ${error}`);
}

export function getWorkflowState(projectId: number): {
  state: WorkflowState;
  progress: number;
  error: string | null;
  style_preset: string;
} | null {
  const db = getDatabase();
  const project = db.prepare(
    'SELECT workflow_state, workflow_progress, workflow_error, style_preset FROM projects WHERE id = ?'
  ).get(projectId) as any;

  if (!project) return null;

  return {
    state: project.workflow_state || 'idle',
    progress: project.workflow_progress || 0,
    error: project.workflow_error || null,
    style_preset: project.style_preset || 'anime',
  };
}

export function resetWorkflow(projectId: number): boolean {
  const db = getDatabase();
  const result = db.prepare(
    "UPDATE projects SET workflow_state = 'idle', workflow_error = NULL, workflow_progress = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(projectId);
  return result.changes > 0;
}

// ==================== Episode-scoped versions ====================

export function transitionWorkflowEpisode(episodeId: number, from: WorkflowState, to: WorkflowState): boolean {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    logger.warn(`Invalid workflow transition: ${from} -> ${to} for episode ${episodeId}`);
    return false;
  }

  const db = getDatabase();
  const result = db.prepare(
    'UPDATE episodes SET workflow_state = ?, workflow_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND workflow_state = ?'
  ).run(to, episodeId, from);

  if (result.changes > 0) {
    logger.info(`Workflow transition: ${from} -> ${to} for episode ${episodeId}`);
    return true;
  }

  logger.warn(`Workflow transition failed (state mismatch): expected ${from}, episode ${episodeId}`);
  return false;
}

export function setWorkflowErrorEpisode(episodeId: number, error: string): void {
  const db = getDatabase();
  db.prepare(
    "UPDATE episodes SET workflow_state = 'failed', workflow_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(error, episodeId);
  logger.error(`Workflow failed for episode ${episodeId}: ${error}`);
}

export function getWorkflowStateEpisode(episodeId: number): {
  state: WorkflowState;
  progress: number;
  error: string | null;
  style_preset: string;
} | null {
  const db = getDatabase();
  const episode = db.prepare(
    'SELECT workflow_state, workflow_progress, workflow_error, style_preset FROM episodes WHERE id = ?'
  ).get(episodeId) as any;

  if (!episode) return null;

  return {
    state: episode.workflow_state || 'idle',
    progress: episode.workflow_progress || 0,
    error: episode.workflow_error || null,
    style_preset: episode.style_preset || 'anime',
  };
}

export function resetWorkflowEpisode(episodeId: number): boolean {
  const db = getDatabase();
  const result = db.prepare(
    "UPDATE episodes SET workflow_state = 'idle', workflow_error = NULL, workflow_progress = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(episodeId);
  return result.changes > 0;
}
