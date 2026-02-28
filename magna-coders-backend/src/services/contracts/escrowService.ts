import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import {
  EscrowTransactionType,
  EscrowTransactionStatus,
  EscrowAccountStatus,
  ContractStatus,
  FundEscrowInput
} from '../../types/contracts';
import { PlatformFeeService } from '../coins/platformFeeService';

const prisma = new PrismaClient();
const PLATFORM_FEE_PERCENTAGE = 5;

export class EscrowService {
  async fundEscrow(contractId: string, userId: string, input: FundEscrowInput) {
    const contract = await prisma.contracts.findUnique({
      where: { id: contractId }
    });

    if (!contract || contract.client_id !== userId) {
      throw new Error('Contract not found or unauthorized');
    }

    if (contract.status !== ContractStatus.ACTIVE_UNFUNDED && contract.status !== ContractStatus.ACTIVE_FUNDED) {
      throw new Error('Contract must be active to fund escrow');
    }

    if (input.idempotency_key) {
      const existing = await prisma.escrow_transactions.findUnique({
        where: { idempotency_key: input.idempotency_key }
      });
      if (existing) {
        return { transaction: existing, idempotent: true };
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      let escrowAccount = await tx.escrow_accounts.findUnique({
        where: { contract_id: contractId }
      });

      if (!escrowAccount) {
        escrowAccount = await tx.escrow_accounts.create({
          data: {
            contract_id: contractId,
            funded_total: 0,
            released_total: 0,
            refunded_total: 0,
            status: EscrowAccountStatus.EMPTY
          }
        });
      }

      const transaction = await tx.escrow_transactions.create({
        data: {
          id: uuidv4(),
          contract_id: contractId,
          type: EscrowTransactionType.FUND,
          amount: input.amount,
          from_id: userId,
          provider_reference: input.provider_reference,
          status: EscrowTransactionStatus.PENDING,
          idempotency_key: input.idempotency_key
        }
      });

      return { escrowAccount, transaction };
    });

    await this.logActivity(contractId, userId, 'ESCROW_FUND_INITIATED', { amount: input.amount });
    return result;
  }

  async confirmFunding(transactionId: string, providerReference: string, status: 'SUCCESS' | 'FAILED') {
    const transaction = await prisma.escrow_transactions.findUnique({
      where: { id: transactionId }
    });

    if (!transaction || transaction.type !== EscrowTransactionType.FUND) {
      throw new Error('Transaction not found or invalid type');
    }

    if (transaction.status !== EscrowTransactionStatus.PENDING) {
      throw new Error('Transaction already processed');
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedTransaction = await tx.escrow_transactions.update({
        where: { id: transactionId },
        data: {
          status: status === 'SUCCESS' ? EscrowTransactionStatus.SUCCESS : EscrowTransactionStatus.FAILED,
          provider_reference: providerReference
        }
      });

      if (status === 'SUCCESS') {
        const escrowAccount = await tx.escrow_accounts.findUnique({
          where: { contract_id: transaction.contract_id }
        });

        if (escrowAccount) {
          const newFundedTotal = Number(escrowAccount.funded_total) + Number(transaction.amount);
          const contract = await tx.contracts.findUnique({
            where: { id: transaction.contract_id }
          });

          let newEscrowStatus = EscrowAccountStatus.PARTIALLY_FUNDED;
          if (contract && newFundedTotal >= Number(contract.total_amount)) {
            newEscrowStatus = EscrowAccountStatus.FULLY_FUNDED;
          }

          await tx.escrow_accounts.update({
            where: { contract_id: transaction.contract_id },
            data: {
              funded_total: newFundedTotal,
              status: newEscrowStatus
            }
          });

          if (contract && contract.status === ContractStatus.ACTIVE_UNFUNDED) {
            await tx.contracts.update({
              where: { id: transaction.contract_id },
              data: { status: ContractStatus.ACTIVE_FUNDED }
            });
          }
        }
      }

      return updatedTransaction;
    });

    await this.logActivity(transaction.contract_id, null, 'ESCROW_FUND_CONFIRMED', {
      transaction_id: transactionId,
      status
    });

