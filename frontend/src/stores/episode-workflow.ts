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
  streamContentSeedance: string;
  streamContentSora: string;
  _pollTimer: ReturnType<typeof setInterval> | null;
  _sseController: AbortController | null;

  fetchStatus: (episodeId: number) => Promise<void>;
  startAnalysis: (episodeId: number, extra?: { style_preset?: string; aspect_ratio?: string }) => Promise<any>;
  reviewScriptStream: (episodeId: number) => Promise<any>;
  applyReview: (episodeId: number) => Promise<any>;
  reviseScriptStream: (episodeId: number, feedback: string) => Promise<any>;
  approveScript: (episodeId: number) => Promise<void>;
  startAssetGeneration: (episodeId: number) => Promise<void>;
  generateSingleAsset: (episodeId: number, assetId: number) => Promise<void>;
  regenerateAsset: (episodeId: number, assetId: number) => Promise<void>;
  createAssetCards: (episodeId: number) => Promise<void>;
  recreateAssetCards: (episodeId: number, style?: string) => Promise<void>;
  startStoryboardGenerationStream: (episodeId: number, version?: string) => Promise<void>;
  startKeyframeGeneration: (episodeId: number) => Promise<void>;
  createKeyframeCards: (episodeId: number, style?: string) => Promise<any>;
  generateSingleKeyframe: (episodeId: number, assetId: number) => Promise<void>;
  regenerateKeyframe: (episodeId: number, assetId: number) => Promise<void>;
  createVideoClips: (episodeId: number) => Promise<void>;
  generateSingleVideoClip: (episodeId: number, assetId: number) => Promise<void>;
  mergeVideoClips: (episodeId: number, opts?: { resolution?: string; title?: string }) => Promise<void>;
  fetchVideoStatus: (episodeId: number) => Promise<void>;
  videoStatus: any;
  videos: any[];
  resetWorkflow: (episodeId: number) => Promise<void>;
  retryFailed: (episodeId: number) => Promise<void>;
  pollStatus: (episodeId: number) => void;
  stopPolling: () => void;
  clearStreamContent: () => void;
}

const ACTIVE_STATES = ['analyzing', 'reviewing', 'generating_assets', 'generating_storyboards', 'generating_keyframes', 'generating_video'];

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

