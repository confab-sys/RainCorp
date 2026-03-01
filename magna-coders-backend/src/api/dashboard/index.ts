import express, { Router } from 'express';
import { DashboardAgent } from '../../AI-assistant/dashboard-agent/agent';

const router: Router = express.Router();
const agent = new DashboardAgent();

// API endpoint to manage user dashboard and track projects
router.get('/dashboard', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    const data = await agent.getDashboardData(userId);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Dashboard fetch failed' });
  }
});

router.get('/projects/track', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    const data = await agent.trackProjects(userId);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Project tracking failed' });
  }
});

export default router;