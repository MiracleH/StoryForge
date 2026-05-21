import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createProjectSchema, updateProjectSchema } from '../validators/project';
import { ProjectController } from '../controllers/project';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.txt', '.docx', '.pdf'];
    const ext = '.' + file.originalname.split('.').pop()?.toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('仅支持 txt/docx/pdf 文件'));
  },
});

const router = Router();

router.get('/stats/overview', authenticate, ProjectController.getStats);
router.get('/', authenticate, ProjectController.list);
router.get('/:id', authenticate, ProjectController.getById);
router.post('/', authenticate, upload.single('file'), ProjectController.create);
router.put('/:id', authenticate, validate(updateProjectSchema), ProjectController.update);
router.get('/:id/export', authenticate, ProjectController.exportProject);
router.delete('/:id', authenticate, ProjectController.delete);

export default router;