function getImageAISettings() {
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

function getVideoAISettings() {
  try {
    const saved = localStorage.getItem('settings');
    if (saved) {
      const s = JSON.parse(saved);
      return {
        api_key: s.ai_video_api_key || s.ai_api_key,
        base_url: s.ai_video_base_url || s.ai_base_url,
        model: s.ai_video_model,
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
  streamContentSeedance: '',
  streamContentSora: '',
  videoStatus: null,
  videos: [],
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

  startAnalysis: async (episodeId, extra) => {
    set((s) => ({ loading: true, error: null, streamContent: '', status: { ...s.status, state: 'analyzing' } as any }));
    get()._sseController?.abort();

    return new Promise((resolve, reject) => {
      const controller = episodeWorkflowAPI.analyzeStream(
        episodeId,
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

  applyReview: async (episodeId) => {
    set({ loading: true, error: null, streamContent: '' });
    get()._sseController?.abort();

    return new Promise((resolve, reject) => {
      const controller = episodeWorkflowAPI.applyReviewStream(
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
      await episodeWorkflowAPI.generateAssets(episodeId, getImageAISettings());
      set({ loading: false });
      get().pollStatus(episodeId);
    } catch (err: any) {
      set({ loading: false, error: err.message || '素材生成启动失败' });
      throw err;
    }
  },

  generateSingleAsset: async (episodeId, assetId) => {
    try {
      await episodeWorkflowAPI.generateSingleAsset(episodeId, assetId, getImageAISettings());
      get().pollStatus(episodeId);
    } catch (err: any) {
      throw err;
    }
  },

  regenerateAsset: async (episodeId, assetId) => {
    await episodeWorkflowAPI.regenerateAsset(episodeId, assetId);
    get().pollStatus(episodeId);
  },

  createAssetCards: async (episodeId) => {
    set({ loading: true, error: null });
    try {
      await episodeWorkflowAPI.createAssets(episodeId);
      set({ loading: false });
      get().fetchStatus(episodeId);
    } catch (err: any) {
      set({ loading: false, error: err.message || '创建素材卡片失败' });
    }
  },
  recreateAssetCards: async (episodeId, style) => {
    set({ loading: true, error: null });
    try {
      await episodeWorkflowAPI.recreateAssets(episodeId, style);
      set({ loading: false });
      get().fetchStatus(episodeId);
    } catch (err: any) {
      set({ loading: false, error: err.message || '重新创建素材卡片失败' });
    }
  },

  startStoryboardGenerationStream: async (episodeId, version = 'both') => {
    set((s) => ({
      loading: true, error: null,
      streamContent: '', streamContentSeedance: '', streamContentSora: '',
      status: { ...s.status, state: 'generating_storyboards' } as any,
    }));
    get()._sseController?.abort();

    return new Promise<void>((resolve, reject) => {
      const controller = episodeWorkflowAPI.generateStoryboardsStream(
        episodeId,
        { ...getTextAISettings(), version },
        {
          onChunk: (text, data) => {
            const ver = data?.version;
            if (ver === 'seedance') {
              set((s) => ({ streamContentSeedance: s.streamContentSeedance + text }));
            } else if (ver === 'sora') {
              set((s) => ({ streamContentSora: s.streamContentSora + text }));
            } else {
              set((s) => ({ streamContent: s.streamContent + text }));
            }
          },
          onStatus: (data) => {
            const ver = (data as any).version;
            const msg = `\n\n[${data.message}]\n\n`;
            if (ver === 'seedance') {
              set((s) => ({ streamContentSeedance: s.streamContentSeedance + msg }));
            } else if (ver === 'sora') {
              set((s) => ({ streamContentSora: s.streamContentSora + msg }));
            } else {
              set((s) => ({ streamContent: s.streamContent + msg }));
            }
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
      await episodeWorkflowAPI.generateKeyframes(episodeId, getImageAISettings());
      set({ loading: false });
      get().pollStatus(episodeId);
    } catch (err: any) {
      set({ loading: false, error: err.message || '关键帧生成启动失败' });
      throw err;
    }
  },

  createKeyframeCards: async (episodeId, style) => {
    set({ loading: true, error: null });
    try {
      const res = await episodeWorkflowAPI.createKeyframeCards(episodeId, style);
      set({ loading: false });
      get().fetchStatus(episodeId);
      return res.data;
    } catch (err: any) {
      set({ loading: false, error: err.message || '创建关键帧卡片失败' });
      throw err;
    }
  },

  generateSingleKeyframe: async (episodeId, assetId) => {
    try {
      await episodeWorkflowAPI.generateSingleKeyframe(episodeId, assetId, getImageAISettings());
      get().fetchStatus(episodeId);
    } catch (err: any) {
      throw err;
    }
  },

  regenerateKeyframe: async (episodeId, assetId) => {
    await episodeWorkflowAPI.regenerateKeyframe(episodeId, assetId);
    get().fetchStatus(episodeId);
  },

  createVideoClips: async (episodeId) => {
    set({ loading: true, error: null });
    try {
      await episodeWorkflowAPI.createVideoClips(episodeId);
      set({ loading: false });
      get().fetchStatus(episodeId);
    } catch (err: any) {
      set({ loading: false, error: err.message || '创建视频片段卡片失败' });
      throw err;
    }
  },

  generateSingleVideoClip: async (episodeId, assetId) => {
    try {
      await episodeWorkflowAPI.generateSingleVideoClip(episodeId, assetId, getVideoAISettings());
      get().fetchStatus(episodeId);
    } catch (err: any) {
      throw err;
    }
  },

  mergeVideoClips: async (episodeId, opts) => {
    set({ loading: true, error: null });
    try {
      await episodeWorkflowAPI.mergeVideoClips(episodeId, opts);
      set({ loading: false });
      get().fetchStatus(episodeId);
    } catch (err: any) {
      set({ loading: false, error: err.message || '视频合成失败' });
      throw err;
    }
  },

  fetchVideoStatus: async (episodeId) => {
    try {
      const res: any = await episodeWorkflowAPI.getVideoStatus(episodeId);
      const vids: any = await episodeWorkflowAPI.getVideos(episodeId);
      set({ videoStatus: res.data, videos: vids.data || [] });
    } catch {}
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
      await episodeWorkflowAPI.retryFailed(episodeId, getImageAISettings());
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
    set({ streamContent: '', streamContentSeedance: '', streamContentSora: '' });
  },
}));
