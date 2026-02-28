import express, { Router, Request, Response } from 'express';
import {
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  getUserFeed,
  searchUsers,
} from '../controllers/social';
import { 
  getNotifications, 
  deleteNotification, 
  markAsRead, 
  markAllAsRead 
} from '../controllers/notifications';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticateToken } from '../middleware/auth';

const router: Router = express.Router();

// Public routes
/**
 * @swagger
 * /api/social/search:
 *   get:
 *     summary: Search users by query
 *     tags: [Social]
 *     parameters:
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         required: true
 *         description: Search string for username or email
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *     responses:
 *       200:
 *         description: List of matching users
 */
router.get('/search', asyncHandler(searchUsers));

// Protected routes
router.use(authenticateToken);

/**
 * @swagger
 * /api/social/follow/{targetUserId}:
 *   post:
 *     summary: Follow a user
 *     tags: [Social]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: targetUserId
 *         schema:
 *           type: string
 *         required: true
 *         description: Target user ID to follow
 *     responses:
 *       200:
 *         description: Followed successfully
 */
router.post('/follow/:targetUserId', asyncHandler(followUser));

/**
 * @swagger
 * /api/social/follow/{targetUserId}:
 *   delete:
 *     summary: Unfollow a user
 *     tags: [Social]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: targetUserId
 *         schema:
 *           type: string
 *         required: true
 *         description: Target user ID to unfollow
 *     responses:
 *       200:
 *         description: Unfollowed successfully
 */
router.delete('/follow/:targetUserId', asyncHandler(unfollowUser));

/**
 * @swagger
 * /api/social/followers/{userId}:
 *   get:
 *     summary: Get followers for a user
 *     tags: [Social]
 *     parameters:
 *       - in: path
 *         name: userId
 *         schema:
 *           type: string
 *         required: true
 *         description: User ID to fetch followers for
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *     responses:
 *       200:
 *         description: List of followers
 */
router.get('/followers/:userId', asyncHandler(getFollowers));

/**
 * @swagger
 * /api/social/following/{userId}:
 *   get:
 *     summary: Get users followed by a user
 *     tags: [Social]
 *     parameters:
 *       - in: path
 *         name: userId
 *         schema:
 *           type: string
 *         required: true
 *         description: User ID to fetch following list for
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *     responses:
 *       200:
 *         description: List of following users
 */
router.get('/following/:userId', asyncHandler(getFollowing));

/**
 * @swagger
 * /api/social/feed:
 *   get:
 *     summary: Get current user's feed (posts from followed users)
 *     tags: [Social]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *     responses:
 *       200:
 *         description: Feed posts
 */
router.get('/feed', asyncHandler(getUserFeed));

/**
 * @swagger
 * /api/social/notifications:
 *   get:
 *     summary: Get notifications for current user
 *     tags: [Social, Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *     responses:
 *       200:
 *         description: User notifications
 */
router.get('/notifications', asyncHandler(getNotifications));

/**
 * @swagger
 * /api/social/notifications/unread:
 *   get:
 *     summary: Get unread notification count for current user
 *     tags: [Social, Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unread notification count
 */
router.get('/notifications/unread', asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({ count: 0 });
}));

/**
 * @swagger
 * /api/social/notifications/{notificationId}/read:
 *   patch:
 *     summary: Mark a notification as read
 *     tags: [Social, Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         schema:
 *           type: string
 *         required: true
 *         description: Notification ID
 *     responses:
 *       200:
 *         description: Notification marked as read
 */
router.patch('/notifications/:notificationId/read', asyncHandler(markAsRead));

/**
 * @swagger
 * /api/social/notifications/read-all:
 *   patch:
 *     summary: Mark all notifications as read
 *     tags: [Social, Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 */
router.patch('/notifications/read-all', asyncHandler(markAllAsRead));

/**
 * @swagger
 * /api/social/notifications/{notificationId}:
 *   delete:
 *     summary: Delete a notification
 *     tags: [Social, Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         schema:
 *           type: string
 *         required: true
 *         description: Notification ID
 *     responses:
 *       200:
 *         description: Notification deleted
 */
router.delete('/notifications/:notificationId', asyncHandler(deleteNotification));

export default router;