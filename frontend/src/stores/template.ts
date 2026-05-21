import { create } from 'zustand';
import { templateAPI } from '../services/api';

interface Template {
  id: number;
  name: string;
  description: string;
  category: string;
  structure: string;
  builtin: number;
  created_at: string;
}

interface TemplateState {
  templates: Template[];
  loading: boolean;
  fetchTemplates: (params?: { category?: string; limit?: number }) => Promise<void>;
  createTemplate: (data: any) => Promise<void>;
  applyTemplate: (templateId: number, projectId: number) => Promise<void>;
  deleteTemplate: (id: number) => Promise<void>;
}

export const useTemplateStore = create<TemplateState>((set, get) => ({
  templates: [],
  loading: false,

  fetchTemplates: async (params) => {
    set({ loading: true });
    try {
      const res = await templateAPI.getList(params);
      set({ templates: res.data });
    } catch {
      set({ templates: [] });
    } finally {
      set({ loading: false });
    }
  },

  createTemplate: async (data) => {
    await templateAPI.create(data);
    get().fetchTemplates();
  },

  applyTemplate: async (templateId, projectId) => {
    await templateAPI.apply(templateId, projectId);
  },

  deleteTemplate: async (id) => {
    await templateAPI.delete(id);
    set({ templates: get().templates.filter(t => t.id !== id) });
  },
}));
