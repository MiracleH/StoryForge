import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { TemplateController } from '../controllers/template';

const router = Router();

router.get('/', authenticate, TemplateController.list);
router.get('/:id', authenticate, TemplateController.getById);
router.post('/', authenticate, TemplateController.create);
router.post('/:id/apply', authenticate, TemplateController.apply);
router.delete('/:id', authenticate, TemplateController.delete);

export default router;
