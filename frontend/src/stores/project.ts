import { create } from 'zustand';
import { projectAPI } from '../services/api';

interface Project {
  id: number;
  title: string;
  description: string;
  status: string;
  novel_text?: string;
  created_at: string;
  updated_at: string;
}

interface ProjectStats {
  total_projects: number;
  draft_projects: number;
  in_progress_projects: number;
  completed_projects: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
}

interface ProjectState {
  projects: Project[];
  currentProject: Project | null;
  stats: ProjectStats | null;
  pagination: Pagination;
  loading: boolean;
  fetchProjects: (params?: { page?: number; limit?: number; status?: string }) => Promise<void>;
  fetchProject: (id: number) => Promise<void>;
  fetchStats: () => Promise<void>;
  createProject: (data: { title: string; description?: string; novel_text?: string; file?: File }) => Promise<any>;
  updateProject: (id: number, data: Partial<Project>) => Promise<void>;
  deleteProject: (id: number) => Promise<void>;
  setCurrentProject: (project: Project | null) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProject: null,
  stats: null,
  pagination: { page: 1, limit: 10, total: 0 },
  loading: false,

  fetchProjects: async (params) => {
    set({ loading: true });
    try {
      const res = await projectAPI.getList(params);
      set({
        projects: res.data.projects,
        pagination: res.data.pagination || get().pagination,
      });
    } catch {} finally {
      set({ loading: false });
    }
  },

  fetchProject: async (id) => {
    set({ loading: true });
    try {
      const res = await projectAPI.getById(id);
      set({ currentProject: res.data });
    } catch (err: any) {
      console.error('获取项目失败:', err?.message || err);
      set({ currentProject: null });
    } finally {
      set({ loading: false });
    }
  },

  fetchStats: async () => {
    try {
      const res = await projectAPI.getStats();
      set({ stats: res.data });
    } catch {}
  },

  createProject: async (data) => {
    const res = await projectAPI.create(data);
    get().fetchProjects();
    return res.data;
  },

  updateProject: async (id, data) => {
    await projectAPI.update(id, data);
    const { currentProject } = get();
    if (currentProject?.id === id) {
      set({ currentProject: { ...currentProject, ...data } });
    }
    get().fetchProjects();
  },

  deleteProject: async (id) => {
    await projectAPI.delete(id);
    const { projects } = get();
    set({ projects: projects.filter(p => p.id !== id) });
  },

  setCurrentProject: (project) => set({ currentProject: project }),
}));
