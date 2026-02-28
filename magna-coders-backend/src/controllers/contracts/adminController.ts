import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { PlatformFeeService } from '../../services/coins';

const prisma = new PrismaClient();
const PLATFORM_FEE_PERCENTAGE = 5;

export async function adminReleaseFunds(req: Request, res: Response): Promise<void> {
  try {
    const admin_id = req.user;
    if (!admin_id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { contract_id, milestone_id, amount, reason } = req.body;

    if (!contract_id || !milestone_id || !amount) {
      res.status(400).json({ error: 'Contract ID, milestone ID, and amount required' });
      return;
    }

    const contract = await prisma.contracts.findUnique({
      where: { id: contract_id },
      include: { escrow_accounts: true, milestones: { where: { id: milestone_id } } },
    });

    if (!contract) {
      res.status(404).json({ error: 'Contract not found' });
      return;
    }

    if (!contract.escrow_accounts) {
      res.status(400).json({ error: 'Escrow account not found' });
      return;
    }

    const escrow = contract.escrow_accounts;
    const availableFunds = Number(escrow.funded_total) - Number(escrow.released_total);

    if (availableFunds < amount) {
      res.status(400).json({ error: 'Insufficient funds in escrow' });
      return;
    }

    const { fee, net } = await PlatformFeeService.calculateFee(amount);

    await prisma.$transaction(async (tx) => {
      await tx.escrow_accounts.update({
        where: { contract_id },
        data: { released_total: { increment: amount } },
      });

      await tx.escrow_transactions.create({
        data: {
          id: crypto.randomUUID(),
          contract_id,
          type: 'RELEASE',
          amount,
          from_id: contract.client_id,
          to_id: contract.developer_id,
          status: 'SUCCESS',
        },
      });

      await tx.platform_fees.create({
        data: {
          id: crypto.randomUUID(),
          contract_id,
          amount: fee,
          percentage: PLATFORM_FEE_PERCENTAGE,
        },
      });

      if (contract.developer_id) {
        const existingWallet = await tx.coin_wallets.findUnique({
          where: { user_id: contract.developer_id },
        });

        if (existingWallet) {
          await tx.coin_wallets.update({
            where: { user_id: contract.developer_id },
            data: { balance: { increment: net } },
          });
        } else {
          await tx.coin_wallets.create({
            data: {
              id: crypto.randomUUID(),
              user_id: contract.developer_id,
              balance: net,
              max_capacity: 10000,
              status: 'ACTIVE',
            },
          });
        }

        await tx.coin_transactions.create({
          data: {
            id: crypto.randomUUID(),
            user_id: contract.developer_id,
            type: 'EARNING',
            amount: net,
            direction: 'IN',
            status: 'COMPLETED',
            reference_id: milestone_id,
            description: `Admin release: ${reason || 'Payment for milestone'}`,
          },
        });
      }

      await tx.milestones.update({
        where: { id: milestone_id },
        data: { status: 'RELEASED' },
      });

      await tx.activity_logs.create({
        data: {
          id: crypto.randomUUID(),
          contract_id,
          actor_id: admin_id,
          action_type: 'ADMIN_RELEASE',
          payload: { milestone_id, amount, fee, net, reason },
        },
      });

      await tx.admin_actions.create({
        data: {
          id: crypto.randomUUID(),
          admin_id,
          action_type: 'RELEASE_FUNDS',
          target_id: contract_id,
          target_type: 'CONTRACT',
          details: { milestone_id, amount, fee, net, reason },
        },
      });
    });

    res.json({ success: true, message: 'Funds released successfully', fee, net });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to release funds';
    res.status(500).json({ error: message });
  }
}

export async function adminAcceptFunds(req: Request, res: Response): Promise<void> {
  try {
    const admin_id = req.user;
    if (!admin_id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { contract_id, amount, source, payment_reference } = req.body;

    if (!contract_id || !amount || !source || !payment_reference) {
      res.status(400).json({ error: 'Contract ID, amount, source, and payment reference required' });
      return;
    }

    const contract = await prisma.contracts.findUnique({
      where: { id: contract_id },
    });

    if (!contract) {
      res.status(404).json({ error: 'Contract not found' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      const existingEscrow = await tx.escrow_accounts.findUnique({
        where: { contract_id },
      });

      if (existingEscrow) {
        await tx.escrow_accounts.update({
          where: { contract_id },
          data: {
            funded_total: { increment: amount },
            status: 'FUNDED',
          },
        });
      } else {
        await tx.escrow_accounts.create({
          data: {
            contract_id,
            funded_total: amount,
            released_total: 0,
            refunded_total: 0,
            status: 'FUNDED',
          },
        });
      }

      await tx.escrow_transactions.create({
        data: {
          id: crypto.randomUUID(),
          contract_id,
          type: 'FUND',
          amount,
          provider_reference: payment_reference,
          status: 'SUCCESS',
        },
      });

      if (contract.status === 'ACTIVE_UNFUNDED') {
        await tx.contracts.update({
          where: { id: contract_id },
          data: { status: 'ACTIVE_FUNDED' },
        });
      }

      await tx.activity_logs.create({
        data: {
          id: crypto.randomUUID(),
          contract_id,
          actor_id: admin_id,
          action_type: 'ADMIN_ACCEPT_FUND',
          payload: { amount, source, payment_reference },
        },
      });

      await tx.admin_actions.create({
        data: {
          id: crypto.randomUUID(),
          admin_id,
          action_type: 'ACCEPT_FUNDS',
          target_id: contract_id,
          target_type: 'CONTRACT',
          details: { amount, source, payment_reference },
        },
      });
    });

    res.json({ success: true, message: 'Funds accepted successfully' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to accept funds';
    res.status(500).json({ error: message });
  }
}

export async function adminPauseContract(req: Request, res: Response): Promise<void> {
  try {
    const admin_id = req.user;
    if (!admin_id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'Contract ID required' });
      return;
    }

    const contract = await prisma.contracts.findUnique({ where: { id } });
    if (!contract) {
      res.status(404).json({ error: 'Contract not found' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.contracts.update({
        where: { id },
        data: { status: 'PAUSED' },
      });

      await tx.activity_logs.create({
        data: {
          id: crypto.randomUUID(),
          contract_id: id,
          actor_id: admin_id,
          action_type: 'ADMIN_PAUSE',
          payload: {},
        },
      });

      await tx.admin_actions.create({
        data: {
          id: crypto.randomUUID(),
          admin_id,
          action_type: 'PAUSE_CONTRACT',
          target_id: id,
          target_type: 'CONTRACT',
        },
      });
    });

    res.json({ success: true, message: 'Contract paused' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to pause contract';
    res.status(500).json({ error: message });
  }
}

export async function adminResumeContract(req: Request, res: Response): Promise<void> {
  try {
    const admin_id = req.user;
    if (!admin_id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'Contract ID required' });
      return;
    }

    const contract = await prisma.contracts.findUnique({
      where: { id },
      include: { escrow_accounts: true },
    });

    if (!contract) {
      res.status(404).json({ error: 'Contract not found' });
      return;
    }

    const newStatus = contract.escrow_accounts && Number(contract.escrow_accounts.funded_total) > 0
      ? 'ACTIVE_FUNDED'
      : 'ACTIVE_UNFUNDED';

    await prisma.$transaction(async (tx) => {
      await tx.contracts.update({
        where: { id },
        data: { status: newStatus },
      });

      await tx.activity_logs.create({
        data: {
          id: crypto.randomUUID(),
          contract_id: id,
          actor_id: admin_id,
          action_type: 'ADMIN_RESUME',
          payload: { new_status: newStatus },
        },
      });

      await tx.admin_actions.create({
        data: {
          id: crypto.randomUUID(),
          admin_id,
          action_type: 'RESUME_CONTRACT',
          target_id: id,
          target_type: 'CONTRACT',
        },
      });
    });

    res.json({ success: true, message: 'Contract resumed', status: newStatus });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to resume contract';
    res.status(500).json({ error: message });
  }
}

export async function adminCancelContract(req: Request, res: Response): Promise<void> {
  try {
    const admin_id = req.user;
    if (!admin_id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;
    const { reason } = req.body;

    if (!id) {
      res.status(400).json({ error: 'Contract ID required' });
      return;
    }

    const contract = await prisma.contracts.findUnique({
      where: { id },
      include: { escrow_accounts: true },
    });

    if (!contract) {
      res.status(404).json({ error: 'Contract not found' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      if (contract.escrow_accounts) {
        const availableFunds = Number(contract.escrow_accounts.funded_total) -
          Number(contract.escrow_accounts.released_total) -
          Number(contract.escrow_accounts.refunded_total);

        if (availableFunds > 0) {
          await tx.escrow_accounts.update({
            where: { contract_id: id },
            data: { refunded_total: { increment: availableFunds } },
          });

          await tx.escrow_transactions.create({
            data: {
              id: crypto.randomUUID(),
              contract_id: id,
              type: 'REFUND',
              amount: availableFunds,
              status: 'SUCCESS',
            },
          });
        }
      }

      await tx.contracts.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });

      await tx.activity_logs.create({
        data: {
          id: crypto.randomUUID(),
          contract_id: id,
          actor_id: admin_id,
          action_type: 'ADMIN_CANCEL',
          payload: { reason },
        },
      });

      await tx.admin_actions.create({
        data: {
          id: crypto.randomUUID(),
          admin_id,
          action_type: 'CANCEL_CONTRACT',
          target_id: id,
          target_type: 'CONTRACT',
          details: { reason },
        },
      });
    });

    res.json({ success: true, message: 'Contract cancelled' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to cancel contract';
    res.status(500).json({ error: message });
  }
}

export async function getAdminContracts(req: Request, res: Response): Promise<void> {
  try {
    const admin_id = req.user;
    if (!admin_id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { status, limit = 20, offset = 0 } = req.query;

    const where: { status?: string } = {};
    if (status) where.status = status as string;

    const [contracts, total] = await Promise.all([
      prisma.contracts.findMany({
        where,
        include: {
          users_contracts_client_idTousers: { select: { id: true, username: true, email: true } },
          users_contracts_developer_idTousers: { select: { id: true, username: true, email: true } },
          milestones: { select: { id: true, title: true, status: true, amount: true } },
          escrow_accounts: true,
          disputes: { where: { status: 'OPEN' } },
        },
        orderBy: { created_at: 'desc' },
        take: Number(limit),
        skip: Number(offset),
      }),
      prisma.contracts.count({ where }),
    ]);

    res.json({ contracts, total });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get contracts';
    res.status(500).json({ error: message });
  }
}