import { create } from 'zustand';
import { episodeWorkflowAPI } from '../services/api';

interface WorkflowStatus {
  state: string;
  progress: number;
  error: string | null;
  style_preset: string;
  tasks: { pending: number; running: number; completed: number; failed: number };
  assets_count: number;
  analysis?: {
    chapters: number;
    characters: number;
    props: number;
    dialogues: number;
  };
  script?: string;
}

interface EpisodeWorkflowState {
  episodeId: number | null;
  status: WorkflowStatus | null;
  loading: boolean;
  error: string | null;
  streamContent: string;
  _pollTimer: ReturnType<typeof setInterval> | null;
  _sseController: AbortController | null;

  fetchStatus: (episodeId: number) => Promise<void>;
  startAnalysis: (episodeId: number) => Promise<any>;
  startAnalysisTypeChat: (episodeId: number) => Promise<any>;
  reviewScriptStream: (episodeId: number) => Promise<any>;
  reviewTypeChat: (episodeId: number) => Promise<any>;
  reviseScriptStream: (episodeId: number, feedback: string) => Promise<any>;
  approveScript: (episodeId: number) => Promise<void>;
  startAssetGeneration: (episodeId: number) => Promise<void>;
  startStoryboardGenerationStream: (episodeId: number) => Promise<void>;
  startKeyframeGeneration: (episodeId: number) => Promise<void>;
  resetWorkflow: (episodeId: number) => Promise<void>;
  retryFailed: (episodeId: number) => Promise<void>;
  pollStatus: (episodeId: number) => void;
  stopPolling: () => void;
  clearStreamContent: () => void;
}

const ACTIVE_STATES = ['analyzing', 'reviewing', 'generating_assets', 'generating_storyboards', 'generating_keyframes'];

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

