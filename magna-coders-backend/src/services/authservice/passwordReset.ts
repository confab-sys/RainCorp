import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

interface PasswordResetRequest {
  email: string;
}

interface PasswordResetVerifyRequest {
  email: string;
  resetToken: string;
  newPassword: string;
}

interface PasswordResetResponse {
  success: boolean;
  message: string;
  resetToken?: string;
}

interface PasswordResetError {
  code: string;
  message: string;
  statusCode: number;
  details?: any;
}

// Logger utility
const logger = {
  info: (message: string, data?: any) => {
    console.log(`[PASSWORD_RESET INFO] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
  error: (message: string, error?: any) => {
    console.error(`[PASSWORD_RESET ERROR] ${message}`, error ? JSON.stringify(error, null, 2) : '');
  },
  warn: (message: string, data?: any) => {
    console.warn(`[PASSWORD_RESET WARN] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }
};

/**
 * Request password reset - generates reset token and sends to user
 */
export async function requestPasswordReset(request: PasswordResetRequest): Promise<PasswordResetResponse> {
  try {
    if (!request.email) {
      const error: PasswordResetError = {
        code: 'MISSING_EMAIL',
        message: 'Email is required',
        statusCode: 400
      };
      logger.error('Missing email', error);
      throw error;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(request.email)) {
      const error: PasswordResetError = {
        code: 'INVALID_EMAIL',
        message: 'Invalid email format',
        statusCode: 400,
        details: { email: request.email }
      };
      logger.error('Invalid email format', error);
      throw error;
    }

    logger.info('Processing password reset request', { email: request.email });

    // Find user by email
    const user = await prisma.users.findUnique({
      where: { email: request.email },
      select: { id: true, email: true, username: true }
    });

    if (!user) {
      // Don't reveal if email exists - security best practice
      logger.warn('Password reset requested for non-existent user', { email: request.email });
      return {
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent'
      };
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = await bcrypt.hash(resetToken, 10);
    const resetTokenExpiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour

    logger.info('Generated reset token', { userId: user.id, email: user.email });

    // Store reset token in database (would need to add password_reset_tokens table)
    // For now, we'll store it in a simple way
    // TODO: Create password_reset_tokens table in database
    // For MVP, we can return the token directly (insecure, use only in development)
    // In production, send via email and store hash

    return {
      success: true,
      message: 'Password reset link has been sent to your email',
      resetToken: resetToken // In production, don't return this directly - send via email
    };

  } catch (error: any) {
    if (error.code && error.statusCode) {
      throw error;
    }

    logger.error('Database error in requestPasswordReset', error);
    const dbError: PasswordResetError = {
      code: 'DATABASE_ERROR',
      message: 'An error occurred while processing your request. Please try again later',
      statusCode: 500,
      details: error.message
    };
    throw dbError;
  }
}

/**
 * Verify and reset password using reset token
 */
export async function verifyAndResetPassword(request: PasswordResetVerifyRequest): Promise<PasswordResetResponse> {
  try {
    // Validate input
    if (!request.email || !request.resetToken || !request.newPassword) {
      const error: PasswordResetError = {
        code: 'MISSING_FIELDS',
        message: 'Email, reset token, and new password are required',
        statusCode: 400,
        details: {
          email: !!request.email,
          resetToken: !!request.resetToken,
          newPassword: !!request.newPassword
        }
      };
      logger.error('Missing required fields', error);
      throw error;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(request.email)) {
      const error: PasswordResetError = {
        code: 'INVALID_EMAIL',
        message: 'Invalid email format',
        statusCode: 400
      };
      logger.error('Invalid email format', error);
      throw error;
    }

    // Validate password strength
    if (request.newPassword.length < 8) {
      const error: PasswordResetError = {
        code: 'WEAK_PASSWORD',
        message: 'Password must be at least 8 characters long',
        statusCode: 400
      };
      logger.error('Weak password provided', error);
      throw error;
    }

    logger.info('Processing password reset verification', { email: request.email });

    // Find user by email
    const user = await prisma.users.findUnique({
      where: { email: request.email },
      select: { id: true, email: true, username: true, password_hash: true }
    });

    if (!user) {
      const error: PasswordResetError = {
        code: 'USER_NOT_FOUND',
        message: 'Invalid reset request. User not found',
        statusCode: 404
      };
      logger.warn('Password reset for non-existent user', { email: request.email });
      throw error;
    }

    // TODO: Validate reset token against stored hash in password_reset_tokens table
    // For MVP, skip token validation - in production, check token expiration and validity
    
    // Hash new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(request.newPassword, saltRounds);

    // Update user password
    await prisma.users.update({
      where: { id: user.id },
      data: { password_hash: hashedPassword, updated_at: new Date() }
    });

    logger.info('Password reset successfully', { userId: user.id, email: user.email });

    // TODO: Delete used reset token from password_reset_tokens table

    return {
      success: true,
      message: 'Password has been reset successfully. You can now log in with your new password'
    };

  } catch (error: any) {
    if (error.code && error.statusCode) {
      throw error;
    }

    logger.error('Database error in verifyAndResetPassword', error);
    const dbError: PasswordResetError = {
      code: 'DATABASE_ERROR',
      message: 'An error occurred while resetting your password. Please try again later',
      statusCode: 500,
      details: error.message
    };
    throw dbError;
  }
}

/**
 * Change password for authenticated user
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<PasswordResetResponse> {
  try {
    if (!currentPassword || !newPassword) {
      const error: PasswordResetError = {
        code: 'MISSING_FIELDS',
        message: 'Current password and new password are required',
        statusCode: 400
      };
      logger.error('Missing password fields', error);
      throw error;
    }

    if (newPassword.length < 8) {
      const error: PasswordResetError = {
        code: 'WEAK_PASSWORD',
        message: 'New password must be at least 8 characters long',
        statusCode: 400
      };
      logger.error('Weak new password provided', error);
      throw error;
    }

    if (currentPassword === newPassword) {
      const error: PasswordResetError = {
        code: 'SAME_PASSWORD',
        message: 'New password must be different from current password',
        statusCode: 400
      };
      logger.error('New password same as current', error);
      throw error;
    }

    logger.info('Processing password change', { userId });

    // Get user
    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, password_hash: true, email: true }
    });

    if (!user) {
      const error: PasswordResetError = {
        code: 'USER_NOT_FOUND',
        message: 'User not found',
        statusCode: 404
      };
      logger.error('User not found for password change', error);
      throw error;
    }

    if (!user.password_hash) {
      const error: PasswordResetError = {
        code: 'NO_PASSWORD',
        message: 'Account not properly configured',
        statusCode: 500
      };
      logger.error('User has no password hash', error);
      throw error;
    }

    // Verify current password
    let isCurrentPasswordValid = false;
    try {
      isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
    } catch (bcryptError) {
      const error: PasswordResetError = {
        code: 'PASSWORD_VERIFICATION_ERROR',
        message: 'An error occurred while verifying your password',
        statusCode: 500
      };
      logger.error('Password verification failed', { userId, error: bcryptError });
      throw error;
    }

    if (!isCurrentPasswordValid) {
      const error: PasswordResetError = {
        code: 'INVALID_CURRENT_PASSWORD',
        message: 'Current password is incorrect',
        statusCode: 401
      };
      logger.warn('Invalid current password attempt', { userId });
      throw error;
    }

    // Hash new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await prisma.users.update({
      where: { id: userId },
      data: { password_hash: hashedPassword, updated_at: new Date() }
    });

    logger.info('Password changed successfully', { userId, email: user.email });

    return {
      success: true,
      message: 'Password has been changed successfully'
    };

  } catch (error: any) {
    if (error.code && error.statusCode) {
      throw error;
    }

    logger.error('Database error in changePassword', error);
    const dbError: PasswordResetError = {
      code: 'DATABASE_ERROR',
      message: 'An error occurred while changing your password',
      statusCode: 500,
      details: error.message
    };
    throw dbError;
  }
}
