import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Get all users (builders) with pagination and filtering
 */
export const getUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.max(Number(req.query.limit || 10), 1);
    const skip = (page - 1) * limit;
    const { search, role, location } = req.query as Record<string, string>;

    const where: any = {};

    // Search by username, email, or bio
    if (search) {
      where.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { bio: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Filter by location
    if (location) {
      where.location = { contains: location, mode: 'insensitive' };
    }

    console.log('Fetching users with params:', { page, limit, skip, where });

    const [rawUsers, total] = await Promise.all([
      prisma.users.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          username: true,
          email: true,
          avatar_url: true,
          bio: true,
          location: true,
          website_url: true,
          github_url: true,
          linkedin_url: true,
          twitter_url: true,
          whatsapp_url: true,
          instagram_url: true,
          availability: true,
          profile_complete_percentage: true,
          created_at: true,
          updated_at: true
        }
      }),
      prisma.users.count({ where })
    ]);
    // Normalize availability: convert [] or {} strings to 'available'
    const users = rawUsers.map(u => {
      let availability = (u as any).availability;
      if (typeof availability === 'string' && (availability === '[]' || availability === '{}')) {
        availability = 'available';
      }
      return { ...u, availability };
    });

    console.log(`Found ${users.length} users out of ${total} total`);
    console.log('Users:', users.map(u => ({ username: u.username, email: u.email })));

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      users,
      pagination: {
        currentPage: page,
        totalPages,
        totalUsers: total,
        limit
      }
    });
  } catch (error: any) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message
    });
  }
};

/**
 * Get a single user by ID
 */
export const getUserById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const user = await prisma.users.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        email: true,
        avatar_url: true,
        bio: true,
        location: true,
        website_url: true,
        github_url: true,
        linkedin_url: true,
        twitter_url: true,
        whatsapp_url: true,
        instagram_url: true,
        availability: true,
        profile_complete_percentage: true,
        created_at: true,
        updated_at: true
      }
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }

    // Normalize availability: convert [] or {} strings to 'available'
    let availability = (user as any).availability;
    if (typeof availability === 'string' && (availability === '[]' || availability === '{}')) {
      availability = 'available';
    }
    const safeUser = {
      ...user,
      availability
    };

    res.status(200).json({
      success: true,
      user: safeUser
    });
  } catch (error: any) {
    console.error('Get user by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user'
    });
  }
};
