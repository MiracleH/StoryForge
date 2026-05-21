import { create } from 'zustand';
import { versionAPI } from '../services/api';

interface Version {
  id: number;
  project_id: number;
  version_num: number;
  label: string;
  snapshot: string;
  created_at: string;
}

interface VersionState {
  versions: Version[];
  loading: boolean;
  fetchVersions: (projectId: number) => Promise<void>;
  createVersion: (projectId: number, label?: string) => Promise<void>;
  restoreVersion: (id: number) => Promise<void>;
  deleteVersion: (id: number) => Promise<void>;
}

export const useVersionStore = create<VersionState>((set, get) => ({
  versions: [],
  loading: false,

  fetchVersions: async (projectId) => {
    set({ loading: true });
    try {
      const res = await versionAPI.getByProject(projectId);
      set({ versions: res.data });
    } catch {
      set({ versions: [] });
    } finally {
      set({ loading: false });
    }
  },

  createVersion: async (projectId, label) => {
    await versionAPI.create(projectId, label);
    get().fetchVersions(projectId);
  },

  restoreVersion: async (id) => {
    await versionAPI.restore(id);
  },

  deleteVersion: async (id) => {
    await versionAPI.delete(id);
    set({ versions: get().versions.filter(v => v.id !== id) });
  },
}));
