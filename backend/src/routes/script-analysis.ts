import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { ScriptAnalysisController } from '../controllers/script-analysis';

const router = Router();

router.get('/test', (_req, res) => res.json({ message: 'Script analysis route works' }));
router.post('/analyze', authenticate, ScriptAnalysisController.analyze);
router.get('/result/:projectId', authenticate, ScriptAnalysisController.getResult);

export default router;
