import express, { Router } from 'express';
import { ProjectsAgent } from '../../AI-assistant/projects-agent/agent';

const router: Router = express.Router();
const agent = new ProjectsAgent();

// API endpoint to manage user projects
router.get('/projects', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    const projects = await agent.getProjects(userId);
    res.json({ projects });
  } catch (error) {
    res.status(500).json({ error: 'Projects fetch failed' });
  }
});

router.post('/projects', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    const data = req.body;
    const project = await agent.createProject(userId, data);
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: 'Project creation failed' });
  }
});

export default router;