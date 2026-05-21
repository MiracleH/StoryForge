import { create } from 'zustand';
import { aiAPI } from '../services/api';

interface AIFeatureConfig {
  available: boolean;
  model: string;
  voice?: string;
}

interface AIConfig {
  available: boolean;
  text: AIFeatureConfig;
  image: AIFeatureConfig;
  video: AIFeatureConfig;
  tts: AIFeatureConfig;
}

interface AIState {
  config: AIConfig | null;
  generating: Record<string, boolean>;
  fetchConfig: () => Promise<void>;
  setGenerating: (key: string, value: boolean) => void;
  generateCharacterImage: (characterId: number) => Promise<string>;
  generateSceneImage: (sceneId: number) => Promise<string>;
  generateStoryboardImage: (storyboardId: number) => Promise<string>;
  generateExpressionImage: (expressionId: number, characterId: number) => Promise<string>;
  generateTTS: (dialogueId: number) => Promise<string>;
}

export const useAIStore = create<AIState>((set, get) => ({
  config: null,
  generating: {},

  fetchConfig: async () => {
    const res: any = await aiAPI.getConfig();
    set({ config: res.data });
  },

  setGenerating: (key, value) => {
    set((state) => ({ generating: { ...state.generating, [key]: value } }));
  },

  generateCharacterImage: async (characterId) => {
    const key = `character-${characterId}`;
    get().setGenerating(key, true);
    try {
      const res: any = await aiAPI.generateCharacterImage(characterId);
      return res.data.avatar;
    } finally {
      get().setGenerating(key, false);
    }
  },

  generateSceneImage: async (sceneId) => {
    const key = `scene-${sceneId}`;
    get().setGenerating(key, true);
    try {
      const res: any = await aiAPI.generateSceneImage(sceneId);
      return res.data.background_image;
    } finally {
      get().setGenerating(key, false);
    }
  },

  generateStoryboardImage: async (storyboardId) => {
    const key = `storyboard-${storyboardId}`;
    get().setGenerating(key, true);
    try {
      const res: any = await aiAPI.generateStoryboardImage(storyboardId);
      return res.data.image_url;
    } finally {
      get().setGenerating(key, false);
    }
  },

  generateExpressionImage: async (expressionId, characterId) => {
    const key = `expression-${expressionId}`;
    get().setGenerating(key, true);
    try {
      const res: any = await aiAPI.generateExpressionImage(expressionId, characterId);
      return res.data.image_url;
    } finally {
      get().setGenerating(key, false);
    }
  },

  generateTTS: async (dialogueId) => {
    const key = `tts-${dialogueId}`;
    get().setGenerating(key, true);
    try {
      const res: any = await aiAPI.generateTTS(dialogueId);
      return res.data.audio_path;
    } finally {
      get().setGenerating(key, false);
    }
  },
}));