    return result;
  }

  async releaseMilestone(milestoneId: string, userId: string) {
    const milestone = await prisma.milestones.findUnique({
      where: { id: milestoneId },
      include: { contracts: true }
    });

    if (!milestone) {
      throw new Error('Milestone not found');
    }

    if (milestone.contracts.client_id !== userId) {
      throw new Error('Unauthorized');
    }

    if (milestone.status !== 'APPROVED') {
      throw new Error('Milestone must be approved before release');
    }

    const escrow = await prisma.escrow_accounts.findUnique({
      where: { contract_id: milestone.contract_id }
    });

    if (!escrow) {
      throw new Error('Escrow account not found');
    }

    const availableBalance = Number(escrow.funded_total) - Number(escrow.released_total) - Number(escrow.refunded_total);
    if (availableBalance < Number(milestone.amount)) {
      throw new Error('Insufficient escrow balance');
    }

    const { fee, net } = await PlatformFeeService.calculateFee(Number(milestone.amount));

    const result = await prisma.$transaction(async (tx) => {
      const transaction = await tx.escrow_transactions.create({
        data: {
          id: uuidv4(),
          contract_id: milestone.contract_id,
          type: EscrowTransactionType.RELEASE,
          amount: milestone.amount,
          from_id: milestone.contracts.client_id,
          to_id: milestone.contracts.developer_id,
          status: EscrowTransactionStatus.SUCCESS
        }
      });

      await tx.escrow_accounts.update({
        where: { contract_id: milestone.contract_id },
        data: {
          released_total: Number(escrow.released_total) + Number(milestone.amount)
        }
      });

      await tx.platform_fees.create({
        data: {
          id: uuidv4(),
          contract_id: milestone.contract_id,
          amount: fee,
          percentage: PLATFORM_FEE_PERCENTAGE
        }
      });

      if (milestone.contracts.developer_id) {
        const existingWallet = await tx.coin_wallets.findUnique({
          where: { user_id: milestone.contracts.developer_id }
        });

        if (existingWallet) {
          await tx.coin_wallets.update({
            where: { user_id: milestone.contracts.developer_id },
            data: { balance: { increment: net } }
          });
        } else {
          await tx.coin_wallets.create({
            data: {
              id: uuidv4(),
              user_id: milestone.contracts.developer_id,
              balance: net,
              max_capacity: 10000,
              status: 'ACTIVE'
            }
          });
        }

        await tx.coin_transactions.create({
          data: {
            id: uuidv4(),
            user_id: milestone.contracts.developer_id,
            type: 'EARNING',
            amount: net,
            direction: 'IN',
            status: 'COMPLETED',
            reference_id: milestoneId,
            description: `Payment for milestone: ${milestone.title}`
          }
        });
      }

      await tx.milestones.update({
        where: { id: milestoneId },
        data: { status: 'RELEASED' }
      });

      return transaction;
    });

    await this.logActivity(milestone.contract_id, userId, 'MILESTONE_RELEASED', {
      milestone_id: milestoneId,
      amount: milestone.amount.toString(),
      platform_fee: fee,
      net_amount: net
    });

    return result;
  }

  async getEscrowStatus(contractId: string, userId: string) {
    const contract = await prisma.contracts.findUnique({
      where: { id: contractId }
    });

    if (!contract) {
      throw new Error('Contract not found');
    }

    if (contract.client_id !== userId && contract.developer_id !== userId) {
      throw new Error('Unauthorized');
    }

    const escrow = await prisma.escrow_accounts.findUnique({
      where: { contract_id: contractId },
      include: {
        contracts: {
          include: {
            escrow_transactions: {
              orderBy: { created_at: 'desc' }
            }
          }
        }
      }
    });

    if (!escrow) {
      return {
        funded_total: 0,
        released_total: 0,
        refunded_total: 0,
        available_balance: 0,
        status: EscrowAccountStatus.EMPTY,
        transactions: []
      };
    }

    return {
      funded_total: Number(escrow.funded_total),
      released_total: Number(escrow.released_total),
      refunded_total: Number(escrow.refunded_total),
      available_balance: Number(escrow.funded_total) - Number(escrow.released_total) - Number(escrow.refunded_total),
      status: escrow.status,
      transactions: escrow.contracts.escrow_transactions
    };
  }

  private async logActivity(contractId: string, actorId: string | null, actionType: string, payload: any) {
    await prisma.activity_logs.create({
      data: {
        id: uuidv4(),
        contract_id: contractId,
        actor_id: actorId,
        action_type: actionType,
        payload
      }
    });
  }
}

export default new EscrowService();
