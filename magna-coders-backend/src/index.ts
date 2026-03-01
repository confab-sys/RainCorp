import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import apiRoutes from './routes';
import { errorHandler, notFound } from './middleware/errorHandler';
import { swaggerSpec } from './utils/swagger';
import { OTPService } from './services';
import { validateEnv } from './utils/validateEnv';
import newsScheduler from './services/news/newsScheduler';

// Load environment variables
dotenv.config();

// Validate environment variables on startup
validateEnv();

const app: Express = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
// Allow all origins with wildcard and credentials
app.use(cors({ origin: '*', credentials: false }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Swagger documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Magna Coders API Documentation'
}));

// API routes
app.use('/api', apiRoutes);

// Initialize OTP Service and set up periodic cleanup
const otpService = new OTPService();

// Clean up expired OTPs immediately on startup
otpService.cleanupExpiredOTPs();
console.log('🧹 Initial OTP cleanup completed');

// Set up periodic OTP cleanup (every 5 minutes)
const OTP_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds
setInterval(() => {
  try {
    const statsBefore = otpService.getOTPStats();
    otpService.cleanupExpiredOTPs();
    const statsAfter = otpService.getOTPStats();

    const cleaned = statsBefore.total - statsAfter.total;
    if (cleaned > 0) {
      console.log(`🧹 OTP cleanup: Removed ${cleaned} expired OTPs (${statsAfter.active} active remaining)`);
    }
  } catch (error) {
    console.error('❌ Error during OTP cleanup:', error);
  }
}, OTP_CLEANUP_INTERVAL);

console.log(`⏰ OTP cleanup scheduled every ${OTP_CLEANUP_INTERVAL / 1000 / 60} minutes`);

// Initialize and start news scheduler
(async () => {
  try {
    await newsScheduler.initialize();
    // Start scheduler (runs every hour)
    newsScheduler.start('0 * * * *');
    console.log('📰 Tech news scheduler initialized');
  } catch (error) {
    console.error('❌ Failed to initialize news scheduler:', error);
  }
})();

// Legacy health check (for backward compatibility)
app.get('/health', (req, res) => {
  const otpStats = otpService.getOTPStats();
  res.status(200).json({
    status: 'OK',
    message: 'Magna Coders Backend is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    services: {
      otp: {
        active: otpStats.active,
        total: otpStats.total
      }
    }
  });
});

// Error handling middleware (must be last)
app.use(notFound);
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(` Magna Coders API Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`API docs: http://localhost:${PORT}/api`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;