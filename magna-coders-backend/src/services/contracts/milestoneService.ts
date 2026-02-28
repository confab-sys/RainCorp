import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import {
  MilestoneStatus,
  CreateMilestoneInput,
  UpdateMilestoneInput
} from '../../types/contracts';

const prisma = new PrismaClient();

export class MilestoneService {
  async create(contractId: string, userId: string, input: CreateMilestoneInput) {
    const contract = await prisma.contracts.findUnique({
      where: { id: contractId }
    });

    if (!contract || contract.client_id !== userId) {
      throw new Error('Contract not found or unauthorized');
    }

    if (contract.status === 'COMPLETED' || contract.status === 'CANCELLED' || contract.status === 'TERMINATED') {
      throw new Error('Cannot add milestones to completed/cancelled/terminated contracts');
    }

    const milestone = await prisma.milestones.create({
      data: {
        id: uuidv4(),
        contract_id: contractId,
        title: input.title,
        description: input.description,
        acceptance_criteria: input.acceptance_criteria,
        amount: input.amount,
        due_at: input.due_at,
        order_index: input.order_index || 0,
        status: MilestoneStatus.NOT_STARTED
      }
    });

    await this.logActivity(contractId, userId, 'MILESTONE_CREATED', { milestone_id: milestone.id, title: input.title });
    return milestone;
  }

  async update(milestoneId: string, userId: string, input: UpdateMilestoneInput) {
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

    if (milestone.status !== MilestoneStatus.NOT_STARTED) {
      throw new Error('Can only update milestones that have not started');
    }

    return prisma.milestones.update({
      where: { id: milestoneId },
      data: {
        title: input.title,
        description: input.description,
        acceptance_criteria: input.acceptance_criteria,
        amount: input.amount,
        due_at: input.due_at,
        order_index: input.order_index
      }
    });
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

    return prisma.milestones.findMany({
      where: { contract_id: contractId },
      orderBy: { order_index: 'asc' },
      include: {
        progress_submissions: { orderBy: { created_at: 'desc' } },
        milestone_reviews: { orderBy: { created_at: 'desc' } }
      }
    });
  }

  async startWork(milestoneId: string, developerId: string) {
    const milestone = await prisma.milestones.findUnique({
      where: { id: milestoneId },
      include: { contracts: true }
    });

    if (!milestone) {
      throw new Error('Milestone not found');
    }

    if (milestone.contracts.developer_id !== developerId) {
      throw new Error('Unauthorized');
    }

    const escrow = await prisma.escrow_accounts.findUnique({
      where: { contract_id: milestone.contract_id }
    });

    if (!escrow || escrow.funded_total < milestone.amount) {
      throw new Error('Insufficient escrow funding for this milestone');
    }

    if (milestone.status !== MilestoneStatus.NOT_STARTED) {
      throw new Error('Milestone must be in NOT_STARTED status');
    }

    const updated = await prisma.milestones.update({
      where: { id: milestoneId },
      data: { status: MilestoneStatus.IN_PROGRESS }
    });

    await this.logActivity(milestone.contract_id, developerId, 'MILESTONE_STARTED', { milestone_id: milestoneId });
    return updated;
  }

  async submitForReview(milestoneId: string, developerId: string, summary: string, evidenceItems: any[]) {
    const milestone = await prisma.milestones.findUnique({
      where: { id: milestoneId },
      include: { contracts: true }
    });

    if (!milestone) {
      throw new Error('Milestone not found');
    }

    if (milestone.contracts.developer_id !== developerId) {
      throw new Error('Unauthorized');
    }

    const escrow = await prisma.escrow_accounts.findUnique({
      where: { contract_id: milestone.contract_id }
    });

    if (!escrow || escrow.funded_total < milestone.amount) {
      throw new Error('Cannot submit without sufficient escrow funding');
    }

    if (milestone.status !== MilestoneStatus.IN_PROGRESS && milestone.status !== MilestoneStatus.CHANGES_REQUESTED) {
      throw new Error('Milestone must be in progress or have changes requested');
    }

    const result = await prisma.$transaction(async (tx) => {
      const submission = await tx.progress_submissions.create({
        data: {
          id: uuidv4(),
          contract_id: milestone.contract_id,
          milestone_id: milestoneId,
          submitted_by: developerId,
          summary,
          evidence_items: evidenceItems
        }
      });

      const updatedMilestone = await tx.milestones.update({
        where: { id: milestoneId },
        data: { status: MilestoneStatus.SUBMITTED }
      });

      return { submission, milestone: updatedMilestone };
    });

    await this.logActivity(milestone.contract_id, developerId, 'MILESTONE_SUBMITTED', { milestone_id: milestoneId });
    return result;
  }

  async getSubmissions(milestoneId: string, userId: string) {
    const milestone = await prisma.milestones.findUnique({
      where: { id: milestoneId },
      include: { contracts: true }
    });

    if (!milestone) {
      throw new Error('Milestone not found');
    }

    if (milestone.contracts.client_id !== userId && milestone.contracts.developer_id !== userId) {
      throw new Error('Unauthorized');
    }

    return prisma.progress_submissions.findMany({
      where: { milestone_id: milestoneId },
      orderBy: { created_at: 'desc' }
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

export default new MilestoneService();
