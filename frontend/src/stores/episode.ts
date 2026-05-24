import { create } from 'zustand';
import { episodeAPI } from '../services/api';

export interface EpisodeSuggestion {
  suggested_episodes: number;
  recommended_minutes: number;
  episode_breaks: Array<{
    episode_number: number;
    title: string;
    start_char: number;
    end_char: number;
    summary: string;
  }>;
  reasoning: string;
}

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

interface EpisodeState {
  episodes: Episode[];
  suggestion: EpisodeSuggestion | null;
  loading: boolean;
  suggestLoading: boolean;
  error: string | null;

  fetchEpisodes: (projectId: number) => Promise<void>;
  suggest: (projectId: number) => Promise<void>;
  createBatch: (projectId: number, episodes: Array<{
    title: string;
    description?: string;
    episode_number: number;
    target_minutes?: number;
    novel_text_segment?: string;
    style_preset?: string;
  }>) => Promise<void>;
  updateEpisode: (episodeId: number, data: Partial<Episode>) => Promise<void>;
  deleteEpisode: (episodeId: number) => Promise<void>;
  clearSuggestion: () => void;
}

function getTextAISettings() {
  try {
    const saved = localStorage.getItem('settings');
    if (saved) {
      const s = JSON.parse(saved);
      return {
        api_key: s.ai_text_api_key || s.ai_api_key,
        base_url: s.ai_text_base_url || s.ai_base_url,
        model: s.ai_text_model,
      };
    }
  } catch {}
  return {};
}

export const useEpisodeStore = create<EpisodeState>((set, get) => ({
  episodes: [],
  suggestion: null,
  loading: false,
  suggestLoading: false,
  error: null,

  fetchEpisodes: async (projectId) => {
    set({ loading: true, error: null });
    try {
      const res = await episodeAPI.getList(projectId);
      set({ episodes: res.data, loading: false });
    } catch (err: any) {
      set({ loading: false, error: err.message || '获取剧集列表失败' });
    }
  },

  suggest: async (projectId) => {
    set({ suggestLoading: true, error: null, suggestion: null });
    try {
      const res = await episodeAPI.suggest(projectId, getTextAISettings());
      set({ suggestion: res.data, suggestLoading: false });
    } catch (err: any) {
      set({ suggestLoading: false, error: err.message || 'AI 建议失败' });
    }
  },

  createBatch: async (projectId, episodes) => {
    set({ loading: true, error: null });
    try {
      await episodeAPI.createBatch(projectId, episodes);
      await get().fetchEpisodes(projectId);
    } catch (err: any) {
      set({ loading: false, error: err.message || '创建剧集失败' });
      throw err;
    }
  },

  updateEpisode: async (episodeId, data) => {
    set({ loading: true, error: null });
    try {
      const { id, project_id, created_at, updated_at, workflow_state, workflow_error, workflow_progress, ...rest } = data as any;
      await episodeAPI.update(episodeId, rest);
      const ep = get().episodes.find(e => e.id === episodeId);
      if (ep) {
        await get().fetchEpisodes(ep.project_id);
      }
    } catch (err: any) {
      set({ loading: false, error: err.message || '更新剧集失败' });
    }
  },

  deleteEpisode: async (episodeId) => {
    set({ loading: true, error: null });
    try {
      const ep = get().episodes.find(e => e.id === episodeId);
      await episodeAPI.delete(episodeId);
      if (ep) {
        await get().fetchEpisodes(ep.project_id);
      }
    } catch (err: any) {
      set({ loading: false, error: err.message || '删除剧集失败' });
    }
  },

  clearSuggestion: () => set({ suggestion: null }),
}));
