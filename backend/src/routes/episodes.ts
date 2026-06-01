import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { EpisodeController } from '../controllers/episode';

// Project-scoped: mounted at /api/projects
const projectEpisodeRouter = Router({ mergeParams: true });

projectEpisodeRouter.post('/:projectId/episodes/suggest', authenticate, EpisodeController.suggest);
projectEpisodeRouter.post('/:projectId/episodes', authenticate, EpisodeController.createBatch);
projectEpisodeRouter.get('/:projectId/episodes', authenticate, EpisodeController.list);

// Episode-scoped: mounted at /api/episodes
const episodeRouter = Router({ mergeParams: true });

episodeRouter.get('/:episodeId', authenticate, EpisodeController.get);
episodeRouter.put('/:episodeId', authenticate, EpisodeController.update);
episodeRouter.delete('/:episodeId', authenticate, EpisodeController.delete);

export default projectEpisodeRouter;
export { episodeRouter };
