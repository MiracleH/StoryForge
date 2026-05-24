import { create } from 'zustand';
import { workflowAPI } from '../services/api';

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

interface WorkflowState {
  projectId: number | null;
  status: WorkflowStatus | null;
  loading: boolean;
  error: string | null;
  streamContent: string;
  _pollTimer: ReturnType<typeof setInterval> | null;
  _sseController: AbortController | null;

  fetchStatus: (projectId: number) => Promise<void>;
  startAnalysis: (projectId: number, extra?: { style_preset?: string; aspect_ratio?: string }) => Promise<any>;
  reviewScriptStream: (projectId: number) => Promise<any>;
  applyReview: (projectId: number) => Promise<any>;
  reviseScriptStream: (projectId: number, feedback: string) => Promise<any>;
  approveScript: (projectId: number) => Promise<void>;
  startAssetGeneration: (projectId: number) => Promise<void>;
  createAssetCards: (projectId: number) => Promise<void>;
  recreateAssetCards: (projectId: number, style?: string) => Promise<void>;
  generateSingleAsset: (projectId: number, assetId: number) => Promise<void>;
  startStoryboardGenerationStream: (projectId: number) => Promise<void>;
  startKeyframeGeneration: (projectId: number) => Promise<void>;
  generateVideo: (projectId: number, opts?: { resolution?: string; bgm_volume?: number; title?: string }) => Promise<void>;
  videoStatus: any;
  videos: any[];
  runAll: (projectId: number) => Promise<void>;
  resetWorkflow: (projectId: number) => Promise<void>;
  retryFailed: (projectId: number) => Promise<void>;
  pollStatus: (projectId: number) => void;
  stopPolling: () => void;
  clearStreamContent: () => void;
}

const ACTIVE_STATES = ['analyzing', 'reviewing', 'generating_assets', 'generating_storyboards', 'generating_keyframes', 'generating_video'];

