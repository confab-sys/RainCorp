import { PrismaClient } from '@prisma/client';
import {
  StoreItem,
  StoreEntitlement,
  StoreItemType,
  EntitlementStatus,
  PurchaseStoreItemInput,
} from '../../types/coins';
import { WalletService } from './walletService';

const prisma = new PrismaClient();

export class StoreService {
  static async getStoreItems(): Promise<StoreItem[]> {
    const items = await prisma.store_items.findMany({
      where: { is_active: true },
      orderBy: { price_coins: 'asc' },
    });

    return items.map(this.toStoreItem);
  }

  static async getStoreItemById(id: string): Promise<StoreItem | null> {
    const item = await prisma.store_items.findUnique({
      where: { id },
    });

    return item ? this.toStoreItem(item) : null;
  }

  static async purchaseItem(input: PurchaseStoreItemInput): Promise<StoreEntitlement> {
    const { user_id, item_id } = input;

    const item = await this.getStoreItemById(item_id);
    if (!item) {
      throw new Error('Item not found');
    }

    const wallet = await WalletService.getOrCreateWallet(user_id);
    if (wallet.balance < item.price_coins) {
      throw new Error('Insufficient balance');
    }

    let ends_at: Date | undefined;
    if (item.duration_days) {
      ends_at = new Date();
      ends_at.setDate(ends_at.getDate() + item.duration_days);
    }

    const entitlement = await prisma.$transaction(async (tx) => {
      await tx.coin_wallets.update({
        where: { user_id },
        data: { balance: { decrement: item.price_coins } },
      });

      await tx.coin_transactions.create({
        data: {
          id: crypto.randomUUID(),
          user_id,
          type: 'STORE_PURCHASE',
          amount: item.price_coins,
          direction: 'OUT',
          status: 'COMPLETED',
          reference_id: item_id,
          description: `Purchased ${item.name}`,
        },
      });

      return tx.store_entitlements.create({
        data: {
          id: crypto.randomUUID(),
          user_id,
          item_id,
          ends_at,
          status: EntitlementStatus.ACTIVE,
        },
      });
    });

    return this.toEntitlement(entitlement);
  }

  static async getUserEntitlements(
    user_id: string,
    options?: { type?: StoreItemType; status?: EntitlementStatus }
  ): Promise<StoreEntitlement[]> {
    const where: { user_id: string; status?: string } = { user_id };
    if (options?.status) {
      where.status = options.status;
    }

    const entitlements = await prisma.store_entitlements.findMany({
      where,
      include: { store_items: true },
      orderBy: { created_at: 'desc' },
    });

    let filtered = entitlements;
    if (options?.type) {
      filtered = entitlements.filter((e) => e.store_items.type === options.type);
    }

    return filtered.map(this.toEntitlement);
  }

  static async checkEntitlement(user_id: string, item_type: StoreItemType): Promise<boolean> {
    const entitlement = await prisma.store_entitlements.findFirst({
      where: {
        user_id,
        store_items: { type: item_type },
        status: EntitlementStatus.ACTIVE,
        OR: [{ ends_at: null }, { ends_at: { gt: new Date() } }],
      },
    });

    return !!entitlement;
  }

  static async createStoreItem(input: {
    name: string;
    description?: string;
    price_coins: number;
    type: StoreItemType;
    duration_days?: number;
  }): Promise<StoreItem> {
    const item = await prisma.store_items.create({
      data: {
        id: crypto.randomUUID(),
        name: input.name,
        description: input.description,
        price_coins: input.price_coins,
        type: input.type,
        duration_days: input.duration_days,
        is_active: true,
      },
    });

    return this.toStoreItem(item);
  }

  static async updateStoreItem(
    id: string,
    input: { name?: string; description?: string; price_coins?: number; is_active?: boolean }
  ): Promise<StoreItem> {
    const item = await prisma.store_items.update({
      where: { id },
      data: input,
    });

    return this.toStoreItem(item);
  }

  static async expireEntitlements(): Promise<number> {
    const result = await prisma.store_entitlements.updateMany({
      where: {
        status: EntitlementStatus.ACTIVE,
        ends_at: { lt: new Date() },
      },
      data: { status: EntitlementStatus.EXPIRED },
    });

    return result.count;
  }

  private static toStoreItem(item: {
    id: string;
    name: string;
    description: string | null;
    price_coins: number;
    type: string;
    duration_days: number | null;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  }): StoreItem {
    return {
      id: item.id,
      name: item.name,
      description: item.description || undefined,
      price_coins: item.price_coins,
      type: item.type as StoreItemType,
      duration_days: item.duration_days || undefined,
      is_active: item.is_active,
      created_at: item.created_at,
      updated_at: item.updated_at,
    };
  }

  private static toEntitlement(entitlement: {
    id: string;
    user_id: string;
    item_id: string;
    starts_at: Date;
    ends_at: Date | null;
    status: string;
    created_at: Date;
  }): StoreEntitlement {
    return {
      id: entitlement.id,
      user_id: entitlement.user_id,
      item_id: entitlement.item_id,
      starts_at: entitlement.starts_at,
      ends_at: entitlement.ends_at || undefined,
      status: entitlement.status as EntitlementStatus,
      created_at: entitlement.created_at,
    };
  }
}