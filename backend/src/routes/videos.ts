import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { VideoController } from '../controllers/video';

const router = Router();

router.get('/ffmpeg-status', authenticate, VideoController.getFFmpegStatus);
router.get('/stats/:projectId', authenticate, VideoController.getStats);
router.get('/project/:projectId', authenticate, VideoController.listByProject);
router.get('/:id', authenticate, VideoController.getById);
router.post('/', authenticate, VideoController.create);
router.put('/:id/status', authenticate, VideoController.updateStatus);
router.delete('/:id', authenticate, VideoController.delete);

export default router;