export const useEpisodeWorkflowStore = create<EpisodeWorkflowState>((set, get) => ({
  episodeId: null,
  status: null,
  loading: false,
  error: null,
  streamContent: '',
  _pollTimer: null,
  _sseController: null,

  fetchStatus: async (episodeId) => {
    try {
      const res = await episodeWorkflowAPI.getStatus(episodeId);
      set({ status: res.data, episodeId, error: null });
      const state = res.data.state;
      if (!ACTIVE_STATES.includes(state)) {
        get().stopPolling();
      }
    } catch (err: any) {
      set({ error: err.message || '获取状态失败' });
    }
  },

  startAnalysis: async (episodeId) => {
    set((s) => ({ loading: true, error: null, streamContent: '', status: { ...s.status, state: 'analyzing' } as any }));
    get()._sseController?.abort();

    return new Promise((resolve, reject) => {
      const controller = episodeWorkflowAPI.analyzeStream(
        episodeId,
        getTextAISettings(),
        {
          onChunk: (text) => {
            set((s) => ({ streamContent: s.streamContent + text }));
          },
          onStatus: (data) => {
            set({ streamContent: get().streamContent + `\n\n[${data.message}]\n\n` });
          },
          onDone: (data) => {
            set({ loading: false, _sseController: null });
            get().fetchStatus(episodeId);
            resolve(data);
          },
          onError: (message) => {
            set({ loading: false, error: message, _sseController: null });
            reject(new Error(message));
          },
        }
      );
      set({ _sseController: controller });
    });
  },

  startAnalysisTypeChat: async (episodeId) => {
    set({ loading: true, error: null });
    try {
      const res = await episodeWorkflowAPI.analyzeTypeChat(episodeId, getTextAISettings());
      set({ loading: false });
      get().fetchStatus(episodeId);
      return res.data;
    } catch (err: any) {
      set({ loading: false, error: err.message || 'TypeChat 分析失败' });
      throw err;
    }
  },

  reviewTypeChat: async (episodeId) => {
    set({ loading: true, error: null });
    try {
      const res = await episodeWorkflowAPI.reviewTypeChat(episodeId, getTextAISettings());
      set({ loading: false });
      return res.data;
    } catch (err: any) {
      set({ loading: false, error: err.message || 'TypeChat 审核失败' });
      throw err;
    }
  },

  reviewScriptStream: async (episodeId) => {
    set({ loading: true, error: null, streamContent: '' });
    get()._sseController?.abort();

    return new Promise((resolve, reject) => {
      const controller = episodeWorkflowAPI.reviewScriptStream(
        episodeId,
        getTextAISettings(),
        {
          onChunk: (text) => {
            set((s) => ({ streamContent: s.streamContent + text }));
          },
          onStatus: (data) => {
            set({ streamContent: get().streamContent + `\n\n[${data.message}]\n\n` });
          },
          onDone: (data) => {
            set({ loading: false, _sseController: null });
            get().fetchStatus(episodeId);
            resolve(data);
          },
          onError: (message) => {
            set({ loading: false, error: message, _sseController: null });
            reject(new Error(message));
          },
        }
      );
      set({ _sseController: controller });
    });
  },

  reviseScriptStream: async (episodeId, feedback) => {
    set({ loading: true, error: null, streamContent: '' });
    get()._sseController?.abort();

    return new Promise((resolve, reject) => {
      const controller = episodeWorkflowAPI.reviseScriptStream(
        episodeId,
        feedback,
        getTextAISettings(),
        {
          onChunk: (text) => {
            set((s) => ({ streamContent: s.streamContent + text }));
          },
          onStatus: (data) => {
            set({ streamContent: get().streamContent + `\n\n[${data.message}]\n\n` });
          },
          onDone: (data) => {
            set({ loading: false, _sseController: null });
            get().fetchStatus(episodeId);
            resolve(data);
          },
          onError: (message) => {
            set({ loading: false, error: message, _sseController: null });
            reject(new Error(message));
          },
        }
      );
      set({ _sseController: controller });
    });
  },

  approveScript: async (episodeId) => {
    set({ loading: true, error: null });
    try {
      await episodeWorkflowAPI.approveScript(episodeId);
      set({ loading: false });
      get().pollStatus(episodeId);
    } catch (err: any) {
      set({ loading: false, error: err.message || '确认失败' });
      throw err;
    }
  },

  startAssetGeneration: async (episodeId) => {
    set({ loading: true, error: null });
    try {
      await episodeWorkflowAPI.generateAssets(episodeId);
      set({ loading: false });
      get().pollStatus(episodeId);
    } catch (err: any) {
      set({ loading: false, error: err.message || '素材生成启动失败' });
      throw err;
    }
  },

  startStoryboardGenerationStream: async (episodeId) => {
    set((s) => ({ loading: true, error: null, streamContent: '', status: { ...s.status, state: 'generating_storyboards' } as any }));
    get()._sseController?.abort();

    return new Promise<void>((resolve, reject) => {
      const controller = episodeWorkflowAPI.generateStoryboardsStream(
        episodeId,
        getTextAISettings(),
        {
          onChunk: (text) => {
            set((s) => ({ streamContent: s.streamContent + text }));
          },
          onStatus: (data) => {
            set({ streamContent: get().streamContent + `\n\n[${data.message}]\n\n` });
          },
          onDone: (data) => {
            set({ loading: false, _sseController: null });
            get().fetchStatus(episodeId);
            resolve();
          },
          onError: (message) => {
            set({ loading: false, error: message, _sseController: null });
            reject(new Error(message));
          },
        }
      );
      set({ _sseController: controller });
    });
  },

  startKeyframeGeneration: async (episodeId) => {
    set({ loading: true, error: null });
    try {
      await episodeWorkflowAPI.generateKeyframes(episodeId);
      set({ loading: false });
      get().pollStatus(episodeId);
    } catch (err: any) {
      set({ loading: false, error: err.message || '关键帧生成启动失败' });
      throw err;
    }
  },

  resetWorkflow: async (episodeId) => {
    set({ loading: true, error: null });
    try {
      get().stopPolling();
      await episodeWorkflowAPI.reset(episodeId);
      set({ loading: false, status: null });
      get().fetchStatus(episodeId);
    } catch (err: any) {
      set({ loading: false, error: err.message || '重置失败' });
    }
  },

  retryFailed: async (episodeId) => {
    set({ loading: true, error: null });
    try {
      await episodeWorkflowAPI.retryFailed(episodeId);
      set({ loading: false });
      get().pollStatus(episodeId);
    } catch (err: any) {
      set({ loading: false, error: err.message || '重试失败' });
    }
  },

  pollStatus: (episodeId) => {
    get().stopPolling();
    get().fetchStatus(episodeId);
    const timer = setInterval(() => {
      get().fetchStatus(episodeId);
    }, 3000);
    set({ _pollTimer: timer });
  },

  stopPolling: () => {
    const { _pollTimer } = get();
    if (_pollTimer) {
      clearInterval(_pollTimer);
      set({ _pollTimer: null });
    }
  },

  clearStreamContent: () => {
    set({ streamContent: '' });
  },
}));
