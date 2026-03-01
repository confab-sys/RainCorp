import express, { Router } from 'express';
import { UserValidationAgent } from '../../AI-assistant/user-validation-agent/agent';

const router: Router = express.Router();
const agent = new UserValidationAgent();

// API endpoint to check user validation
router.get('/validate', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    const isValid = await agent.validateUser(userId);
    res.json({ valid: isValid });
  } catch (error) {
    res.status(500).json({ error: 'Validation failed' });
  }
});

export default router;