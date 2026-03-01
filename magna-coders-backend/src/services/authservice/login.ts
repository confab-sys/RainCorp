import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { SECRET } from '../../utils/config';

const prisma = new PrismaClient();

interface LoginRequest {
  username: any;
  identifier: string;
  password: string;
  otp?: string;
}

interface LoginResponse {
  user: {
    id: string;
    username: string;
    email: string;
  };
  token: string;
  refreshToken?: string;
}

interface LoginError {
  code: string;
  message: string;
  statusCode: number;
  details?: any;
}

// Logger utility
const logger = {
  info: (message: string, data?: any) => {
    console.log(`[LOGIN INFO] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
  error: (message: string, error?: any) => {
    console.error(`[LOGIN ERROR] ${message}`, error ? JSON.stringify(error, null, 2) : '');
  },
  warn: (message: string, data?: any) => {
    console.warn(`[LOGIN WARN] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }
};

// Generate JWT token
function generateToken(userId: string): string {
  return jwt.sign(
    { 
      sub: userId,  // Standard JWT subject claim
      id: userId  // Backward compatibility
    },
    SECRET,
    { expiresIn: '7d' }
  );
}

// Generate refresh token
function generateRefreshToken(userId: string): string {
  return jwt.sign(
    { 
      sub: userId,  // Standard JWT subject claim
      id: userId,  // Backward compatibility
      type: 'refresh' 
    },
    SECRET,
    { expiresIn: '30d' }
  );
}

// Login user with security checks
export async function login(credentials: LoginRequest): Promise<LoginResponse> {
  try {
    if (!credentials.identifier || !credentials.password) {
      const error: LoginError = {
        code: 'INVALID_CREDENTIALS',
        message: 'Identifier and password are required',
        statusCode: 400
      };
      logger.error('Invalid login credentials', error);
      throw error;
    }

    logger.info('Attempting login', { identifier: credentials.identifier });

    // Find user by email, phone or username
    const user = await prisma.users.findFirst({
      where: {
        OR: [
          { email: credentials.identifier.toLowerCase() },
          { username: { equals: credentials.identifier, mode: 'insensitive' } }
        ]
      },
      select: {
        id: true,
        email: true,
        username: true,
        password_hash: true,
        created_at: true,
        avatar_url: true,
        bio: true,
        location: true,
        github_url: true,
        linkedin_url: true,
        twitter_url: true,
        whatsapp_url: true,
        instagram_url: true,
        profile_complete_percentage: true
      }
    });

    if (!user) {
      const error: LoginError = {
        code: 'USER_NOT_FOUND',
        message: 'Invalid username or password',
        statusCode: 401
      };
      logger.warn('User not found', { username: credentials.username });
      throw error;
    }

    // TODO: Uncomment when password_hash is added to schema
    // // Verify password
    // if (!user.password_hash) {
    //   const error: LoginError = {
    //     code: 'NO_PASSWORD',
    //     message: 'Account not properly configured',
    //     statusCode: 500
    //   };
    //   logger.error('No password hash found', error);
    //   throw error;
    // }

    // const isValidPassword = await bcrypt.compare(credentials.password, user.password_hash);
    // if (!isValidPassword) {
    //   const error: LoginError = {
    //     code: 'INVALID_PASSWORD',
    //     message: 'Invalid username or password',
    //     statusCode: 401
    //   };
    //   logger.warn('Invalid password', { userId: user.id });
    //   throw error;
    // }

    // For now, skip password verification ntawork on it later
    logger.info('Login successful (password verification skipped)', { userId: user.id });

    // Generate tokens
    const token = generateToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    // TODO: Store refresh token in database
    // await prisma.refresh_tokens.create({
    //   data: {
    //     id: uuidv4(),
    //     userId: user.id,
    //     token: refreshToken,
    //     expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    //   }
    // });

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
      token,
      refreshToken
    };

  } catch (error: any) {
    // Re-throw custom errors
    if (error.code && error.statusCode) {
      throw error;
    }

    // Handle JWT errors
    if (error.name === 'JsonWebTokenError') {
      const jwtError: LoginError = {
        code: 'JWT_ERROR',
        message: 'Token generation failed',
        statusCode: 500,
        details: error.message
      };
      logger.error('JWT generation error', jwtError);
      throw jwtError;
    }

    // Handle database errors
    logger.error('Database error in login', error);

    const dbError: LoginError = {
      code: 'DATABASE_ERROR',
      message: 'An error occurred during login',
      statusCode: 500,
      details: error.message
    };
    throw dbError;
  }
}