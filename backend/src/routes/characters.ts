import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createCharacterSchema, updateCharacterSchema } from '../validators/character';
import { CharacterController } from '../controllers/character';

const router = Router();

router.get('/project/:projectId', authenticate, CharacterController.listByProject);
router.get('/:id', authenticate, CharacterController.getById);
router.post('/', authenticate, validate(createCharacterSchema), CharacterController.create);
router.put('/:id', authenticate, validate(updateCharacterSchema), CharacterController.update);
router.delete('/:id', authenticate, CharacterController.delete);

export default router;
