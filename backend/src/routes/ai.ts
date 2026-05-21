import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { AIController } from '../controllers/ai';

const router = Router();

router.get('/config', authenticate, AIController.getConfig);
router.post('/test-text', authenticate, AIController.testText);
router.post('/models', authenticate, AIController.listModels);
router.post('/generate/character-image', authenticate, AIController.generateCharacterImage);
router.post('/generate/scene-image', authenticate, AIController.generateSceneImage);
router.post('/generate/storyboard-image', authenticate, AIController.generateStoryboardImage);
router.post('/generate/expression-image', authenticate, AIController.generateExpressionImage);
router.post('/generate/tts', authenticate, AIController.generateTTS);

export default router;
