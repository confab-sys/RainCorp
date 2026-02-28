import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { DisputeStatus, DisputeResolution, CreateDisputeInput, ResolveDisputeInput } from '../../types/contracts';

const prisma = new PrismaClient();

export class DisputeService {
  async create(input: CreateDisputeInput, openerId: string) {
    const contract = await prisma.contracts.findUnique({
      where: { id: input.contract_id }
    });

    if (!contract) {
      throw new Error('Contract not found');
    }

    if (contract.client_id !== openerId && contract.developer_id !== openerId) {
      throw new Error('Unauthorized');
    }

    if (input.milestone_id) {
      const milestone = await prisma.milestones.findUnique({
        where: { id: input.milestone_id }
      });
      if (!milestone || milestone.contract_id !== input.contract_id) {
        throw new Error('Milestone not found or does not belong to contract');
      }
    }

    const dispute = await prisma.disputes.create({
      data: {
        id: uuidv4(),
        contract_id: input.contract_id,
        milestone_id: input.milestone_id,
        opened_by: openerId,
        reason: input.reason,
        status: DisputeStatus.OPEN
      }
    });

    await prisma.contracts.update({
      where: { id: input.contract_id },
      data: { status: 'PAUSED' }
    });

    await this.logActivity(input.contract_id, openerId, 'DISPUTE_OPENED', {
      dispute_id: dispute.id,
      milestone_id: input.milestone_id
    });

    return dispute;
  }

  async resolve(disputeId: string, input: ResolveDisputeInput) {
    const dispute = await prisma.disputes.findUnique({
      where: { id: disputeId },
      include: { contracts: true }
    });

    if (!dispute) {
      throw new Error('Dispute not found');
    }

    if (dispute.status !== DisputeStatus.OPEN && dispute.status !== DisputeStatus.UNDER_REVIEW) {
      throw new Error('Dispute must be open or under review');
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.disputes.update({
        where: { id: disputeId },
        data: {
          status: DisputeStatus.RESOLVED,
          resolution: input.resolution,
          admin_id: input.admin_id
        }
      });

      switch (input.resolution) {
        case DisputeResolution.RELEASE:
          if (dispute.milestone_id) {
            await tx.milestones.update({
              where: { id: dispute.milestone_id },
              data: { status: 'APPROVED' }
            });
          }
          await tx.contracts.update({
            where: { id: dispute.contract_id },
            data: { status: 'ACTIVE_FUNDED' }
          });
          break;

        case DisputeResolution.REFUND: {
          const escrow = await tx.escrow_accounts.findUnique({
            where: { contract_id: dispute.contract_id }
          });
          if (escrow) {
            await tx.escrow_accounts.update({
              where: { contract_id: dispute.contract_id },
              data: {
                refunded_total: escrow.funded_total,
                status: 'REFUNDED'
              }
            });
          }
          await tx.contracts.update({
            where: { id: dispute.contract_id },
            data: { status: 'CANCELLED' }
          });
          break;
        }

        case DisputeResolution.CANCEL_CONTRACT:
          await tx.contracts.update({
            where: { id: dispute.contract_id },
            data: { status: 'TERMINATED' }
          });
          break;

        case DisputeResolution.SPLIT:
          await tx.contracts.update({
            where: { id: dispute.contract_id },
            data: { status: 'ACTIVE_FUNDED' }
          });
          break;
      }

      return updated;
    });

    await this.logActivity(dispute.contract_id, input.admin_id, 'DISPUTE_RESOLVED', {
      dispute_id: disputeId,
      resolution: input.resolution
    });

    return result;
  }

  async getByContract(contractId: string, userId: string) {
    const contract = await prisma.contracts.findUnique({
      where: { id: contractId }
    });

    if (!contract) {
      throw new Error('Contract not found');
    }

    if (contract.client_id !== userId && contract.developer_id !== userId) {
      throw new Error('Unauthorized');
    }

    return prisma.disputes.findMany({
      where: { contract_id: contractId },
      orderBy: { created_at: 'desc' },
      include: {
        users: { select: { id: true, username: true } },
        milestones: { select: { id: true, title: true } }
      }
    });
  }

  async getById(disputeId: string, userId: string) {
    const dispute = await prisma.disputes.findUnique({
      where: { id: disputeId },
      include: {
        contracts: true,
        users: { select: { id: true, username: true } },
        milestones: { select: { id: true, title: true } }
      }
    });

    if (!dispute) {
      throw new Error('Dispute not found');
    }

    if (dispute.contracts.client_id !== userId && dispute.contracts.developer_id !== userId) {
      throw new Error('Unauthorized');
    }

    return dispute;
  }

  async setUnderReview(disputeId: string, adminId: string) {
    const dispute = await prisma.disputes.findUnique({
      where: { id: disputeId }
    });

    if (!dispute) {
      throw new Error('Dispute not found');
    }

    if (dispute.status !== DisputeStatus.OPEN) {
      throw new Error('Dispute must be open');
    }

    return prisma.disputes.update({
      where: { id: disputeId },
      data: {
        status: DisputeStatus.UNDER_REVIEW,
        admin_id: adminId
      }
    });
  }

  private async logActivity(contractId: string, actorId: string, actionType: string, payload: any) {
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

export default new DisputeService();