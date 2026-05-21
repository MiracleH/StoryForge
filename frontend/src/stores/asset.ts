import { create } from 'zustand';
import { assetAPI } from '../services/api';

interface Asset {
  id: number;
  name: string;
  type: string;
  file_path: string;
  metadata: string;
  created_at: string;
}

interface AssetState {
  assets: Asset[];
  loading: boolean;
  fetchAssets: (params?: { type?: string; page?: number; limit?: number }) => Promise<void>;
  uploadAsset: (file: File, name: string, type: string) => Promise<void>;
  deleteAsset: (id: number) => Promise<void>;
}

export const useAssetStore = create<AssetState>((set, get) => ({
  assets: [],
  loading: false,

  fetchAssets: async (params) => {
    set({ loading: true });
    try {
      const res = await assetAPI.getList(params);
      set({ assets: res.data.assets || [] });
    } catch {
      set({ assets: [] });
    } finally {
      set({ loading: false });
    }
  },

  uploadAsset: async (file, name, type) => {
    await assetAPI.upload(file, name, type);
    get().fetchAssets();
  },

  deleteAsset: async (id) => {
    await assetAPI.delete(id);
    set({ assets: get().assets.filter(a => a.id !== id) });
  },
}));
