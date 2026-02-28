import * as cron from 'node-cron';
import newsAggregator from './newsAggregator';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class NewsScheduler {
  private cronJob: cron.ScheduledTask | null = null;
  private systemUserId: string | null = null;

  /**
   * Initialize the scheduler with a system user ID
   */
  async initialize() {
    // Find the magnanews user for posting news
    let systemUser = await prisma.users.findFirst({
      where: { username: 'magnanews' },
    });

    if (!systemUser) {
      console.log('Creating magnanews user for tech news...');
      const { randomUUID } = await import('crypto');
      systemUser = await prisma.users.create({
        data: {
          id: randomUUID(),
          email: 'magnanews@magna-coders.com',
          username: 'magnanews',
          password_hash: 'N/A', // System user doesn't need password
        },
      });
    }

    this.systemUserId = systemUser.id;
    console.log(`✅ News scheduler initialized with system user: ${systemUser.username}`);
  }

  /**
   * Start the scheduled job
   * Runs every hour by default
   */
  start(cronExpression: string = '0 * * * *') {
    if (!this.systemUserId) {
      console.error('❌ Cannot start scheduler: system user not initialized');
      return;
    }

    if (this.cronJob) {
      console.log('⚠️  News scheduler already running');
      return;
    }

    this.cronJob = cron.schedule(cronExpression, async () => {
      console.log('⏰ Running scheduled tech news fetch...');
      try {
        await newsAggregator.fetchAndPostNews(this.systemUserId!, 5);
      } catch (error: any) {
        console.error('❌ Error in scheduled news fetch:', error.message);
      }
    });

    console.log(`✅ News scheduler started (cron: ${cronExpression})`);
    console.log('   Schedule: Every hour');
  }

  /**
   * Stop the scheduled job
   */
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('🛑 News scheduler stopped');
    }
  }

  /**
   * Run news fetch immediately (manual trigger)
   */
  async runNow() {
    if (!this.systemUserId) {
      throw new Error('System user not initialized');
    }

    console.log('▶️  Running manual tech news fetch...');
    await newsAggregator.fetchAndPostNews(this.systemUserId, 5);
  }
}

export default new NewsScheduler();
