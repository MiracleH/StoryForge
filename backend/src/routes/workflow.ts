import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { WorkflowController, EpisodeWorkflowController } from '../controllers/workflow';

const router = Router();
const episodeRouter = Router();

// Status
router.get('/:projectId/status', authenticate, WorkflowController.getStatus);

// Stage 1: Script Analysis + Review
router.post('/:projectId/analyze', authenticate, WorkflowController.analyze);
router.post('/:projectId/analyze-typechat', authenticate, WorkflowController.analyzeTypeChat);
router.post('/:projectId/review-script', authenticate, WorkflowController.reviewScript);
router.post('/:projectId/review-typechat', authenticate, WorkflowController.reviewTypeChat);
router.post('/:projectId/revise-script', authenticate, WorkflowController.reviseScript);
router.post('/:projectId/approve-script', authenticate, WorkflowController.approveScript);
router.post('/:projectId/back-to-review', authenticate, WorkflowController.backToReview);

// Stage 2: Asset Generation
router.post('/:projectId/generate-assets', authenticate, WorkflowController.generateAssets);
router.get('/:projectId/assets', authenticate, WorkflowController.getAssets);
router.post('/:projectId/generate-asset/:assetId', authenticate, WorkflowController.regenerateAsset);
router.put('/:projectId/assets/:assetId', authenticate, WorkflowController.updateAsset);
router.post('/:projectId/generate-asset-audio/:assetId', authenticate, WorkflowController.generateAssetAudioEndpoint);

// Stage 3: Storyboard Generation
router.post('/:projectId/generate-storyboards', authenticate, WorkflowController.generateStoryboards);

// Stage 4: Keyframe Generation
router.post('/:projectId/generate-keyframes', authenticate, WorkflowController.generateKeyframesEndpoint);

// Control
router.post('/:projectId/reset', authenticate, WorkflowController.reset);
router.post('/:projectId/run-all', authenticate, WorkflowController.runAll);
router.post('/:projectId/retry-failed', authenticate, WorkflowController.retryFailed);

// ==================== Episode Workflow Routes ====================

// Status
episodeRouter.get('/:episodeId/workflow/status', authenticate, EpisodeWorkflowController.getStatus);

// Stage 1: Script Analysis + Review
episodeRouter.post('/:episodeId/workflow/analyze', authenticate, EpisodeWorkflowController.analyze);
episodeRouter.post('/:episodeId/workflow/analyze-typechat', authenticate, EpisodeWorkflowController.analyzeTypeChat);
episodeRouter.post('/:episodeId/workflow/review-script', authenticate, EpisodeWorkflowController.reviewScript);
episodeRouter.post('/:episodeId/workflow/review-typechat', authenticate, EpisodeWorkflowController.reviewTypeChat);
episodeRouter.post('/:episodeId/workflow/revise-script', authenticate, EpisodeWorkflowController.reviseScript);
episodeRouter.post('/:episodeId/workflow/approve-script', authenticate, EpisodeWorkflowController.approveScript);
episodeRouter.post('/:episodeId/workflow/back-to-review', authenticate, EpisodeWorkflowController.backToReview);

// Stage 2: Asset Generation
episodeRouter.post('/:episodeId/workflow/generate-assets', authenticate, EpisodeWorkflowController.generateAssets);
episodeRouter.get('/:episodeId/workflow/assets', authenticate, EpisodeWorkflowController.getAssets);

// Stage 3: Storyboard Generation
episodeRouter.post('/:episodeId/workflow/generate-storyboards', authenticate, EpisodeWorkflowController.generateStoryboards);

// Stage 4: Keyframe Generation
episodeRouter.post('/:episodeId/workflow/generate-keyframes', authenticate, EpisodeWorkflowController.generateKeyframesEndpoint);

// Control
episodeRouter.post('/:episodeId/workflow/reset', authenticate, EpisodeWorkflowController.reset);
episodeRouter.post('/:episodeId/workflow/retry-failed', authenticate, EpisodeWorkflowController.retryFailed);

export default router;
export { episodeRouter };
