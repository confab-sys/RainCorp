import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class ActivityLogService {
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

    return prisma.activity_logs.findMany({
      where: { contract_id: contractId },
      orderBy: { created_at: 'desc' },
      take: 100
    });
  }

  async getRecentActivity(userId: string, limit: number = 20) {
    const contracts = await prisma.contracts.findMany({
      where: {
        OR: [
          { client_id: userId },
          { developer_id: userId }
        ]
      },
      select: { id: true }
    });

    const contractIds = contracts.map((c: { id: string }) => c.id);

    return prisma.activity_logs.findMany({
      where: {
        contract_id: { in: contractIds }
      },
      orderBy: { created_at: 'desc' },
      take: limit,
      include: {
        contracts: {
          select: { id: true, title: true }
        }
      }
    });
  }
}

export default new ActivityLogService();