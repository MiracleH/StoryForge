import { create } from 'zustand';
import { storyboardAPI, scriptAnalysisAPI, sceneAPI } from '../services/api';

interface Storyboard {
  id: number;
  scene_id: number;
  title: string;
  description: string;
  image_url: string;
  duration: number;
  camera_angle: string;
  camera_movement: string;
  order_index: number;
  transition_type?: string;
  transition_duration?: number;
  dialogues?: Dialogue[];
}

interface Dialogue {
  id: number;
  content: string;
  character_id: number;
  position_x: number;
  position_y: number;
  style: string;
  order_index: number;
  audio_path?: string;
}

interface Scene {
  id: number;
  chapter_id: number;
  title: string;
  description: string;
  background_image: string;
  order_index: number;
}

interface Chapter {
  id: number;
  title: string;
  scenes: Scene[];
}

interface StoryboardState {
  chapters: Chapter[];
  scenes: Scene[];
  storyboards: Storyboard[];
  currentStoryboard: Storyboard | null;
  currentIdx: number;
  loading: boolean;
  fetchChapters: (projectId: number) => Promise<void>;
  fetchScenes: (chapterId: number) => Promise<void>;
  fetchStoryboards: (sceneId: number) => Promise<void>;
  createStoryboard: (data: any) => Promise<Storyboard | null>;
  updateStoryboard: (id: number, data: any) => Promise<void>;
  deleteStoryboard: (id: number) => Promise<void>;
  reorderStoryboards: (sceneId: number, ids: number[]) => Promise<void>;
  addDialogue: (storyboardId: number, data: any) => Promise<void>;
  deleteDialogue: (dialogueId: number) => Promise<void>;
  setCurrentIdx: (idx: number) => void;
  setCurrentStoryboard: (sb: Storyboard | null) => void;
  createScene: (data: any) => Promise<void>;
  updateScene: (id: number, data: any) => Promise<void>;
  deleteScene: (id: number) => Promise<void>;
}

export const useStoryboardStore = create<StoryboardState>((set, get) => ({
  chapters: [],
  scenes: [],
  storyboards: [],
  currentStoryboard: null,
  currentIdx: 0,
  loading: false,

  fetchChapters: async (projectId) => {
    set({ loading: true });
    try {
      const res = await scriptAnalysisAPI.getResult(projectId);
      set({ chapters: res.data.chapters || [] });
    } catch {
      set({ chapters: [] });
    } finally {
      set({ loading: false });
    }
  },

  fetchScenes: async (chapterId) => {
    try {
      const res = await sceneAPI.getByChapter(chapterId);
      set({ scenes: res.data });
    } catch {
      set({ scenes: [] });
    }
  },

  fetchStoryboards: async (sceneId) => {
    set({ loading: true });
    try {
      const res = await storyboardAPI.getByScene(sceneId);
      const sbs = res.data || [];
      set({ storyboards: sbs, currentIdx: 0, currentStoryboard: sbs[0] || null });
    } catch {
      set({ storyboards: [], currentStoryboard: null });
    } finally {
      set({ loading: false });
    }
  },

  createStoryboard: async (data) => {
    try {
      const res = await storyboardAPI.create(data);
      const newSb = res.data;
      set(state => {
        const sbs = [...state.storyboards, newSb];
        return { storyboards: sbs, currentIdx: sbs.length - 1, currentStoryboard: newSb };
      });
      return newSb;
    } catch {
      return null;
    }
  },

  updateStoryboard: async (id, data) => {
    await storyboardAPI.update(id, data);
    set(state => {
      const sbs = state.storyboards.map(sb => sb.id === id ? { ...sb, ...data } : sb);
      const current = state.currentStoryboard?.id === id ? { ...state.currentStoryboard, ...data } : state.currentStoryboard;
      return { storyboards: sbs, currentStoryboard: current };
    });
  },

  deleteStoryboard: async (id) => {
    await storyboardAPI.delete(id);
    set(state => {
      const sbs = state.storyboards.filter(sb => sb.id !== id);
      const newIdx = Math.max(0, state.currentIdx - 1);
      return { storyboards: sbs, currentIdx: newIdx, currentStoryboard: sbs[newIdx] || null };
    });
  },

  reorderStoryboards: async (sceneId, ids) => {
    await storyboardAPI.reorder(sceneId, ids);
  },

  addDialogue: async (storyboardId, data) => {
    const res = await storyboardAPI.addDialogue(storyboardId, data);
    set(state => {
      const sbs = state.storyboards.map(sb => {
        if (sb.id === storyboardId) {
          return { ...sb, dialogues: [...(sb.dialogues || []), res.data] };
        }
        return sb;
      });
      const current = state.currentStoryboard?.id === storyboardId
        ? { ...state.currentStoryboard, dialogues: [...(state.currentStoryboard.dialogues || []), res.data] }
        : state.currentStoryboard;
      return { storyboards: sbs, currentStoryboard: current };
    });
  },

  deleteDialogue: async (dialogueId) => {
    await storyboardAPI.deleteDialogue(dialogueId);
    set(state => {
      const sbs = state.storyboards.map(sb => ({
        ...sb,
        dialogues: sb.dialogues?.filter(d => d.id !== dialogueId),
      }));
      const current = state.currentStoryboard ? {
        ...state.currentStoryboard,
        dialogues: state.currentStoryboard.dialogues?.filter(d => d.id !== dialogueId),
      } : null;
      return { storyboards: sbs, currentStoryboard: current };
    });
  },

  setCurrentIdx: (idx) => set(state => ({
    currentIdx: idx,
    currentStoryboard: state.storyboards[idx] || null,
  })),

  setCurrentStoryboard: (sb) => set({ currentStoryboard: sb }),

  createScene: async (data) => {
    await sceneAPI.create(data);
    if (data.chapter_id) get().fetchScenes(data.chapter_id);
  },

  updateScene: async (id, data) => {
    await sceneAPI.update(id, data);
    set({ scenes: get().scenes.map(s => s.id === id ? { ...s, ...data } : s) });
  },

  deleteScene: async (id) => {
    await sceneAPI.delete(id);
    set({ scenes: get().scenes.filter(s => s.id !== id) });
  },
}));
