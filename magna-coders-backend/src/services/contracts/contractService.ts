import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import {
  ContractStatus,
  CreateContractInput,
  ContractFilter
} from '../../types/contracts';

const prisma = new PrismaClient();

export class ContractService {
  async create(clientId: string, input: CreateContractInput) {
    const contract = await prisma.contracts.create({
      data: {
        id: uuidv4(),
        client_id: clientId,
        title: input.title,
        description: input.description,
        currency: input.currency || 'KES',
        total_amount: input.total_amount,
        funding_mode: input.funding_mode || 'NEXT_MILESTONE_REQUIRED',
        start_at: input.start_at,
        terms_version: input.terms_version,
        metadata: input.metadata,
        status: ContractStatus.DRAFT
      }
    });

    await this.logActivity(contract.id, clientId, 'CONTRACT_CREATED', { title: input.title });
    return contract;
  }

  async send(contractId: string, clientId: string, developerId: string) {
    const contract = await prisma.contracts.findUnique({
      where: { id: contractId }
    });

    if (!contract || contract.client_id !== clientId) {
      throw new Error('Contract not found or unauthorized');
    }

    if (contract.status !== ContractStatus.DRAFT) {
      throw new Error('Contract must be in DRAFT status to send');
    }

    const updated = await prisma.contracts.update({
      where: { id: contractId },
      data: {
        developer_id: developerId,
        status: ContractStatus.PENDING_DEVELOPER_ACCEPTANCE
      }
    });

    await this.logActivity(contractId, clientId, 'CONTRACT_SENT', { developer_id: developerId });
    return updated;
  }

  async accept(contractId: string, developerId: string) {
    const contract = await prisma.contracts.findUnique({
      where: { id: contractId }
    });

    if (!contract || contract.developer_id !== developerId) {
      throw new Error('Contract not found or unauthorized');
    }

    if (contract.status !== ContractStatus.PENDING_DEVELOPER_ACCEPTANCE) {
      throw new Error('Contract must be pending acceptance');
    }

    const updated = await prisma.contracts.update({
      where: { id: contractId },
      data: { status: ContractStatus.ACTIVE_UNFUNDED }
    });

    await this.logActivity(contractId, developerId, 'CONTRACT_ACCEPTED', {});
    return updated;
  }

  async decline(contractId: string, developerId: string) {
    const contract = await prisma.contracts.findUnique({
      where: { id: contractId }
    });

    if (!contract || contract.developer_id !== developerId) {
      throw new Error('Contract not found or unauthorized');
    }

    if (contract.status !== ContractStatus.PENDING_DEVELOPER_ACCEPTANCE) {
      throw new Error('Contract must be pending acceptance');
    }

    const updated = await prisma.contracts.update({
      where: { id: contractId },
      data: {
        status: ContractStatus.CANCELLED,
        developer_id: null
      }
    });

    await this.logActivity(contractId, developerId, 'CONTRACT_DECLINED', {});
    return updated;
  }

  async getById(contractId: string, userId: string) {
    const contract = await prisma.contracts.findUnique({
      where: { id: contractId },
      include: {
        milestones: { orderBy: { order_index: 'asc' } },
        escrow_accounts: true,
        users_contracts_client_idTousers: { select: { id: true, username: true, email: true } },
        users_contracts_developer_idTousers: { select: { id: true, username: true, email: true } }
      }
    });

    if (!contract) {
      throw new Error('Contract not found');
    }

    if (contract.client_id !== userId && contract.developer_id !== userId) {
      throw new Error('Unauthorized access');
    }

    return contract;
  }

  async getMany(userId: string, filter?: ContractFilter) {
    const where: any = {};

    if (filter?.role === 'client') {
      where.client_id = userId;
    } else if (filter?.role === 'developer') {
      where.developer_id = userId;
    } else {
      where.OR = [{ client_id: userId }, { developer_id: userId }];
    }

    if (filter?.status) {
      where.status = filter.status;
    }

    return prisma.contracts.findMany({
      where,
      include: {
        milestones: { orderBy: { order_index: 'asc' } },
        escrow_accounts: true,
        users_contracts_client_idTousers: { select: { id: true, username: true } },
        users_contracts_developer_idTousers: { select: { id: true, username: true } }
      },
      orderBy: { created_at: 'desc' }
    });
  }

  async updateStatus(contractId: string, status: ContractStatus) {
    return prisma.contracts.update({
      where: { id: contractId },
      data: { status }
    });
  }

  async pause(contractId: string, userId: string) {
    const contract = await prisma.contracts.findUnique({
      where: { id: contractId }
    });

    if (!contract) {
      throw new Error('Contract not found');
    }

    const updated = await prisma.contracts.update({
      where: { id: contractId },
      data: { status: ContractStatus.PAUSED }
    });

    await this.logActivity(contractId, userId, 'CONTRACT_PAUSED', {});
    return updated;
  }

  async resume(contractId: string, userId: string) {
    const contract = await prisma.contracts.findUnique({
      where: { id: contractId }
    });

    if (!contract || contract.status !== ContractStatus.PAUSED) {
      throw new Error('Contract not found or not paused');
    }

    const escrow = await prisma.escrow_accounts.findUnique({
      where: { contract_id: contractId }
    });

    const newStatus = escrow && Number(escrow.funded_total) > 0
      ? ContractStatus.ACTIVE_FUNDED
      : ContractStatus.ACTIVE_UNFUNDED;

    const updated = await prisma.contracts.update({
      where: { id: contractId },
      data: { status: newStatus }
    });

    await this.logActivity(contractId, userId, 'CONTRACT_RESUMED', {});
    return updated;
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

export default new ContractService();
