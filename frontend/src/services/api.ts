import axios from 'axios';

/**
 * SSE 流式请求（POST），通过回调处理服务端推送事件
 */
export function streamRequest(
  url: string,
  body: Record<string, any>,
  callbacks: {
    onChunk?: (text: string, data?: any) => void;
    onStatus?: (data: any) => void;
    onDone?: (data: any) => void;
    onError?: (message: string) => void;
  }
): AbortController {
  const controller = new AbortController();
  const token = localStorage.getItem('token');

  (async () => {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
        callbacks.onError?.(errData.error?.message || `请求失败: ${res.status}`);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let eventType = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);
              switch (eventType) {
                case 'chunk': callbacks.onChunk?.(parsed.text, parsed); break;
                case 'status': callbacks.onStatus?.(parsed); break;
                case 'done': callbacks.onDone?.(parsed); break;
                case 'error': callbacks.onError?.(parsed.message); break;
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        callbacks.onError?.(err.message || '流式请求失败');
      }
    }
  })();

  return controller;
}

// 创建 axios 实例
const api = axios.create({
  baseURL: '/api',
  timeout: 600000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
api.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    if (error.response) {
      const { status, data } = error.response;

      // 401 未授权，跳转到登录页面
      if (status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }

      // 返回错误信息
      return Promise.reject(data.error || { message: '请求失败' });
    }

    return Promise.reject({ message: '网络错误' });
  }
);

// 认证相关 API
export const authAPI = {
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),

  register: (data: { username: string; email: string; password: string }) =>
    api.post('/auth/register', data),

  getProfile: () =>
    api.get('/auth/me'),

  updateProfile: (data: { username?: string; email?: string; avatar?: string }) =>
    api.put('/auth/profile', data),

  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.put('/auth/password', data),
};

