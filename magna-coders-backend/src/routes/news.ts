import express, { Router, Request, Response } from 'express';
import { fetchTechNews, previewTechNews } from '../controllers/news';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticateToken } from '../middleware/auth';
import newsScheduler from '../services/news/newsScheduler';

const router: Router = express.Router();

// Public test endpoint (temporary - for development only)
router.post('/test-fetch', asyncHandler(async (req: Request, res: Response) => {
  try {
    console.log('🔄 Manual news fetch triggered via /test-fetch endpoint');
    await newsScheduler.runNow();
    res.status(200).json({ 
      success: true,
      message: 'Tech news fetched and posted successfully as magnanews user',
      note: 'Check your feed at http://localhost:3000/feed and click the Tech News filter'
    });
  } catch (error: any) {
    console.error('Error in test-fetch:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch tech news', 
      error: error.message 
    });
  }
}));

// Protected routes
router.use(authenticateToken);

/**
 * @swagger
 * /api/news/fetch:
 *   post:
 *     summary: Manually fetch and post tech news to feed
 *     tags: [News]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of articles to post (default 5)
 *     responses:
 *       200:
 *         description: News fetched and posted successfully
 */
router.post('/fetch', asyncHandler(fetchTechNews));

/**
 * @swagger
 * /api/news/preview:
 *   get:
 *     summary: Preview aggregated tech news without posting
 *     tags: [News]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of articles to preview (default 10)
 *     responses:
 *       200:
 *         description: News articles preview
 */
router.get('/preview', asyncHandler(previewTechNews));

export default router;
