import { create } from 'zustand';
import { videoAPI, assetAPI } from '../services/api';

interface Video {
  id: number;
  project_id: number;
  title: string;
  description: string;
  status: string;
  resolution: string;
  duration: number;
  file_path: string;
  thumbnail: string;
  bgm_path: string;
  created_at: string;
}

interface AudioAsset {
  id: number;
  name: string;
  file_path: string;
}

interface VideoState {
  videos: Video[];
  audioAssets: AudioAsset[];
  ffmpegAvailable: boolean | null;
  loading: boolean;
  fetchVideos: (projectId: number) => Promise<void>;
  fetchFFmpegStatus: () => Promise<void>;
  fetchAudioAssets: () => Promise<void>;
  createVideo: (data: any) => Promise<void>;
  deleteVideo: (id: number) => Promise<void>;
}

export const useVideoStore = create<VideoState>((set, get) => ({
  videos: [],
  audioAssets: [],
  ffmpegAvailable: null,
  loading: false,

  fetchVideos: async (projectId) => {
    set({ loading: true });
    try {
      const res = await videoAPI.getByProject(projectId);
      set({ videos: res.data });
    } catch {
      set({ videos: [] });
    } finally {
      set({ loading: false });
    }
  },

  fetchFFmpegStatus: async () => {
    try {
      const res = await videoAPI.getFFmpegStatus();
      set({ ffmpegAvailable: res.data.available });
    } catch {
      set({ ffmpegAvailable: false });
    }
  },

  fetchAudioAssets: async () => {
    try {
      const res = await assetAPI.getList({ type: 'audio', limit: 100 });
      set({ audioAssets: res.data.assets || [] });
    } catch {
      set({ audioAssets: [] });
    }
  },

  createVideo: async (data) => {
    await videoAPI.create(data);
    if (data.project_id) get().fetchVideos(data.project_id);
  },

  deleteVideo: async (id) => {
    await videoAPI.delete(id);
    set({ videos: get().videos.filter(v => v.id !== id) });
  },
}));
