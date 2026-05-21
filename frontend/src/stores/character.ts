import { create } from 'zustand';
import { characterAPI, characterAssetAPI } from '../services/api';

interface Character {
  id: number;
  project_id: number;
  name: string;
  description: string;
  personality: string;
  appearance: string;
  style: string;
  created_at: string;
}

interface Expression {
  id: number;
  character_id: number;
  name: string;
  description: string;
  image_url: string;
  emotion: string;
}

interface Action {
  id: number;
  character_id: number;
  name: string;
  description: string;
  image_url: string;
  category: string;
}

interface CharacterState {
  characters: Character[];
  expressions: Expression[];
  actions: Action[];
  loading: boolean;
  fetchCharacters: (projectId: number) => Promise<void>;
  createCharacter: (data: any) => Promise<void>;
  updateCharacter: (id: number, data: any) => Promise<void>;
  deleteCharacter: (id: number) => Promise<void>;
  fetchExpressions: (characterId: number) => Promise<void>;
  addExpression: (characterId: number, data: any) => Promise<void>;
  deleteExpression: (id: number) => Promise<void>;
  fetchActions: (characterId: number) => Promise<void>;
  addAction: (characterId: number, data: any) => Promise<void>;
  deleteAction: (id: number) => Promise<void>;
}

export const useCharacterStore = create<CharacterState>((set, get) => ({
  characters: [],
  expressions: [],
  actions: [],
  loading: false,

  fetchCharacters: async (projectId) => {
    set({ loading: true });
    try {
      const res = await characterAPI.getByProject(projectId);
      set({ characters: res.data });
    } catch {} finally {
      set({ loading: false });
    }
  },

  createCharacter: async (data) => {
    await characterAPI.create(data);
    get().fetchCharacters(data.project_id);
  },

  updateCharacter: async (id, data) => {
    await characterAPI.update(id, data);
    set({ characters: get().characters.map(c => c.id === id ? { ...c, ...data } : c) });
  },

  deleteCharacter: async (id) => {
    await characterAPI.delete(id);
    set({ characters: get().characters.filter(c => c.id !== id) });
  },

  fetchExpressions: async (characterId) => {
    try {
      const res = await characterAssetAPI.getExpressions(characterId);
      set({ expressions: res.data });
    } catch {}
  },

  addExpression: async (characterId, data) => {
    await characterAssetAPI.addExpression(characterId, data);
    get().fetchExpressions(characterId);
  },

  deleteExpression: async (id) => {
    await characterAssetAPI.deleteExpression(id);
    set({ expressions: get().expressions.filter(e => e.id !== id) });
  },

  fetchActions: async (characterId) => {
    try {
      const res = await characterAssetAPI.getActions(characterId);
      set({ actions: res.data });
    } catch {}
  },

  addAction: async (characterId, data) => {
    await characterAssetAPI.addAction(characterId, data);
    get().fetchActions(characterId);
  },

  deleteAction: async (id) => {
    await characterAssetAPI.deleteAction(id);
    set({ actions: get().actions.filter(a => a.id !== id) });
  },
}));
