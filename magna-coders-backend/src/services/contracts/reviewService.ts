import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { ReviewDecision, MilestoneStatus, CreateMilestoneReviewInput } from '../../types/contracts';

const prisma = new PrismaClient();

export class ReviewService {
  async reviewMilestone(input: CreateMilestoneReviewInput, reviewerId: string) {
    const milestone = await prisma.milestones.findUnique({
      where: { id: input.milestone_id },
      include: { contracts: true }
    });

    if (!milestone) {
      throw new Error('Milestone not found');
    }

    if (milestone.contracts.client_id !== reviewerId) {
      throw new Error('Only the client can review milestones');
    }

    if (milestone.status !== MilestoneStatus.SUBMITTED && milestone.status !== MilestoneStatus.IN_REVIEW) {
      throw new Error('Milestone must be submitted or in review');
    }

    const result = await prisma.$transaction(async (tx) => {
      const review = await tx.milestone_reviews.create({
        data: {
          id: uuidv4(),
          milestone_id: input.milestone_id,
          reviewer_id: reviewerId,
          decision: input.decision,
          reason_code: input.reason_code,
          comments: input.comments
        }
      });

      let newStatus: MilestoneStatus;
      switch (input.decision) {
        case ReviewDecision.APPROVE:
          newStatus = MilestoneStatus.APPROVED;
          break;
        case ReviewDecision.REJECT:
          newStatus = MilestoneStatus.REJECTED;
          break;
        case ReviewDecision.REQUEST_CHANGES:
          newStatus = MilestoneStatus.CHANGES_REQUESTED;
          break;
        default:
          newStatus = MilestoneStatus.IN_REVIEW;
      }

      await tx.milestones.update({
        where: { id: input.milestone_id },
        data: { status: newStatus }
      });

      return review;
    });

    await this.logActivity(milestone.contract_id, reviewerId, 'MILESTONE_REVIEWED', {
      milestone_id: input.milestone_id,
      decision: input.decision
    });

    return result;
  }

  async getReviews(milestoneId: string, userId: string) {
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

    return prisma.milestone_reviews.findMany({
      where: { milestone_id: milestoneId },
      orderBy: { created_at: 'desc' },
      include: {
        users: { select: { id: true, username: true } }
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

export default new ReviewService();