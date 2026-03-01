import { Router } from 'express';

/**
 * @swagger
 * tags:
 *   name: Contracts
 *   description: Contract management, milestones, escrow, reviews, change requests, disputes, and admin actions
 */
import { authenticateToken } from '../middleware/auth';
import {
  createContract,
  sendContract,
  acceptContract,
  declineContract,
  getContract,
  getContracts,
  pauseContract,
  resumeContract,
  createMilestone,
  updateMilestone,
  getMilestones,
  startMilestone,
  submitMilestone,
  getSubmissions,
  fundEscrow,
  fundCallback,
  releaseMilestone,
  getEscrowStatus,
  reviewMilestone,
  getReviews,
  createChangeRequest,
  acceptChangeRequest,
  rejectChangeRequest,
  cancelChangeRequest,
  getChangeRequests,
  createDispute,
  resolveDispute,
  getDisputes,
  getDispute,
  getContractActivity,
  getRecentActivity,
  adminReleaseFunds,
  adminAcceptFunds,
  adminPauseContract,
  adminResumeContract,
  adminCancelContract,
  getAdminContracts
} from '../controllers/contracts';

const router: Router = Router();

router.use(authenticateToken);

// Contract endpoints
/**
 * @swagger
 * /contracts:
 *   post:
 *     summary: Create a new contract
 *     tags: [Contracts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               currency:
 *                 type: string
 *               total_amount:
 *                 type: number
 *               funding_mode:
 *                 type: string
 *               start_at:
 *                 type: string
 *                 format: date-time
 *               terms_version:
 *                 type: string
 *               metadata:
 *                 type: object
 *     responses:
 *       201:
 *         description: Contract created
 *       400:
 *         description: Bad request
 */
router.post('/', createContract);
/**
 * @swagger
 * /contracts/{id}/send:
 *   post:
 *     summary: Send a contract to a developer
 *     tags: [Contracts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               developer_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Contract sent
 *       400:
 *         description: Bad request
 */
router.post('/:id/send', sendContract);
/**
 * @swagger
 * /contracts/{id}/accept:
 *   post:
 *     summary: Accept a contract
 *     tags: [Contracts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Contract accepted
 *       400:
 *         description: Bad request
 */
router.post('/:id/accept', acceptContract);
/**
 * @swagger
 * /contracts/{id}/decline:
 *   post:
 *     summary: Decline a contract
 *     tags: [Contracts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Contract declined
 *       400:
 *         description: Bad request
 */
router.post('/:id/decline', declineContract);
/**
 * @swagger
 * /contracts/{id}:
 *   get:
 *     summary: Get a contract by ID
 *     tags: [Contracts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Contract details
 *       404:
 *         description: Not found
 */
router.get('/:id', getContract);
/**
 * @swagger
 * /contracts:
 *   get:
 *     summary: List contracts for the authenticated user
 *     tags: [Contracts]
 *     parameters:
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *         description: Filter by user role (client or developer)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by contract status
 *     responses:
 *       200:
 *         description: List of contracts
 */
router.get('/', getContracts);
/**
 * @swagger
 * /contracts/{id}/pause:
 *   post:
 *     summary: Pause a contract
 *     tags: [Contracts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Contract paused
 */
router.post('/:id/pause', pauseContract);
/**
 * @swagger
 * /contracts/{id}/resume:
 *   post:
 *     summary: Resume a paused contract
 *     tags: [Contracts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Contract resumed
 */
router.post('/:id/resume', resumeContract);

// Milestone endpoints
router.post('/:id/milestones', createMilestone);
router.patch('/milestones/:id', updateMilestone);
router.get('/:id/milestones', getMilestones);
router.post('/milestones/:id/start', startMilestone);
router.post('/milestones/:id/submissions', submitMilestone);
router.get('/milestones/:id/submissions', getSubmissions);

// Escrow endpoints
router.post('/:id/escrow/fund', fundEscrow);
router.post('/escrow/fund/callback/:transaction_id', fundCallback);
router.post('/milestones/:id/release', releaseMilestone);
router.get('/:id/escrow', getEscrowStatus);

// Review endpoints
router.post('/milestones/:id/review', reviewMilestone);
router.get('/milestones/:id/reviews', getReviews);

// Change request endpoints
router.post('/:id/change-requests', createChangeRequest);
router.post('/change-requests/:id/accept', acceptChangeRequest);
router.post('/change-requests/:id/reject', rejectChangeRequest);
router.post('/change-requests/:id/cancel', cancelChangeRequest);
router.get('/:id/change-requests', getChangeRequests);

// Dispute endpoints
router.post('/:id/disputes', createDispute);
router.post('/disputes/:id/resolve', resolveDispute);
router.get('/:id/disputes', getDisputes);
router.get('/disputes/:id', getDispute);

// Activity log endpoints
router.get('/:id/activity', getContractActivity);
router.get('/activity/recent', getRecentActivity);

// Admin endpoints
router.post('/admin/release-funds', adminReleaseFunds);
router.post('/admin/accept-funds', adminAcceptFunds);
router.post('/admin/:id/pause', adminPauseContract);
router.post('/admin/:id/resume', adminResumeContract);
router.post('/admin/:id/cancel', adminCancelContract);
router.get('/admin/contracts', getAdminContracts);

export default router;