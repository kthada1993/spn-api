import { Router } from 'express';

import authRoutes from './auth-routes.js';
import userRoutes from './user-routes.js';
import adminRoutes from './admin-routes.js';
import healthRoutes from './health-routes.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/user', userRoutes);
router.use('/admin', adminRoutes);

export default router;
