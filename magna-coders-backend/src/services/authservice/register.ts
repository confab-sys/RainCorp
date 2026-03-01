import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  otp?: string;
}

interface RegisterResponse {
  user: {
    id: string;
    username: string;
    email: string;
  };
  message: string;
  requiresVerification?: boolean;
}

interface RegisterError {
  code: string;
  message: string;
  statusCode: number;
  details?: any;
}

// Logger utility
const logger = {
  info: (message: string, data?: any) => {
    console.log(`[REGISTER INFO] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
  error: (message: string, error?: any) => {
    console.error(`[REGISTER ERROR] ${message}`, error ? JSON.stringify(error, null, 2) : '');
  },
  warn: (message: string, data?: any) => {
    console.warn(`[REGISTER WARN] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }
};

// Register new user
export async function register(userData: RegisterRequest): Promise<RegisterResponse> {
  try {
    if (!userData.username || !userData.email || !userData.password) {
      const error: RegisterError = {
        code: 'INVALID_INPUT',
        message: 'Username, email, and password are required',
        statusCode: 400,
        details: {
          username: !!userData.username,
          email: !!userData.email,
          password: !!userData.password
        }
      };
      logger.error('Invalid input data', error);
      throw error;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userData.email)) {
      const error: RegisterError = {
        code: 'INVALID_EMAIL',
        message: 'Invalid email format',
        statusCode: 400,
        details: { email: userData.email }
      };
      logger.error('Invalid email format', error);
      throw error;
    }

    // Validate password strength
    if (userData.password.length < 8) {
      const error: RegisterError = {
        code: 'WEAK_PASSWORD',
        message: 'Password must be at least 8 characters long',
        statusCode: 400
      };
      logger.error('Weak password', error);
      throw error;
    }

    logger.info('Checking for existing user', { username: userData.username, email: userData.email });

    // Check if user already exists
    const existingUser = await prisma.users.findFirst({
      where: {
        OR: [
          { username: { equals: userData.username, mode: 'insensitive' } },
          { email: userData.email }
        ]
      },
      select: { id: true, username: true, email: true }
    });

    if (existingUser) {
      const field = existingUser.username.toLowerCase() === userData.username.toLowerCase() ? 'username' : 'email';
      const error: RegisterError = {
        code: 'USER_EXISTS',
        message: `${field === 'username' ? 'Username' : 'Email'} already taken`,
        statusCode: 409,
        details: { field, value: field === 'username' ? userData.username : userData.email }
      };
      logger.error('User already exists', error);
      throw error;
    }

    // Hash password
    logger.info('Hashing password');
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(userData.password, saltRounds);

    // Generate user ID
    const userId = uuidv4();

    // Create user
    logger.info('Creating user', { userId, username: userData.username, email: userData.email });
    const user = await prisma.users.create({
      data: {
        id: userId,
        username: userData.username,
        email: userData.email,
        password_hash: passwordHash,
      }
    });

    // TODO: Send OTP verification email/SMS
    // ni assumption ndo tunafanya hapa hata OTP verification
    // kwa sasa tuta set requiresVerification to false

    logger.info('User registered successfully', { userId: user.id, username: user.username });

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
      message: 'User registered successfully',
      requiresVerification: false // Set to true when OTP verification is implemented
    };

  } catch (error: any) {
    if (error.code && error.statusCode) {
      throw error;
    }

    // Handle Prisma/database errors
    logger.error('Database error in register', error);

    const dbError: RegisterError = {
      code: 'DATABASE_ERROR',
      message: 'An error occurred while registering user',
      statusCode: 500,
      details: error.message
    };
    throw dbError;
  }
}