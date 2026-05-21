import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { EpisodeController } from '../controllers/episode';

const router = Router();

// Project-scoped: /api/projects/:projectId/episodes/*
router.post('/:projectId/episodes/suggest', authenticate, EpisodeController.suggest);
router.post('/:projectId/episodes', authenticate, EpisodeController.createBatch);
router.get('/:projectId/episodes', authenticate, EpisodeController.list);

// Episode-scoped: /api/episodes/:episodeId
router.get('/:episodeId', authenticate, EpisodeController.get);
router.put('/:episodeId', authenticate, EpisodeController.update);
router.delete('/:episodeId', authenticate, EpisodeController.delete);

export default router;
