import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth';
import { PlatformFeeService, AdminService } from '../services/coins';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticateToken);

// Dashboard statistics
router.get('/dashboard/stats', async (req, res) => {
  try {
    const [
      totalContracts,
      activeContracts,
      totalUsers,
      totalDevelopers,
      totalClients,
      platformFeesTotal,
      pendingDisputes,
      totalEscrowBalance,
      totalReleasedFunds,
    ] = await Promise.all([
      prisma.contracts.count(),
      prisma.contracts.count({
        where: { status: { in: ['ACTIVE_FUNDED', 'ACTIVE_UNFUNDED'] } },
      }),
      prisma.users.count(),
      prisma.contracts.count({ where: { developer_id: { not: '' } } }),
      prisma.contracts.count({ where: { client_id: { not: '' } } }),
      PlatformFeeService.getTotalPlatformFees(),
      prisma.disputes.count({ where: { status: 'OPEN' } }),
      prisma.escrow_accounts.aggregate({
        _sum: { funded_total: true, released_total: true, refunded_total: true },
      }),
      prisma.escrow_transactions.aggregate({
        where: { type: 'RELEASE', status: 'SUCCESS' },
        _sum: { amount: true },
      }),
    ]);

    const escrowBalance = Number(totalEscrowBalance._sum.funded_total || 0) -
      Number(totalEscrowBalance._sum.released_total || 0) -
      Number(totalEscrowBalance._sum.refunded_total || 0);

    res.json({
      contracts: {
        total: totalContracts,
        active: activeContracts,
      },
      users: {
        total: totalUsers,
        developers: totalDevelopers,
        clients: totalClients,
      },
      finances: {
        platform_fees_total: platformFeesTotal,
        escrow_balance: escrowBalance,
        total_released: Number(totalReleasedFunds._sum.amount || 0),
      },
      disputes: {
        pending: pendingDisputes,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get stats';
    res.status(500).json({ error: message });
  }
});

// Revenue analytics
router.get('/dashboard/revenue', async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    const stats = await PlatformFeeService.getPlatformFeesStats(
      start_date ? new Date(start_date as string) : undefined,
      end_date ? new Date(end_date as string) : undefined
    );

    const transactions = await prisma.escrow_transactions.aggregate({
      where: {
        type: 'RELEASE',
        status: 'SUCCESS',
        ...(start_date || end_date
          ? {
              created_at: {
                ...(start_date ? { gte: new Date(start_date as string) } : {}),
                ...(end_date ? { lte: new Date(end_date as string) } : {}),
              },
            }
          : {}),
      },
      _sum: { amount: true },
      _count: true,
    });

    res.json({
      platform_fees: stats,
      releases: {
        total: Number(transactions._sum.amount || 0),
        count: transactions._count,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get revenue';
    res.status(500).json({ error: message });
  }
});

// User management
router.get('/users', async (req, res) => {
  try {
    const { limit = 20, offset = 0, search } = req.query;

    const where = search
      ? {
          OR: [
            { username: { contains: search as string, mode: 'insensitive' as const } },
            { email: { contains: search as string, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      prisma.users.findMany({
        where,
        select: {
          id: true,
          username: true,
          email: true,
          created_at: true,
          availability: true,
          coin_wallets: { select: { balance: true, status: true } },
          contracts_contracts_client_idTousers: { select: { id: true } },
          contracts_contracts_developer_idTousers: { select: { id: true } },
        },
        take: Number(limit),
        skip: Number(offset),
        orderBy: { created_at: 'desc' },
      }),
      prisma.users.count({ where }),
    ]);

    res.json({
      users: users.map((u) => ({
        ...u,
        wallet_balance: u.coin_wallets?.balance?.toNumber() || 0,
        wallet_status: u.coin_wallets?.status || 'NONE',
        contracts_as_client: u.contracts_contracts_client_idTousers.length,
        contracts_as_developer: u.contracts_contracts_developer_idTousers.length,
      })),
      total,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get users';
    res.status(500).json({ error: message });
  }
});

// Dispute management
router.get('/disputes', async (req, res) => {
  try {
    const { status, limit = 20, offset = 0 } = req.query;

    const where = status ? { status: status as string } : {};

    const [disputes, total] = await Promise.all([
      prisma.disputes.findMany({
        where,
        include: {
          contracts: {
            select: {
              id: true,
              title: true,
              users_contracts_client_idTousers: { select: { id: true, username: true, email: true } },
              users_contracts_developer_idTousers: { select: { id: true, username: true, email: true } },
            },
          },
          milestones: { select: { id: true, title: true } },
        },
        take: Number(limit),
        skip: Number(offset),
        orderBy: { created_at: 'desc' },
      }),
      prisma.disputes.count({ where }),
    ]);

    res.json({ disputes, total });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get disputes';
    res.status(500).json({ error: message });
  }
});

// Admin actions log
router.get('/actions', async (req, res) => {
  try {
    const { action_type, limit = 50, offset = 0 } = req.query;

    const result = await AdminService.getAdminActions({
      action_type: action_type as string,
      limit: Number(limit),
      offset: Number(offset),
    });

    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get actions';
    res.status(500).json({ error: message });
  }
});

// Coin orders management
router.get('/coin-orders', async (req, res) => {
  try {
    const { status, limit = 20, offset = 0 } = req.query;

    const where = status ? { status: status as string } : {};

    const [orders, total] = await Promise.all([
      prisma.coin_orders.findMany({
        where,
        include: {
          users: { select: { id: true, username: true, email: true } },
        },
        take: Number(limit),
        skip: Number(offset),
        orderBy: { created_at: 'desc' },
      }),
      prisma.coin_orders.count({ where }),
    ]);

    res.json({ orders, total });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get orders';
    res.status(500).json({ error: message });
  }
});

// Escrow overview
router.get('/escrow', async (req, res) => {
  try {
    const escrowAccounts = await prisma.escrow_accounts.findMany({
      include: {
        contracts: {
          select: {
            id: true,
            title: true,
            users_contracts_client_idTousers: { select: { id: true, username: true } },
            users_contracts_developer_idTousers: { select: { id: true, username: true } },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    const summary = {
      total_funded: 0,
      total_released: 0,
      total_refunded: 0,
      available_balance: 0,
    };

    const accounts = escrowAccounts.map((e) => {
      const funded = Number(e.funded_total);
      const released = Number(e.released_total);
      const refunded = Number(e.refunded_total);
      const available = funded - released - refunded;

      summary.total_funded += funded;
      summary.total_released += released;
      summary.total_refunded += refunded;
      summary.available_balance += available;

      return {
        contract_id: e.contract_id,
        contract_title: e.contracts.title,
        client: e.contracts.users_contracts_client_idTousers?.username || 'N/A',
        developer: e.contracts.users_contracts_developer_idTousers?.username || 'N/A',
        funded,
        released,
        refunded,
        available,
        status: e.status,
      };
    });

    res.json({ summary, accounts });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get escrow';
    res.status(500).json({ error: message });
  }
});

export default router;