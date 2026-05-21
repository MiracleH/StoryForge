import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createSceneSchema, updateSceneSchema } from '../validators/scene';
import { SceneController } from '../controllers/scene';

const router = Router();

router.get('/chapter/:chapterId', authenticate, SceneController.listByChapter);
router.get('/:id', authenticate, SceneController.getById);
router.post('/', authenticate, validate(createSceneSchema), SceneController.create);
router.put('/:id', authenticate, validate(updateSceneSchema), SceneController.update);
router.delete('/:id', authenticate, SceneController.delete);
router.put('/reorder/:chapterId', authenticate, SceneController.reorder);

export default router;
