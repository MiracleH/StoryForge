import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { ChapterController } from '../controllers/chapter';

const router = Router();

router.get('/project/:projectId', authenticate, ChapterController.listByProject);
router.get('/:id', authenticate, ChapterController.getById);
router.post('/', authenticate, ChapterController.create);
router.put('/:id', authenticate, ChapterController.update);
router.delete('/:id', authenticate, ChapterController.delete);
router.put('/reorder/:projectId', authenticate, ChapterController.reorder);

export default router;
