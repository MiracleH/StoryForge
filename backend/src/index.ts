import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import path from 'path';
import dotenv from 'dotenv';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { apiLimiter } from './middleware/rateLimit';
import { setupDatabase } from './database/setup';

import authRoutes from './routes/auth';
import projectRoutes from './routes/projects';
import characterRoutes from './routes/characters';
import sceneRoutes from './routes/scenes';
import storyboardRoutes from './routes/storyboards';
import videoRoutes from './routes/videos';
import scriptAnalysisRoutes from './routes/script-analysis';
import chapterRoutes from './routes/chapters';
import assetRoutes from './routes/assets';
import templateRoutes from './routes/templates';
import versionRoutes from './routes/versions';
import characterAssetRoutes from './routes/character-assets';
import aiRoutes from './routes/ai';
import workflowRoutes, { episodeRouter as episodeWorkflowRoutes } from './routes/workflow';
import episodeRoutes from './routes/episodes';

// 加载环境变量
dotenv.config();

// JWT_SECRET 强制检查
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  logger.error('FATAL: JWT_SECRET must be set and >= 32 chars');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;
const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');

// 中间件
app.use(helmet());
app.use(compression({
  filter: (req, res) => {
    // 不压缩 SSE 响应，否则会缓冲导致前端收不到流式数据
    if (res.getHeader('Content-Type') === 'text/event-stream') return false;
    return compression.filter(req, res);
  },
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// 全局限流
app.use('/api/', apiLimiter);

// 静态文件服务（7天缓存）
app.use('/uploads', express.static(uploadDir, { maxAge: '7d', etag: true }));

// 健康检查
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API路由
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/characters', characterRoutes);
app.use('/api/scenes', sceneRoutes);
app.use('/api/storyboards', storyboardRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/script-analysis', scriptAnalysisRoutes);
app.use('/api/chapters', chapterRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/versions', versionRoutes);
app.use('/api/character-assets', characterAssetRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/workflow', workflowRoutes);
app.use('/api/projects', episodeRoutes);
app.use('/api/episodes', episodeRoutes);
app.use('/api/episodes', episodeWorkflowRoutes);

// 错误处理
app.use(errorHandler);

// 启动服务器
const startServer = async () => {
  try {
    await setupDatabase();
    logger.info('Database initialized successfully');

    app.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export { app };
