import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { normalizeAvailability } from '../../utils/availability';
import { SECRET } from '../../utils/config';

const prisma = new PrismaClient();

interface TokenPayload {
  id: string;
  type?: string;
  iat?: number;
  exp?: number;
}

interface VerifyTokenResponse {
  id: string;
  type?: string;
  iat?: number;
  exp?: number;
}

interface UserFromTokenResponse {
  id: string;
  username: string;
  email: string;
  created_at: Date | null;
  updated_at: Date | null;
  availability: string | null;
  profile_complete_percentage: number | null;
}

interface VerifyUserRequest {
  userId: string;
  badge?: string;
  otp?: string;
}

interface VerifyUserResponse {
  message: string;
  success: boolean;
  user?: {
    id: string;
    username: string;
    email: string;
  };
}

interface VerifyError {
  code: string;
  message: string;
  statusCode: number;
  details?: any;
}

// Logger utility
const logger = {
  info: (message: string, data?: any) => {
    console.log(`[VERIFY INFO] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
  error: (message: string, error?: any) => {
    console.error(`[VERIFY ERROR] ${message}`, error ? JSON.stringify(error, null, 2) : '');
  },
  warn: (message: string, data?: any) => {
    console.warn(`[VERIFY WARN] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }
};

// Verify JWT token
export function verifyToken(token: string): VerifyTokenResponse {
  try {
    if (!token) {
      throw new Error('Token is required');
    }

    const decoded = jwt.verify(token, SECRET) as TokenPayload;

    // Check if token is expired
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      const error: VerifyError = {
        code: 'TOKEN_EXPIRED',
        message: 'Token has expired',
        statusCode: 401
      };
      logger.warn('Token expired', { tokenId: decoded.id, exp: decoded.exp });
      throw error;
    }

    logger.info('Token verified successfully', { userId: decoded.id, type: decoded.type });
    return decoded;

  } catch (error: any) {
    // Handle JWT specific errors
    if (error.name === 'JsonWebTokenError') {
      const jwtError: VerifyError = {
        code: 'INVALID_TOKEN',
        message: 'Invalid token format',
        statusCode: 401,
        details: error.message
      };
      logger.error('JWT verification failed', jwtError);
      throw jwtError;
    }

    if (error.name === 'TokenExpiredError') {
      const expError: VerifyError = {
        code: 'TOKEN_EXPIRED',
        message: 'Token has expired',
        statusCode: 401,
        details: { expiredAt: error.expiredAt }
      };
      logger.warn('Token expired', expError);
      throw expError;
    }

    // Re-throw custom errors
    if (error.code && error.statusCode) {
      throw error;
    }

    // Handle other errors
    logger.error('Unexpected error in verifyToken', error);
    const unexpectedError: VerifyError = {
      code: 'VERIFICATION_ERROR',
      message: 'Token verification failed',
      statusCode: 401,
      details: error.message
    };
    throw unexpectedError;
  }
}

// Get user from JWT token
export async function getUserFromToken(token: string): Promise<UserFromTokenResponse | null> {
  try {
    const decoded = verifyToken(token);

    logger.info('Fetching user from token', { userId: decoded.id });

    const user = await prisma.users.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        username: true,
        email: true,
        created_at: true,
        updated_at: true,
        availability: true,
        profile_complete_percentage: true
      }
    });

    if (!user) {
      logger.warn('User not found for token', { userId: decoded.id });
      return null;
    }

    // Normalize availability so callers always receive a string or null
    const normalizedAvailability = normalizeAvailability((user as any).availability);

    logger.info('User retrieved from token', { userId: user.id, username: user.username });
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      created_at: user.created_at,
      updated_at: user.updated_at,
      availability: normalizedAvailability,
      profile_complete_percentage: (user as any).profile_complete_percentage ?? null
    } as UserFromTokenResponse;

  } catch (error: any) {
    if (error.code && error.statusCode) {
      throw error;
    }

    // Handle database errors
    logger.error('Database error in getUserFromToken', error);
    const dbError: VerifyError = {
      code: 'DATABASE_ERROR',
      message: 'Failed to retrieve user from token',
      statusCode: 500,
      details: error.message
    };
    throw dbError;
  }
}

// Verify user account (email verification, OTP verification, etc.)
export async function verifyUser(request: VerifyUserRequest | string): Promise<VerifyUserResponse> {
  try {
    const params: VerifyUserRequest = typeof request === 'string' ? { userId: request } : request;

    if (!params.userId) {
      const error: VerifyError = {
        code: 'INVALID_USER_ID',
        message: 'Valid user ID is required',
        statusCode: 400
      };
      logger.error('Invalid user ID for verification', error);
      throw error;
    }

    logger.info('Verifying user account', { userId: params.userId, badge: params.badge });

    const user = await prisma.users.findUnique({
      where: { id: params.userId },
      select: {
        id: true,
        username: true,
        email: true,
        // Add verification fields when implemented
        // email_verified: true,
        // phone_verified: true,
        // verification_badge: true
      }
    });

    if (!user) {
      const error: VerifyError = {
        code: 'USER_NOT_FOUND',
        message: 'User not found',
        statusCode: 404
      };
      logger.error('User not found for verification', error);
      throw error;
    }

    // TODO: Implement actual verification logic
    // This could include:
    // - Email verification with OTP
    // - Phone verification
    // - Badge assignment
    // - Account status updates

    // For now, just return success
    const response: VerifyUserResponse = {
      message: 'User verified successfully',
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    };

    logger.info('User verification completed', { userId: params.userId });
    return response;

  } catch (error: any) {
    if (error.code && error.statusCode) {
      throw error;
    }

    logger.error('Database error in verifyUser', error);
    const dbError: VerifyError = {
      code: 'DATABASE_ERROR',
      message: 'An error occurred during user verification',
      statusCode: 500,
      details: error.message
    };
    throw dbError;
  }
}