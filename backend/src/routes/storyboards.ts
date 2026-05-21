import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createStoryboardSchema, updateStoryboardSchema, addDialogueSchema } from '../validators/storyboard';
import { StoryboardController } from '../controllers/storyboard';

const router = Router();

router.get('/scene/:sceneId', authenticate, StoryboardController.listByScene);
router.get('/:id', authenticate, StoryboardController.getById);
router.post('/', authenticate, validate(createStoryboardSchema), StoryboardController.create);
router.put('/:id', authenticate, validate(updateStoryboardSchema), StoryboardController.update);
router.delete('/:id', authenticate, StoryboardController.delete);

// dialogue sub-routes
router.post('/:id/dialogues', authenticate, validate(addDialogueSchema), StoryboardController.addDialogue);
router.put('/dialogues/:id', authenticate, StoryboardController.updateDialogue);
router.delete('/dialogues/:id', authenticate, StoryboardController.deleteDialogue);

// reorder
router.put('/reorder/:sceneId', authenticate, StoryboardController.reorder);

export default router;
