import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { VersionController } from '../controllers/version';

const router = Router();

router.get('/project/:projectId', authenticate, VersionController.listByProject);
router.post('/project/:projectId', authenticate, VersionController.create);
router.get('/:id', authenticate, VersionController.getById);
router.post('/:id/restore', authenticate, VersionController.restore);
router.delete('/:id', authenticate, VersionController.delete);

export default router;
