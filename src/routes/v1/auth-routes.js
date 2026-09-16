import { Router } from 'express';

import { authenticate } from '../../middleware/authenticate.js';
import { requireAdmin, requireUser } from '../../middleware/require-role.js';
import {
  me,
  logout,
  adminLogin,
  lineCallback,
  lineAuthorize,
  adminLoginRateLimit
} from '../../controllers/auth-controller.js';

const router = Router();

router.post('/admin/login', adminLoginRateLimit, adminLogin);
router.get('/line', lineAuthorize);
router.get('/line/callback', lineCallback);
router.get('/me/admin', authenticate, requireAdmin, me);
router.get('/me/user', authenticate, requireUser, me);
router.get('/me', authenticate, me);
router.post('/logout/admin', authenticate, requireAdmin, logout);
router.post('/logout/user', authenticate, requireUser, logout);
router.post('/logout', authenticate, logout);

export default router;