// 项目相关 API
export const projectAPI = {
  getList: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get('/projects', { params }),

  getById: (id: number) =>
    api.get(`/projects/${id}`),

  create: (data: { title: string; description?: string; novel_text?: string; file?: File }) => {
    if (data.file) {
      const formData = new FormData();
      formData.append('title', data.title);
      if (data.description) formData.append('description', data.description);
      if (data.novel_text) formData.append('novel_text', data.novel_text);
      formData.append('file', data.file);
      return api.post('/projects', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    }
    return api.post('/projects', data);
  },

  update: (id: number, data: { title?: string; description?: string; status?: string; novel_text?: string }) =>
    api.put(`/projects/${id}`, data),

  delete: (id: number) =>
    api.delete(`/projects/${id}`),

  getStats: () =>
    api.get('/projects/stats/overview'),

  export: (id: number) =>
    api.get(`/projects/${id}/export`, { responseType: 'blob' }),
};

// 角色相关 API
export const characterAPI = {
  getByProject: (projectId: number) =>
    api.get(`/characters/project/${projectId}`),

  getById: (id: number) =>
    api.get(`/characters/${id}`),

  create: (data: {
    project_id: number;
    name: string;
    description?: string;
    personality?: string;
    appearance?: string;
    style?: string;
  }) =>
    api.post('/characters', data),

  update: (id: number, data: {
    name?: string;
    description?: string;
    personality?: string;
    appearance?: string;
    style?: string;
  }) =>
    api.put(`/characters/${id}`, data),

  delete: (id: number) =>
    api.delete(`/characters/${id}`),
};

// 场景相关 API
export const sceneAPI = {
  getByChapter: (chapterId: number) =>
    api.get(`/scenes/chapter/${chapterId}`),

  getById: (id: number) =>
    api.get(`/scenes/${id}`),

  create: (data: {
    chapter_id: number;
    title?: string;
    description?: string;
    background_image?: string;
    order_index?: number;
  }) =>
    api.post('/scenes', data),

  update: (id: number, data: {
    title?: string;
    description?: string;
    background_image?: string;
    order_index?: number;
  }) =>
    api.put(`/scenes/${id}`, data),

  delete: (id: number) =>
    api.delete(`/scenes/${id}`),

  reorder: (chapterId: number, sceneIds: number[]) =>
    api.put(`/scenes/reorder/${chapterId}`, { scene_ids: sceneIds }),
};

// 分镜相关 API
export const storyboardAPI = {
  getByScene: (sceneId: number) =>
    api.get(`/storyboards/scene/${sceneId}`),

  getById: (id: number) =>
    api.get(`/storyboards/${id}`),

  create: (data: {
    scene_id: number;
    title?: string;
    description?: string;
    image_url?: string;
    duration?: number;
    camera_angle?: string;
    camera_movement?: string;
    order_index?: number;
    transition_type?: string;
    transition_duration?: number;
  }) =>
    api.post('/storyboards', data),

  update: (id: number, data: {
    title?: string;
    description?: string;
    image_url?: string;
    duration?: number;
    camera_angle?: string;
    camera_movement?: string;
    order_index?: number;
    transition_type?: string;
    transition_duration?: number;
  }) =>
    api.put(`/storyboards/${id}`, data),

  delete: (id: number) =>
    api.delete(`/storyboards/${id}`),

  addDialogue: (storyboardId: number, data: {
    character_id?: number;
    content: string;
    position_x?: number;
    position_y?: number;
    style?: string;
    order_index?: number;
  }) =>
    api.post(`/storyboards/${storyboardId}/dialogues`, data),

  updateDialogue: (dialogueId: number, data: {
    character_id?: number;
    content?: string;
    position_x?: number;
    position_y?: number;
    style?: string;
    order_index?: number;
  }) =>
    api.put(`/storyboards/dialogues/${dialogueId}`, data),

  deleteDialogue: (dialogueId: number) =>
    api.delete(`/storyboards/dialogues/${dialogueId}`),

  reorder: (sceneId: number, storyboardIds: number[]) =>
    api.put(`/storyboards/reorder/${sceneId}`, { storyboard_ids: storyboardIds }),
};

// 视频相关 API
export const videoAPI = {
  getByProject: (projectId: number) =>
    api.get(`/videos/project/${projectId}`),

  getById: (id: number) =>
    api.get(`/videos/${id}`),

  create: (data: {
    project_id: number;
    title?: string;
    description?: string;
    resolution?: string;
    bgm_asset_id?: number;
    bgm_volume?: number;
  }) =>
    api.post('/videos', data),

  updateStatus: (id: number, data: {
    status: string;
    file_path?: string;
    thumbnail?: string;
    duration?: number;
  }) =>
    api.put(`/videos/${id}/status`, data),

  delete: (id: number) =>
    api.delete(`/videos/${id}`),

  getStats: (projectId: number) =>
    api.get(`/videos/stats/${projectId}`),

  getFFmpegStatus: () =>
    api.get('/videos/ffmpeg-status'),
};

// 剧本分析相关 API
export const scriptAnalysisAPI = {
  analyze: (data: { project_id: number; text: string }) =>
    api.post('/script-analysis/analyze', data),

  getResult: (projectId: number) =>
    api.get(`/script-analysis/result/${projectId}`),
};

// 资源相关 API
export const assetAPI = {
  getList: (params?: { type?: string; page?: number; limit?: number }) =>
    api.get('/assets', { params }),

  getById: (id: number) =>
    api.get(`/assets/${id}`),

  upload: (file: File, name: string, type: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name);
    formData.append('type', type);
    return api.post('/assets', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  update: (id: number, data: { name?: string; metadata?: string }) =>
    api.put(`/assets/${id}`, data),

  delete: (id: number) =>
    api.delete(`/assets/${id}`),
};

// 模板相关 API
export const templateAPI = {
  getList: (params?: { category?: string; limit?: number }) =>
    api.get('/templates', { params }),

  getById: (id: number) =>
    api.get(`/templates/${id}`),

  create: (data: { name: string; description?: string; category?: string; structure: any }) =>
    api.post('/templates', data),

  apply: (templateId: number, projectId: number) =>
    api.post(`/templates/${templateId}/apply`, { project_id: projectId }),

  delete: (id: number) =>
    api.delete(`/templates/${id}`),
};

// 角色资源库 API
export const characterAssetAPI = {
  getExpressions: (characterId: number) =>
    api.get(`/character-assets/${characterId}/expressions`),

  addExpression: (characterId: number, data: { name: string; description?: string; image_url?: string; emotion?: string }) =>
    api.post(`/character-assets/${characterId}/expressions`, data),

  deleteExpression: (id: number) =>
    api.delete(`/character-assets/expressions/${id}`),

  getActions: (characterId: number) =>
    api.get(`/character-assets/${characterId}/actions`),

  addAction: (characterId: number, data: { name: string; description?: string; image_url?: string; category?: string }) =>
    api.post(`/character-assets/${characterId}/actions`, data),

  deleteAction: (id: number) =>
    api.delete(`/character-assets/actions/${id}`),
};

// AI 生成相关 API
export const aiAPI = {
  getConfig: () =>
    api.get('/ai/config'),

  listModels: (data: { base_url: string; api_key: string }) =>
    api.post('/ai/models', data),

  testText: (data?: { model?: string; api_key?: string; base_url?: string }) =>
    api.post('/ai/test-text', data || {}),

  generateCharacterImage: (character_id: number) =>
    api.post('/ai/generate/character-image', { character_id }),

  generateSceneImage: (scene_id: number) =>
    api.post('/ai/generate/scene-image', { scene_id }),

  generateStoryboardImage: (storyboard_id: number) =>
    api.post('/ai/generate/storyboard-image', { storyboard_id }),

  generateExpressionImage: (expression_id: number, character_id: number) =>
    api.post('/ai/generate/expression-image', { expression_id, character_id }),

  generateTTS: (dialogue_id: number) =>
    api.post('/ai/generate/tts', { dialogue_id }),
};

// 工作流相关 API
export const workflowAPI = {
  /** 获取可用的风格和画幅选项 */
  getStyleOptions: () => api.get('/workflow/style-options'),
  // Stage 1: Script Analysis (SSE 流式)
  analyze: (projectId: number, settings?: { api_key?: string; base_url?: string; model?: string }) =>
    api.post(`/workflow/${projectId}/analyze`, settings || {}),

  /** 流式一键 AI 修正 (SSE) */
  applyReviewStream: (
    projectId: number,
    settings: { api_key?: string; base_url?: string; model?: string } | undefined,
    callbacks: {
      onChunk?: (text: string) => void;
      onStatus?: (data: any) => void;
      onDone?: (data: any) => void;
      onError?: (message: string) => void;
    }
  ) => streamRequest(`/api/workflow/${projectId}/apply-review`, settings || {}, callbacks),

  /** 流式分析剧本 (SSE) */
  analyzeStream: (
    projectId: number,
    settings: { api_key?: string; base_url?: string; model?: string } | undefined,
    callbacks: {
      onChunk?: (text: string) => void;
      onStatus?: (data: any) => void;
      onDone?: (data: any) => void;
      onError?: (message: string) => void;
    }
  ) => streamRequest(`/api/workflow/${projectId}/analyze`, settings || {}, callbacks),

  reviseScript: (projectId: number, feedback: string, settings?: { api_key?: string; base_url?: string; model?: string }) =>
    api.post(`/workflow/${projectId}/revise-script`, { feedback, ...settings }),

  /** 流式修改剧本 (SSE) */
  reviseScriptStream: (
    projectId: number,
    feedback: string,
    settings: { api_key?: string; base_url?: string; model?: string } | undefined,
    callbacks: {
      onChunk?: (text: string) => void;
      onStatus?: (data: any) => void;
      onDone?: (data: any) => void;
      onError?: (message: string) => void;
    }
  ) => streamRequest(`/api/workflow/${projectId}/revise-script`, { feedback, ...settings }, callbacks),

  /** 流式审核剧本 (SSE) */
  reviewScriptStream: (
    projectId: number,
    settings: { api_key?: string; base_url?: string; model?: string } | undefined,
    callbacks: {
      onChunk?: (text: string) => void;
      onStatus?: (data: any) => void;
      onDone?: (data: any) => void;
      onError?: (message: string) => void;
    }
  ) => streamRequest(`/api/workflow/${projectId}/review-script`, settings || {}, callbacks),

  approveScript: (projectId: number) =>
    api.post(`/workflow/${projectId}/approve-script`),

  backToReview: (projectId: number) =>
    api.post(`/workflow/${projectId}/back-to-review`),

  // Style Selection
  suggestStyles: (projectId: number, settings?: { api_key?: string; base_url?: string; model?: string }) =>
    api.post(`/workflow/${projectId}/suggest-styles`, settings || {}),

  setStyle: (projectId: number, style: string) =>
    api.put(`/workflow/${projectId}/style`, { style }),

  // Stage 2: Asset Generation
  /** 创建素材卡片（不生成图片） */
  createAssets: (projectId: number) =>
    api.post(`/workflow/${projectId}/create-assets`),
  recreateAssets: (projectId: number, style?: string) =>
    api.post(`/workflow/${projectId}/recreate-assets`, { style }),

  generateAssets: (projectId: number, settings?: { api_key?: string; base_url?: string; model?: string }) =>
    api.post(`/workflow/${projectId}/generate-assets`, settings || {}),

  getAssets: (projectId: number, type?: string) =>
    api.get(`/workflow/${projectId}/assets`, { params: type ? { type } : {} }),

  regenerateAsset: (projectId: number, assetId: number) =>
    api.post(`/workflow/${projectId}/generate-asset/${assetId}`),

  updateAsset: (projectId: number, assetId: number, data: { prompt?: string; voice_prompt?: string }) =>
    api.put(`/workflow/${projectId}/assets/${assetId}`, data),

  generateAssetAudio: (projectId: number, assetId: number) =>
    api.post(`/workflow/${projectId}/generate-asset-audio/${assetId}`),

  generateSingleAsset: (projectId: number, assetId: number, aiSettings?: any) =>
    api.post(`/workflow/${projectId}/assets/${assetId}/generate`, aiSettings || {}),

  // Stage 3: Storyboard Generation
  generateStoryboards: (projectId: number, settings?: { api_key?: string; base_url?: string; model?: string }) =>
    api.post(`/workflow/${projectId}/generate-storyboards`, settings || {}),

  getStoryboards: (projectId: number) =>
    api.get(`/workflow/${projectId}/storyboards`),

  /** 流式生成分镜 (SSE) */
  generateStoryboardsStream: (
    projectId: number,
    settings: { api_key?: string; base_url?: string; model?: string } | undefined,
    callbacks: {
      onChunk?: (text: string) => void;
      onStatus?: (data: any) => void;
      onDone?: (data: any) => void;
      onError?: (message: string) => void;
    }
  ) => streamRequest(`/api/workflow/${projectId}/generate-storyboards`, settings || {}, callbacks),

  // Stage 4: Keyframe Generation
  generateKeyframes: (projectId: number, settings?: { api_key?: string; base_url?: string; model?: string }) =>
    api.post(`/workflow/${projectId}/generate-keyframes`, settings || {}),

  // Stage 5: Video Generation
  generateVideo: (projectId: number, data?: { resolution?: string; bgm_volume?: number; title?: string }) =>
    api.post(`/workflow/${projectId}/generate-video`, data || {}),
  getVideoStatus: (projectId: number) =>
    api.get(`/workflow/${projectId}/video-status`),

  // Control
  getStatus: (projectId: number) =>
    api.get(`/workflow/${projectId}/status`),

  reset: (projectId: number) =>
    api.post(`/workflow/${projectId}/reset`),

  runAll: (projectId: number, settings?: { api_key?: string; base_url?: string; model?: string }) =>
    api.post(`/workflow/${projectId}/run-all`, settings || {}),

  retryFailed: (projectId: number, settings?: { api_key?: string; base_url?: string; model?: string }) =>
    api.post(`/workflow/${projectId}/retry-failed`, settings || {}),
};

// 剧集相关 API
export const episodeAPI = {
  suggest: (projectId: number, settings?: { api_key?: string; base_url?: string; model?: string }) =>
    api.post(`/projects/${projectId}/episodes/suggest`, settings || {}),

  getList: (projectId: number) =>
    api.get(`/projects/${projectId}/episodes`),

  createBatch: (projectId: number, episodes: Array<{
    title: string;
    description?: string;
    episode_number: number;
    target_minutes?: number;
    novel_text_segment?: string;
    style_preset?: string;
  }>) =>
    api.post(`/projects/${projectId}/episodes`, { episodes }),

  get: (episodeId: number) =>
    api.get(`/episodes/${episodeId}`),

  update: (episodeId: number, data: {
    title?: string;
    description?: string;
    target_minutes?: number;
    novel_text_segment?: string;
    style_preset?: string;
  }) =>
    api.put(`/episodes/${episodeId}`, data),

  delete: (episodeId: number) =>
    api.delete(`/episodes/${episodeId}`),
};

// 剧集工作流 API
export const episodeWorkflowAPI = {
  getStatus: (episodeId: number) =>
    api.get(`/episodes/${episodeId}/workflow/status`),

  analyze: (episodeId: number, settings?: { api_key?: string; base_url?: string; model?: string }) =>
    api.post(`/episodes/${episodeId}/workflow/analyze`, settings || {}),

  /** 流式一键 AI 修正 (SSE) */
  applyReviewStream: (
    episodeId: number,
    settings: { api_key?: string; base_url?: string; model?: string } | undefined,
    callbacks: {
      onChunk?: (text: string) => void;
      onStatus?: (data: any) => void;
      onDone?: (data: any) => void;
      onError?: (message: string) => void;
    }
  ) => streamRequest(`/api/episodes/${episodeId}/workflow/apply-review`, settings || {}, callbacks),

  /** 流式分析剧本 (SSE) */
  analyzeStream: (
    episodeId: number,
    settings: { api_key?: string; base_url?: string; model?: string } | undefined,
    callbacks: {
      onChunk?: (text: string) => void;
      onStatus?: (data: any) => void;
      onDone?: (data: any) => void;
      onError?: (message: string) => void;
    }
  ) => streamRequest(`/api/episodes/${episodeId}/workflow/analyze`, settings || {}, callbacks),

  reviseScriptStream: (
    episodeId: number,
    feedback: string,
    settings: { api_key?: string; base_url?: string; model?: string } | undefined,
    callbacks: {
      onChunk?: (text: string) => void;
      onStatus?: (data: any) => void;
      onDone?: (data: any) => void;
      onError?: (message: string) => void;
    }
  ) => streamRequest(`/api/episodes/${episodeId}/workflow/revise-script`, { feedback, ...settings }, callbacks),

  /** 流式审核剧本 (SSE) */
  reviewScriptStream: (
    episodeId: number,
    settings: { api_key?: string; base_url?: string; model?: string } | undefined,
    callbacks: {
      onChunk?: (text: string) => void;
      onStatus?: (data: any) => void;
      onDone?: (data: any) => void;
      onError?: (message: string) => void;
    }
  ) => streamRequest(`/api/episodes/${episodeId}/workflow/review-script`, settings || {}, callbacks),

  approveScript: (episodeId: number) =>
    api.post(`/episodes/${episodeId}/workflow/approve-script`),

  backToReview: (episodeId: number) =>
    api.post(`/episodes/${episodeId}/workflow/back-to-review`),

  suggestStyles: (episodeId: number, settings?: { api_key?: string; base_url?: string; model?: string }) =>
    api.post(`/episodes/${episodeId}/workflow/suggest-styles`, settings || {}),

  setStyle: (episodeId: number, style: string) =>
    api.put(`/episodes/${episodeId}/workflow/style`, { style }),

  /** 创建素材卡片（不生成图片） */
  createAssets: (episodeId: number) =>
    api.post(`/episodes/${episodeId}/workflow/create-assets`),
  recreateAssets: (episodeId: number, style?: string) =>
    api.post(`/episodes/${episodeId}/workflow/recreate-assets`, { style }),

  generateAssets: (episodeId: number, settings?: { api_key?: string; base_url?: string; model?: string }) =>
    api.post(`/episodes/${episodeId}/workflow/generate-assets`, settings || {}),

  getAssets: (episodeId: number, type?: string, version?: string) =>
    api.get(`/episodes/${episodeId}/workflow/assets`, { params: { ...(type ? { type } : {}), ...(version ? { version } : {}) } }),

  generateSingleAsset: (episodeId: number, assetId: number, aiSettings?: any) =>
    api.post(`/episodes/${episodeId}/workflow/assets/${assetId}/generate`, aiSettings || {}),

  regenerateAsset: (episodeId: number, assetId: number) =>
    api.post(`/episodes/${episodeId}/workflow/assets/${assetId}/regenerate`),

  // Keyframe card operations
  createKeyframeCards: (episodeId: number, style?: string) =>
    api.post(`/episodes/${episodeId}/workflow/create-keyframe-cards`, { style }),

  generateSingleKeyframe: (episodeId: number, assetId: number, aiSettings?: any) =>
    api.post(`/episodes/${episodeId}/workflow/keyframes/${assetId}/generate`, aiSettings || {}),

  regenerateKeyframe: (episodeId: number, assetId: number) =>
    api.post(`/episodes/${episodeId}/workflow/keyframes/${assetId}/regenerate`),

  getStoryboards: (episodeId: number, version?: string) =>
    api.get(`/episodes/${episodeId}/workflow/storyboards`, { params: version ? { version } : {} }),

  generateStoryboardsStream: (
    episodeId: number,
    settings: { api_key?: string; base_url?: string; model?: string; version?: string } | undefined,
    callbacks: {
      onChunk?: (text: string) => void;
      onStatus?: (data: any) => void;
      onDone?: (data: any) => void;
      onError?: (message: string) => void;
    }
  ) => {
    const version = settings?.version || 'both';
    const { version: _, ...rest } = settings || {};
    return streamRequest(`/api/episodes/${episodeId}/workflow/generate-storyboards?version=${version}`, rest, callbacks);
  },

  generateKeyframes: (episodeId: number, settings?: { api_key?: string; base_url?: string; model?: string }) =>
    api.post(`/episodes/${episodeId}/workflow/generate-keyframes`, settings || {}),

  // Stage 5: Video Generation
  createVideoClips: (episodeId: number) =>
    api.post(`/episodes/${episodeId}/workflow/create-video-clips`),
  generateSingleVideoClip: (episodeId: number, assetId: number, aiSettings?: any) =>
    api.post(`/episodes/${episodeId}/workflow/video-clips/${assetId}/generate`, aiSettings || {}),
  mergeVideoClips: (episodeId: number, data?: { resolution?: string; title?: string }) =>
    api.post(`/episodes/${episodeId}/workflow/merge-video-clips`, data || {}),
  getVideoClips: (episodeId: number, version?: string) =>
    api.get(`/episodes/${episodeId}/workflow/assets`, { params: { type: 'video_clip', ...(version ? { version } : {}) } }),
  getVideoStatus: (episodeId: number) =>
    api.get(`/episodes/${episodeId}/workflow/video-status`),
  getVideos: (episodeId: number) =>
    api.get(`/episodes/${episodeId}/workflow/videos`),

  reset: (episodeId: number) =>
    api.post(`/episodes/${episodeId}/workflow/reset`),

  retryFailed: (episodeId: number, settings?: { api_key?: string; base_url?: string; model?: string }) =>
    api.post(`/episodes/${episodeId}/workflow/retry-failed`, settings || {}),
};

// 版本控制相关 API
export const versionAPI = {
  getByProject: (projectId: number) =>
    api.get(`/versions/project/${projectId}`),

  create: (projectId: number, label?: string) =>
    api.post(`/versions/project/${projectId}`, { label }),

  getById: (id: number) =>
    api.get(`/versions/${id}`),

  restore: (id: number) =>
    api.post(`/versions/${id}/restore`),

  delete: (id: number) =>
    api.delete(`/versions/${id}`),
};

export default api;