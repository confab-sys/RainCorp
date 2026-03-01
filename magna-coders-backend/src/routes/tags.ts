import express, { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticateToken } from '../middleware/auth';
import { getAllTags, getPopularTags, createTag, getAllCategories } from '../controllers/tags';

const router: Router = express.Router();

/**
 * @swagger
 * /api/tags:
 *   get:
 *     summary: Get all tags
 *     tags: [Tags]
 *     responses:
 *       200:
 *         description: List of tags
 */
router.get('/', asyncHandler(getAllTags));
/**
 * @swagger
 * /api/tags/popular:
 *   get:
 *     summary: Get popular tags
 *     tags: [Tags]
 *     responses:
 *       200:
 *         description: List of popular tags
 */
router.get('/popular', asyncHandler(getPopularTags));
/**
 * @swagger
 * /api/tags:
 *   post:
 *     summary: Create a new tag
 *     tags: [Tags]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: Tag created
 */
router.post('/', authenticateToken, asyncHandler(createTag));
/**
 * @swagger
 * /api/tags/categories:
 *   get:
 *     summary: Get all tag categories
 *     tags: [Tags]
 *     responses:
 *       200:
 *         description: List of tag categories
 */
router.get('/categories', asyncHandler(getAllCategories));

export default router;
