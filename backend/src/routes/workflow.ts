import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { WorkflowController, EpisodeWorkflowController } from '../controllers/workflow';

const router = Router();
const episodeRouter = Router();

// Options (must be before :projectId routes)
router.get('/style-options', WorkflowController.getStyleOptions);

// Status
router.get('/:projectId/status', authenticate, WorkflowController.getStatus);

// Stage 1: Script Analysis + Review
router.post('/:projectId/analyze', authenticate, WorkflowController.analyze);
router.post('/:projectId/review-script', authenticate, WorkflowController.reviewScript);
router.post('/:projectId/apply-review', authenticate, WorkflowController.applyReview);
router.post('/:projectId/revise-script', authenticate, WorkflowController.reviseScript);
router.post('/:projectId/approve-script', authenticate, WorkflowController.approveScript);
router.post('/:projectId/back-to-review', authenticate, WorkflowController.backToReview);

// Style Selection
router.post('/:projectId/suggest-styles', authenticate, WorkflowController.suggestStyles);
router.put('/:projectId/style', authenticate, WorkflowController.setStyle);

// Stage 2: Asset Generation
router.post('/:projectId/create-assets', authenticate, WorkflowController.createAssets);
router.post('/:projectId/recreate-assets', authenticate, WorkflowController.recreateAssets);
router.post('/:projectId/generate-assets', authenticate, WorkflowController.generateAssets);
router.get('/:projectId/assets', authenticate, WorkflowController.getAssets);
router.post('/:projectId/assets/:assetId/generate', authenticate, WorkflowController.generateSingleAsset);
router.post('/:projectId/generate-asset/:assetId', authenticate, WorkflowController.regenerateAsset);
router.put('/:projectId/assets/:assetId', authenticate, WorkflowController.updateAsset);
router.post('/:projectId/generate-asset-audio/:assetId', authenticate, WorkflowController.generateAssetAudioEndpoint);

// Stage 3: Storyboard Generation
router.post('/:projectId/generate-storyboards', authenticate, WorkflowController.generateStoryboards);
router.get('/:projectId/storyboards', authenticate, WorkflowController.getStoryboards);

// Stage 4: Keyframe Generation
router.post('/:projectId/generate-keyframes', authenticate, WorkflowController.generateKeyframesEndpoint);

// Stage 5: Video Generation
router.post('/:projectId/generate-video', authenticate, WorkflowController.generateVideo);
router.get('/:projectId/video-status', authenticate, WorkflowController.getVideoStatus);

// Control
router.post('/:projectId/reset', authenticate, WorkflowController.reset);
router.post('/:projectId/run-all', authenticate, WorkflowController.runAll);
router.post('/:projectId/retry-failed', authenticate, WorkflowController.retryFailed);

// ==================== Episode Workflow Routes ====================

// Status
episodeRouter.get('/:episodeId/workflow/status', authenticate, EpisodeWorkflowController.getStatus);

// Stage 1: Script Analysis + Review
episodeRouter.post('/:episodeId/workflow/analyze', authenticate, EpisodeWorkflowController.analyze);
episodeRouter.post('/:episodeId/workflow/review-script', authenticate, EpisodeWorkflowController.reviewScript);
episodeRouter.post('/:episodeId/workflow/apply-review', authenticate, EpisodeWorkflowController.applyReview);
episodeRouter.post('/:episodeId/workflow/revise-script', authenticate, EpisodeWorkflowController.reviseScript);
episodeRouter.post('/:episodeId/workflow/approve-script', authenticate, EpisodeWorkflowController.approveScript);
episodeRouter.post('/:episodeId/workflow/back-to-review', authenticate, EpisodeWorkflowController.backToReview);

// Style Selection
episodeRouter.post('/:episodeId/workflow/suggest-styles', authenticate, EpisodeWorkflowController.suggestStyles);
episodeRouter.put('/:episodeId/workflow/style', authenticate, EpisodeWorkflowController.setStyle);

// Stage 2: Asset Generation
episodeRouter.post('/:episodeId/workflow/create-assets', authenticate, EpisodeWorkflowController.createAssets);
episodeRouter.post('/:episodeId/workflow/recreate-assets', authenticate, EpisodeWorkflowController.recreateAssets);
episodeRouter.post('/:episodeId/workflow/generate-assets', authenticate, EpisodeWorkflowController.generateAssets);
episodeRouter.get('/:episodeId/workflow/assets', authenticate, EpisodeWorkflowController.getAssets);
episodeRouter.post('/:episodeId/workflow/assets/:assetId/generate', authenticate, EpisodeWorkflowController.generateSingleAsset);
episodeRouter.post('/:episodeId/workflow/assets/:assetId/regenerate', authenticate, EpisodeWorkflowController.regenerateAsset);

// Stage 3: Storyboard Generation
episodeRouter.post('/:episodeId/workflow/generate-storyboards', authenticate, EpisodeWorkflowController.generateStoryboards);
episodeRouter.get('/:episodeId/workflow/storyboards', authenticate, EpisodeWorkflowController.getStoryboards);

// Stage 4: Keyframe Generation
episodeRouter.post('/:episodeId/workflow/create-keyframe-cards', authenticate, EpisodeWorkflowController.createKeyframeCards);
episodeRouter.post('/:episodeId/workflow/keyframes/:assetId/generate', authenticate, EpisodeWorkflowController.generateSingleKeyframe);
episodeRouter.post('/:episodeId/workflow/keyframes/:assetId/regenerate', authenticate, EpisodeWorkflowController.regenerateKeyframe);
episodeRouter.post('/:episodeId/workflow/generate-keyframes', authenticate, EpisodeWorkflowController.generateKeyframesEndpoint);

// Stage 5: Video Generation
episodeRouter.post('/:episodeId/workflow/create-video-clips', authenticate, EpisodeWorkflowController.createVideoClips);
episodeRouter.post('/:episodeId/workflow/video-clips/:assetId/generate', authenticate, EpisodeWorkflowController.generateSingleVideoClip);
episodeRouter.post('/:episodeId/workflow/merge-video-clips', authenticate, EpisodeWorkflowController.mergeVideoClips);
episodeRouter.get('/:episodeId/workflow/video-status', authenticate, EpisodeWorkflowController.getVideoStatus);
episodeRouter.get('/:episodeId/workflow/videos', authenticate, EpisodeWorkflowController.getVideos);

// Control
episodeRouter.post('/:episodeId/workflow/reset', authenticate, EpisodeWorkflowController.reset);
episodeRouter.post('/:episodeId/workflow/retry-failed', authenticate, EpisodeWorkflowController.retryFailed);

export default router;
export { episodeRouter };
