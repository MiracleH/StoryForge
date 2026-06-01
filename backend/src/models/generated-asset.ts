import { getDatabase } from '../database/setup';

export const GeneratedAssetModel = {
  findByProject(projectId: number, type?: string) {
    const db = getDatabase();
    let query = 'SELECT * FROM generated_assets WHERE project_id = ?';
    const params: any[] = [projectId];
    if (type) { query += ' AND asset_type = ?'; params.push(type); }
    query += ' ORDER BY created_at DESC';
    return db.prepare(query).all(...params);
  },

  findByEntity(entityType: string, entityId: number) {
    return getDatabase().prepare(
      'SELECT * FROM generated_assets WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC'
    ).all(entityType, entityId);
  },

  findById(id: number) {
    return getDatabase().prepare('SELECT * FROM generated_assets WHERE id = ?').get(id);
  },

  create(data: {
    project_id: number;
    asset_type: string;
    entity_type?: string;
    entity_id?: number;
    name?: string;
    description?: string;
    prompt: string;
    negative_prompt?: string;
    voice_prompt?: string;
    image_url: string;
    audio_url?: string;
    style_seed?: string;
    style_preset?: string;
    width?: number;
    height?: number;
    metadata?: string;
    status?: string;
  }) {
    const result = getDatabase().prepare(
      `INSERT INTO generated_assets (project_id, asset_type, entity_type, entity_id, name, description, prompt, negative_prompt, voice_prompt, image_url, audio_url, style_seed, style_preset, width, height, metadata, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      data.project_id, data.asset_type, data.entity_type || null, data.entity_id || null,
      data.name || null, data.description || null,
      data.prompt, data.negative_prompt || null, data.voice_prompt || null,
      data.image_url, data.audio_url || null,
      data.style_seed || null, data.style_preset || 'anime',
      data.width || 1024, data.height || 1024, data.metadata || null, data.status || 'pending'
    );
    return getDatabase().prepare('SELECT * FROM generated_assets WHERE id = ?').get(result.lastInsertRowid);
  },

  updateStatus(id: number, status: string, imageUrl?: string, errorMessage?: string) {
    const updates = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
    const values: any[] = [status];
    if (imageUrl !== undefined) { updates.push('image_url = ?'); values.push(imageUrl); }
    if (errorMessage !== undefined) { updates.push('error_message = ?'); values.push(errorMessage); }
    values.push(id);
    getDatabase().prepare(`UPDATE generated_assets SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return getDatabase().prepare('SELECT * FROM generated_assets WHERE id = ?').get(id);
  },

  updateAudio(id: number, audioUrl: string) {
    getDatabase().prepare('UPDATE generated_assets SET audio_url = ? WHERE id = ?').run(audioUrl, id);
    return getDatabase().prepare('SELECT * FROM generated_assets WHERE id = ?').get(id);
  },

  updatePrompts(id: number, imagePrompt: string, voicePrompt?: string) {
    const updates = ['prompt = ?'];
    const values: any[] = [imagePrompt];
    if (voicePrompt !== undefined) { updates.push('voice_prompt = ?'); values.push(voicePrompt); }
    values.push(id);
    getDatabase().prepare(`UPDATE generated_assets SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return getDatabase().prepare('SELECT * FROM generated_assets WHERE id = ?').get(id);
  },

  deleteByProject(projectId: number) {
    return getDatabase().prepare('DELETE FROM generated_assets WHERE project_id = ?').run(projectId);
  },

  findByEpisode(episodeId: number, type?: string) {
    const db = getDatabase();
    let query = 'SELECT * FROM generated_assets WHERE episode_id = ?';
    const params: any[] = [episodeId];
    if (type) { query += ' AND asset_type = ?'; params.push(type); }
    query += ' ORDER BY created_at DESC';
    return db.prepare(query).all(...params);
  },

  deleteByEpisode(episodeId: number) {
    return getDatabase().prepare('DELETE FROM generated_assets WHERE episode_id = ?').run(episodeId);
  },

  createWithEpisode(data: {
    project_id: number;
    episode_id: number;
    asset_type: string;
    entity_type?: string;
    entity_id?: number;
    name?: string;
    description?: string;
    prompt: string;
    negative_prompt?: string;
    voice_prompt?: string;
    image_url: string;
    audio_url?: string;
    style_seed?: string;
    style_preset?: string;
    width?: number;
    height?: number;
    metadata?: string;
    status?: string;
  }) {
    const result = getDatabase().prepare(
      `INSERT INTO generated_assets (project_id, episode_id, asset_type, entity_type, entity_id, name, description, prompt, negative_prompt, voice_prompt, image_url, audio_url, style_seed, style_preset, width, height, metadata, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      data.project_id, data.episode_id, data.asset_type, data.entity_type || null, data.entity_id || null,
      data.name || null, data.description || null,
      data.prompt, data.negative_prompt || null, data.voice_prompt || null,
      data.image_url, data.audio_url || null,
      data.style_seed || null, data.style_preset || 'anime',
      data.width || 1024, data.height || 1024, data.metadata || null, data.status || 'pending'
    );
    return getDatabase().prepare('SELECT * FROM generated_assets WHERE id = ?').get(result.lastInsertRowid);
  },
};
