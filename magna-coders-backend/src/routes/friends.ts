import express, { Router } from 'express';
import {
  sendFriendRequest,
  getPendingRequests,
  acceptFriendRequest,
  rejectFriendRequest,
  getFriends,
  checkFriendshipStatus,
  unfriend
} from '../controllers/friends';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticateToken } from '../middleware/auth';

const router: Router = express.Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * @swagger
 * /api/friends/request:
 *   post:
 *     summary: Send a friend request
 *     tags: [Friends]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - receiverId
 *             properties:
 *               receiverId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Friend request sent successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post('/request', asyncHandler(sendFriendRequest));

/**
 * @swagger
 * /api/friends/requests/pending:
 *   get:
 *     summary: Get pending friend requests
 *     tags: [Friends]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pending requests retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/requests/pending', asyncHandler(getPendingRequests));

/**
 * @swagger
 * /api/friends/request/{requestId}/accept:
 *   post:
 *     summary: Accept a friend request
 *     tags: [Friends]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: Friend request accepted
 *       404:
 *         description: Request not found
 *       401:
 *         description: Unauthorized
 */
router.post('/request/:requestId/accept', asyncHandler(acceptFriendRequest));

/**
 * @swagger
 * /api/friends/request/{requestId}/reject:
 *   post:
 *     summary: Reject a friend request
 *     tags: [Friends]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: Friend request rejected
 *       404:
 *         description: Request not found
 *       401:
 *         description: Unauthorized
 */
router.post('/request/:requestId/reject', asyncHandler(rejectFriendRequest));

/**
 * @swagger
 * /api/friends:
 *   get:
 *     summary: Get friends list
 *     tags: [Friends]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Friends list retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/', asyncHandler(getFriends));

/**
 * @swagger
 * /api/friends/{userId}:
 *   get:
 *     summary: Get friends list for a specific user
 *     tags: [Friends]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         schema:
 *           type: string
 *         required: true
 *         description: UUID of the user
 *     responses:
 *       200:
 *         description: Friends list retrieved successfully
 *       400:
 *         description: Invalid userId format
 *       401:
 *         description: Unauthorized
 */
router.get('/:userId', asyncHandler(getFriends));

/**
 * @swagger
 * /api/friends/status/{targetUserId}:
 *   get:
 *     summary: Check friendship status with another user
 *     tags: [Friends]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: targetUserId
 *         schema:
 *           type: string
 *         required: true
 *         description: UUID of the other user
 *     responses:
 *       200:
 *         description: Friendship status retrieved
 *       400:
 *         description: Invalid user ID format
 *       401:
 *         description: Unauthorized
 */
router.get('/status/:targetUserId', asyncHandler(checkFriendshipStatus));

/**
 * @swagger
 * /api/friends/{friendId}:
 *   delete:
 *     summary: Unfriend a user
 *     tags: [Friends]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: friendId
 *         schema:
 *           type: string
 *         required: true
 *         description: UUID of the friend to remove
 *     responses:
 *       200:
 *         description: Unfriended successfully
 *       400:
 *         description: Invalid friend ID format
 *       401:
 *         description: Unauthorized
 */
router.delete('/:friendId', asyncHandler(unfriend));

export default router;
