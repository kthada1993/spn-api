import { Router } from 'express';

import { ok } from '../../utils/api-response.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireAdmin } from '../../middleware/require-role.js';
import { listAdminUsers, updateAdminUser } from '../../controllers/admin-users-controller.js';
import {
  listAdminHospitals,
  createAdminHospital,
  updateAdminHospital,
  deleteAdminHospitalById,
  listAdminDepartments,
  createAdminDepartment,
  updateAdminDepartment,
  deleteAdminDepartmentById,
} from '../../controllers/admin-settings-controller.js';
import {
  getAdminMonitoringOverview,
  listAdminMonitoringPsqi,
  getAdminMonitoringPsqiDetail,
  listAdminMonitoringSleepDiary,
  getAdminMonitoringSleepDiaryDetail,
  listAdminMonitoringSmartGoal,
  getAdminMonitoringSmartGoalDetail,
  listAdminMonitoringLearning,
  getAdminMonitoringLearningDetail,
  getAdminMonitoringParticipantOverview,
  listAdminMonitoringActionRequired,
} from '../../controllers/admin-monitoring-controller.js';

const router = Router();

router.get('/dashboard', authenticate, requireAdmin, (req, res) => {
  return ok(res, {
    id: req.auth.id,
    role: req.auth.role,
    display_name: req.auth.displayName,
    username: req.auth.username
  });
});

router.get('/users', authenticate, requireAdmin, listAdminUsers);
router.patch('/users/:userId', authenticate, requireAdmin, updateAdminUser);

router.get('/settings/hospitals', authenticate, requireAdmin, listAdminHospitals);
router.post('/settings/hospitals', authenticate, requireAdmin, createAdminHospital);
router.put('/settings/hospitals/:id', authenticate, requireAdmin, updateAdminHospital);
router.delete('/settings/hospitals/:id', authenticate, requireAdmin, deleteAdminHospitalById);

router.get('/settings/departments', authenticate, requireAdmin, listAdminDepartments);
router.post('/settings/departments', authenticate, requireAdmin, createAdminDepartment);
router.put('/settings/departments/:id', authenticate, requireAdmin, updateAdminDepartment);
router.delete('/settings/departments/:id', authenticate, requireAdmin, deleteAdminDepartmentById);

router.get('/monitoring/overview', authenticate, requireAdmin, getAdminMonitoringOverview);
router.get('/monitoring/psqi', authenticate, requireAdmin, listAdminMonitoringPsqi);
router.get('/monitoring/psqi/:userId', authenticate, requireAdmin, getAdminMonitoringPsqiDetail);
router.get('/monitoring/sleep-diary', authenticate, requireAdmin, listAdminMonitoringSleepDiary);
router.get('/monitoring/sleep-diary/:userId', authenticate, requireAdmin, getAdminMonitoringSleepDiaryDetail);
router.get('/monitoring/smart-goal', authenticate, requireAdmin, listAdminMonitoringSmartGoal);
router.get('/monitoring/smart-goal/:userId', authenticate, requireAdmin, getAdminMonitoringSmartGoalDetail);
router.get('/monitoring/learning', authenticate, requireAdmin, listAdminMonitoringLearning);
router.get('/monitoring/learning/:userId', authenticate, requireAdmin, getAdminMonitoringLearningDetail);
router.get('/monitoring/participant/:userId', authenticate, requireAdmin, getAdminMonitoringParticipantOverview);
router.get('/monitoring/action-required', authenticate, requireAdmin, listAdminMonitoringActionRequired);

export default router;
