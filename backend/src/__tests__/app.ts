import { initTestDb, getTestDb, closeTestDb } from './setup';

// 初始化测试数据库（必须在导入 app 之前）
const testDb = initTestDb();

// 覆盖 database 模块
vi.mock('../database/setup', () => ({
  getDatabase: () => testDb,
  setupDatabase: async () => {},
  closeDatabase: () => {},
}));

// 覆盖 videoRenderer 避免 FFmpeg 依赖
vi.mock('../services/videoRenderer', () => ({
  enqueueVideoRender: vi.fn(),
  isFFmpegAvailable: () => false,
}));

// 覆盖 AI 服务避免 OpenAI SDK 初始化
vi.mock('../services/ai', () => ({
  isAIConfigured: () => false,
  isTextConfigured: () => false,
  isImageConfigured: () => false,
  isVideoConfigured: () => false,
  isTTSConfigured: () => false,
  aiConfig: { textModel: 'gpt-4o', imageModel: 'dall-e-3', videoModel: 'sora', ttsModel: 'tts-1', ttsVoice: 'alloy' },
  generateImage: vi.fn(),
  generateSpeech: vi.fn(),
  downloadImage: vi.fn(),
  saveFile: vi.fn(),
}));

import express from 'express';
import cors from 'cors';
import { errorHandler } from '../middleware/errorHandler';
import authRoutes from '../routes/auth';
import projectRoutes from '../routes/projects';
import characterRoutes from '../routes/characters';
import sceneRoutes from '../routes/scenes';
import storyboardRoutes from '../routes/storyboards';
import videoRoutes from '../routes/videos';
import assetRoutes from '../routes/assets';
import templateRoutes from '../routes/templates';
import versionRoutes from '../routes/versions';
import characterAssetRoutes from '../routes/character-assets';
import scriptAnalysisRoutes from '../routes/script-analysis';
import aiRoutes from '../routes/ai';

export function createTestApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use('/api/auth', authRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/characters', characterRoutes);
  app.use('/api/scenes', sceneRoutes);
  app.use('/api/storyboards', storyboardRoutes);
  app.use('/api/videos', videoRoutes);
  app.use('/api/assets', assetRoutes);
  app.use('/api/templates', templateRoutes);
  app.use('/api/versions', versionRoutes);
  app.use('/api/character-assets', characterAssetRoutes);
  app.use('/api/script-analysis', scriptAnalysisRoutes);
  app.use('/api/ai', aiRoutes);

  app.use(errorHandler);

  return app;
}

export { testDb };
export const closeTestDb = () => testDb.close();
