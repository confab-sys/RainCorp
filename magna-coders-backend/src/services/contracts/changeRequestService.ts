import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { ChangeRequestStatus, CreateChangeRequestInput } from '../../types/contracts';

const prisma = new PrismaClient();

export class ChangeRequestService {
  async create(input: CreateChangeRequestInput, proposerId: string) {
    const contract = await prisma.contracts.findUnique({
      where: { id: input.contract_id }
    });

    if (!contract) {
      throw new Error('Contract not found');
    }

    if (contract.client_id !== proposerId && contract.developer_id !== proposerId) {
      throw new Error('Unauthorized');
    }

    if (contract.status === 'COMPLETED' || contract.status === 'CANCELLED' || contract.status === 'TERMINATED') {
      throw new Error('Cannot create change requests on completed/cancelled/terminated contracts');
    }

    const changeRequest = await prisma.change_requests.create({
      data: {
        id: uuidv4(),
        contract_id: input.contract_id,
        proposed_by: proposerId,
        type: input.type,
        changes: input.changes,
        status: ChangeRequestStatus.PENDING
      }
    });

    await this.logActivity(input.contract_id, proposerId, 'CHANGE_REQUEST_CREATED', {
      change_request_id: changeRequest.id,
      type: input.type
    });

    return changeRequest;
  }

  async accept(changeRequestId: string, userId: string) {
    const changeRequest = await prisma.change_requests.findUnique({
      where: { id: changeRequestId },
      include: { contracts: true }
    });

    if (!changeRequest) {
      throw new Error('Change request not found');
    }

    if (changeRequest.status !== ChangeRequestStatus.PENDING) {
      throw new Error('Change request must be pending');
    }

    const isClient = changeRequest.contracts.client_id === userId;
    const isDeveloper = changeRequest.contracts.developer_id === userId;
    const isProposer = changeRequest.proposed_by === userId;

    if (!isClient && !isDeveloper) {
      throw new Error('Unauthorized');
    }

    if (isProposer) {
      throw new Error('Cannot accept your own change request');
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.change_requests.update({
        where: { id: changeRequestId },
        data: { status: ChangeRequestStatus.ACCEPTED }
      });

      if (changeRequest.type === 'COST' && changeRequest.changes) {
        const changes = changeRequest.changes as Record<string, any>;
        if (changes.new_total_amount) {
          await tx.contracts.update({
            where: { id: changeRequest.contract_id },
            data: { total_amount: changes.new_total_amount }
          });
        }
      }

      return updated;
    });

    await this.logActivity(changeRequest.contract_id, userId, 'CHANGE_REQUEST_ACCEPTED', {
      change_request_id: changeRequestId
    });

    return result;
  }

  async reject(changeRequestId: string, userId: string) {
    const changeRequest = await prisma.change_requests.findUnique({
      where: { id: changeRequestId },
      include: { contracts: true }
    });

    if (!changeRequest) {
      throw new Error('Change request not found');
    }

    if (changeRequest.status !== ChangeRequestStatus.PENDING) {
      throw new Error('Change request must be pending');
    }

    const isClient = changeRequest.contracts.client_id === userId;
    const isDeveloper = changeRequest.contracts.developer_id === userId;
    const isProposer = changeRequest.proposed_by === userId;

    if (!isClient && !isDeveloper) {
      throw new Error('Unauthorized');
    }

    if (isProposer) {
      throw new Error('Cannot reject your own change request');
    }

    const result = await prisma.change_requests.update({
      where: { id: changeRequestId },
      data: { status: ChangeRequestStatus.REJECTED }
    });

    await this.logActivity(changeRequest.contract_id, userId, 'CHANGE_REQUEST_REJECTED', {
      change_request_id: changeRequestId
    });

    return result;
  }

  async cancel(changeRequestId: string, userId: string) {
    const changeRequest = await prisma.change_requests.findUnique({
      where: { id: changeRequestId }
    });

    if (!changeRequest) {
      throw new Error('Change request not found');
    }

    if (changeRequest.proposed_by !== userId) {
      throw new Error('Only the proposer can cancel');
    }

    if (changeRequest.status !== ChangeRequestStatus.PENDING) {
      throw new Error('Change request must be pending');
    }

    const result = await prisma.change_requests.update({
      where: { id: changeRequestId },
      data: { status: ChangeRequestStatus.CANCELLED }
    });

    await this.logActivity(changeRequest.contract_id, userId, 'CHANGE_REQUEST_CANCELLED', {
      change_request_id: changeRequestId
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

    return prisma.change_requests.findMany({
      where: { contract_id: contractId },
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

export default new ChangeRequestService();