function getTextAISettings(): { api_key?: string; base_url?: string; model?: string } {
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

function getImageAISettings(): { api_key?: string; base_url?: string; model?: string } {
  try {
    const saved = localStorage.getItem('settings');
    if (saved) {
      const s = JSON.parse(saved);
      return {
        api_key: s.ai_image_api_key || s.ai_api_key,
        base_url: s.ai_image_base_url || s.ai_base_url,
        model: s.ai_image_model,
      };
    }
  } catch {}
  return {};
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  projectId: null,
  status: null,
  loading: false,
  error: null,
  streamContent: '',
  videoStatus: null,
  videos: [],
  _pollTimer: null,
  _sseController: null,

  fetchStatus: async (projectId) => {
    try {
      const res = await workflowAPI.getStatus(projectId);
      set({ status: res.data, projectId, error: null });
      const state = res.data.state;
      if (!ACTIVE_STATES.includes(state)) {
        get().stopPolling();
      }
    } catch (err: any) {
      set({ error: err.message || '获取状态失败' });
    }
  },

  startAnalysis: async (projectId, extra) => {
    set((s) => ({ loading: true, error: null, streamContent: '', status: { ...s.status, state: 'analyzing' } as any }));
    get()._sseController?.abort();

    return new Promise((resolve, reject) => {
      const controller = workflowAPI.analyzeStream(
        projectId,
        { ...getTextAISettings(), ...extra },
        {
          onChunk: (text) => {
            set((s) => ({ streamContent: s.streamContent + text }));
          },
          onStatus: (data) => {
            set({ streamContent: get().streamContent + `\n\n[${data.message}]\n\n` });
          },
          onDone: (data) => {
            set({ loading: false, _sseController: null });
            get().fetchStatus(projectId);
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

  applyReview: async (projectId) => {
    set({ loading: true, error: null, streamContent: '' });
    get()._sseController?.abort();

    return new Promise((resolve, reject) => {
      const controller = workflowAPI.applyReviewStream(
        projectId,
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
            get().fetchStatus(projectId);
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

  reviewScriptStream: async (projectId) => {
    set({ loading: true, error: null, streamContent: '' });
    get()._sseController?.abort();

    return new Promise((resolve, reject) => {
      const controller = workflowAPI.reviewScriptStream(
        projectId,
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
            get().fetchStatus(projectId);
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

  reviseScriptStream: async (projectId, feedback) => {
    set({ loading: true, error: null, streamContent: '' });
    // Abort previous SSE if any
    get()._sseController?.abort();

    return new Promise((resolve, reject) => {
      const controller = workflowAPI.reviseScriptStream(
        projectId,
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
            get().fetchStatus(projectId);
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

  approveScript: async (projectId) => {
    set({ loading: true, error: null });
    try {
      await workflowAPI.approveScript(projectId);
      set({ loading: false });
      get().pollStatus(projectId);
    } catch (err: any) {
      set({ loading: false, error: err.message || '确认失败' });
      throw err;
    }
  },

  startAssetGeneration: async (projectId) => {
    set({ loading: true, error: null });
    try {
      await workflowAPI.generateAssets(projectId, getImageAISettings());
      set({ loading: false });
      get().pollStatus(projectId);
    } catch (err: any) {
      set({ loading: false, error: err.message || '素材生成启动失败' });
      throw err;
    }
  },

  generateSingleAsset: async (projectId, assetId) => {
    try {
      await workflowAPI.generateSingleAsset(projectId, assetId, getImageAISettings());
      get().pollStatus(projectId);
    } catch (err: any) {
      throw err;
    }
  },

  createAssetCards: async (projectId) => {
    set({ loading: true, error: null });
    try {
      await workflowAPI.createAssets(projectId);
      set({ loading: false });
      get().fetchStatus(projectId);
    } catch (err: any) {
      set({ loading: false, error: err.message || '创建素材卡片失败' });
    }
  },
  recreateAssetCards: async (projectId, style) => {
    set({ loading: true, error: null });
    try {
      await workflowAPI.recreateAssets(projectId, style);
      set({ loading: false });
      get().fetchStatus(projectId);
    } catch (err: any) {
      set({ loading: false, error: err.message || '重新创建素材卡片失败' });
    }
  },

  startStoryboardGenerationStream: async (projectId) => {
    set((s) => ({ loading: true, error: null, streamContent: '', status: { ...s.status, state: 'generating_storyboards' } as any }));
    get()._sseController?.abort();

    return new Promise<void>((resolve, reject) => {
      const controller = workflowAPI.generateStoryboardsStream(
        projectId,
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
            get().fetchStatus(projectId);
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

  startKeyframeGeneration: async (projectId) => {
    set({ loading: true, error: null });
    try {
      await workflowAPI.generateKeyframes(projectId, getImageAISettings());
      set({ loading: false });
      get().pollStatus(projectId);
    } catch (err: any) {
      set({ loading: false, error: err.message || '关键帧生成启动失败' });
      throw err;
    }
  },

  generateVideo: async (projectId, opts) => {
    set({ loading: true, error: null });
    try {
      await workflowAPI.generateVideo(projectId, opts);
      set({ loading: false });
      get().fetchStatus(projectId);
    } catch (err: any) {
      set({ loading: false, error: err.message || '视频生成启动失败' });
      throw err;
    }
  },

  runAll: async (projectId) => {
    set({ loading: true, error: null });
    try {
      await workflowAPI.runAll(projectId, getTextAISettings());
      set({ loading: false });
      get().pollStatus(projectId);
    } catch (err: any) {
      set({ loading: false, error: err.message || '一键执行失败' });
      throw err;
    }
  },

  resetWorkflow: async (projectId) => {
    set({ loading: true, error: null });
    try {
      get().stopPolling();
      await workflowAPI.reset(projectId);
      set({ loading: false, status: null });
      get().fetchStatus(projectId);
    } catch (err: any) {
      set({ loading: false, error: err.message || '重置失败' });
    }
  },

  retryFailed: async (projectId) => {
    set({ loading: true, error: null });
    try {
      await workflowAPI.retryFailed(projectId, getImageAISettings());
      set({ loading: false });
      get().pollStatus(projectId);
    } catch (err: any) {
      set({ loading: false, error: err.message || '重试失败' });
    }
  },

  pollStatus: (projectId) => {
    get().stopPolling();
    get().fetchStatus(projectId);
    const timer = setInterval(() => {
      get().fetchStatus(projectId);
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
