import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { CharacterAssetController } from '../controllers/character-asset';

const router = Router();

router.get('/:characterId/expressions', authenticate, CharacterAssetController.listExpressions);
router.post('/:characterId/expressions', authenticate, CharacterAssetController.addExpression);
router.delete('/expressions/:id', authenticate, CharacterAssetController.deleteExpression);

router.get('/:characterId/actions', authenticate, CharacterAssetController.listActions);
router.post('/:characterId/actions', authenticate, CharacterAssetController.addAction);
router.delete('/actions/:id', authenticate, CharacterAssetController.deleteAction);

export default router;
