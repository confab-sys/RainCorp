import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { JwtPayload } from 'jsonwebtoken';
import AuthService from '../../services/authService';
import { PrismaClient } from '@prisma/client';
import { SECRET } from '../../utils/config';
import { isUuid } from '../../utils/validators';

const prisma = new PrismaClient();
const authService = new AuthService();

// Register new user
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, email, password, otp } = req.body;

    if (!username || !email || !password) {
      res.status(400).json({
        success: false,
        message: 'Username, email, and password are required'
      });
      return;
    }

    const result = await authService.register({
      username,
      email,
      password,
      otp
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: result
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Registration failed'
    });
  }
};

// Login user (accepts `identifier` which may be email, phone or username)
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { identifier, password, otp } = req.body;

    if (!identifier || !password) {
      res.status(400).json({
        success: false,
        message: 'Identifier and password are required'
      });
      return;
    }

    // Find user by email (case-insensitive), phone or username
    const user = await prisma.users.findFirst({
      where: {
        OR: [
          { email: identifier.toLowerCase() },
          { username: { equals: identifier, mode: 'insensitive' } }
        ]
      },
      select: {
        id: true,
        email: true,
        username: true,
        password_hash: true,
        created_at: true,
        updated_at: true,
        profile_complete_percentage: true,
        avatar_url: true,
        bio: true,
        location: true,
        website_url: true,
        github_url: true,
        linkedin_url: true,
        twitter_url: true,
        whatsapp_url: true,
        instagram_url: true,
        accounts: true,
        sessions: true,
        coin_wallets: true
      }
    });

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Invalid identifier or password'
      });
      return;
    }

    // Check password
    if (!user.password_hash) {
      res.status(401).json({
        success: false,
        message: 'Account not properly configured'
      });
      return;
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      res.status(401).json({
        success: false,
        message: 'Invalid identifier or password'
      });
      return;
    }

    // Generate JWT token
    const accessToken = jwt.sign(
      { 
        sub: user.id,  // Standard JWT subject claim
        id: user.id,  // Backward compatibility
        email: user.email 
      },
      process.env.JWT_SECRET || 'fallback-secret-key',
      { expiresIn: '7d' }
    );

    const refreshToken = jwt.sign(
      { 
        sub: user.id,  // Standard JWT subject claim
        id: user.id,  // Backward compatibility
        type: 'refresh' 
      },
      process.env.JWT_SECRET || 'fallback-secret-key',
      { expiresIn: '30d' }
    );

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email
        },
        accessToken,
        refreshToken
      }
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed'
    });
  }
};

// Get user profile
export const getUserProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.params.id;

    if (!userId || !isUuid(userId)) {
      res.status(400).json({
        success: false,
        message: 'Valid user ID is required'
      });
      return;
    }

    const user = await prisma.users.findUnique({
      where: { id: userId },
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
        instagram_url: true,
        whatsapp_url: true,
        created_at: true,
        profile_complete_percentage: true
      }
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error: any) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user profile'
    });
  }
};

/**
 * Upload profile picture
 */
export const uploadProfilePicture = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user;
    
    if (!userId) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ success: false, message: 'No file uploaded' });
      return;
    }

    const file = req.file;
    const fileUrl = `/uploads/${file.filename}`;
    
    // Update user's avatar_url
    await prisma.users.update({
      where: { id: userId },
      data: {
        avatar_url: fileUrl,
        updated_at: new Date()
      }
    });
    
    res.status(200).json({
      success: true,
      avatar_url: fileUrl,
      message: 'Profile picture uploaded successfully'
    });
  } catch (error: any) {
    console.error('Upload profile picture error:', error);
    res.status(500).json({ success: false, message: 'Failed to upload profile picture' });
  }
};

// Update user profile
export const updateUserProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.params.id;
    const updateData = req.body;

    if (!userId) {
      res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
      return;
    }

    // Remove sensitive fields that shouldn't be updated directly
    delete updateData.password;
    delete updateData.email;
    delete updateData.id;

    // Check if username is being updated and if it's already taken
    if (updateData.username) {
      const existingUser = await prisma.users.findFirst({
        where: {
          username: updateData.username,
          NOT: { id: userId }
        }
      });

      if (existingUser) {
        res.status(400).json({
          success: false,
          message: 'Username is already taken'
        });
        return;
      }
    }

    const updatedUser = await prisma.users.update({
      where: { id: userId },
      data: {
        ...updateData,
        updated_at: new Date()
      },
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
        instagram_url: true,
        whatsapp_url: true,
        profile_complete_percentage: true
      }
    });

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedUser
    });
  } catch (error: any) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
};

// Refresh access token
export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken: token } = req.body;

    if (!token) {
      res.status(400).json({
        success: false,
        message: 'Refresh token is required',
        code: 'MISSING_REFRESH_TOKEN'
      });
      return;
    }

    // Verify refresh token
    let payload: JwtPayload | null = null;
    try {
      payload = jwt.verify(token, SECRET) as JwtPayload;
    } catch (error: any) {
      let message = 'Invalid refresh token';
      let code = 'INVALID_REFRESH_TOKEN';

      if (error.name === 'TokenExpiredError') {
        message = 'Refresh token has expired. Please log in again.';
        code = 'REFRESH_TOKEN_EXPIRED';
      } else if (error.name === 'JsonWebTokenError') {
        message = 'Invalid refresh token signature';
        code = 'INVALID_TOKEN_SIGNATURE';
      }

      console.warn('Refresh token verification failed:', {
        error: error.message,
        ip: req.ip
      });

      res.status(401).json({
        success: false,
        message,
        code
      });
      return;
    }

    // Verify it's a refresh token
    if (payload.type !== 'refresh') {
      console.warn('Non-refresh token used for token refresh:', {
        tokenType: payload.type,
        userId: payload.sub,
        ip: req.ip
      });

      res.status(401).json({
        success: false,
        message: 'Invalid token type. Expected refresh token.',
        code: 'INVALID_TOKEN_TYPE'
      });
      return;
    }

    const userId = payload.sub || payload.user_id;

    // Verify user still exists
    const user = await prisma.users.findUnique({
      where: { id: userId as string },
      select: {
        id: true,
        email: true,
        username: true
      }
    });

    if (!user) {
      console.warn('Token refresh attempted for non-existent user:', {
        userId,
        ip: req.ip
      });

      res.status(401).json({
        success: false,
        message: 'User not found. Please log in again.',
        code: 'USER_NOT_FOUND'
      });
      return;
    }

    // Generate new access token
    const newAccessToken = jwt.sign(
      {
        sub: user.id,
        user_id: user.id,
        email: user.email,
        username: user.username
      },
      SECRET,
      { expiresIn: '7d' }
    );

    // Generate new refresh token
    const newRefreshToken = jwt.sign(
      {
        sub: user.id,
        user_id: user.id,
        type: 'refresh'
      },
      SECRET,
      { expiresIn: '30d' }
    );

    console.log('Token refreshed successfully:', {
      userId: user.id,
      email: user.email,
      ip: req.ip
    });

    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: 604800, // 7 days in seconds
        tokenType: 'Bearer'
      }
    });

  } catch (error: any) {
    console.error('Refresh token error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to refresh token',
      code: 'REFRESH_ERROR'
    });
  }
};

// Validate token - check if token is expired or still valid
export const validateToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(400).json({
        success: false,
        message: 'Authorization header with Bearer token is required',
        code: 'MISSING_TOKEN'
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    try {
      const payload = jwt.verify(token, SECRET) as JwtPayload;
      
      // Token is valid
      res.status(200).json({
        success: true,
        message: 'Token is valid',
        data: {
          isValid: true,
          isExpired: false,
          expiresAt: new Date(payload.exp! * 1000).toISOString(),
          userId: payload.sub || payload.user_id,
          email: payload.email,
          username: payload.username,
          tokenType: payload.type || 'access'
        }
      });

    } catch (error: any) {
      let message = 'Token is invalid';
      let code = 'INVALID_TOKEN';
      let isExpired = false;

      if (error.name === 'TokenExpiredError') {
        message = 'Token has expired';
        code = 'TOKEN_EXPIRED';
        isExpired = true;
      } else if (error.name === 'JsonWebTokenError') {
        message = 'Invalid token signature';
        code = 'INVALID_TOKEN_SIGNATURE';
      }

      res.status(401).json({
        success: false,
        message,
        code,
        data: {
          isValid: false,
          isExpired,
          token: null // Never return the invalid token
        }
      });
    }

  } catch (error: any) {
    console.error('Token validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate token',
      code: 'VALIDATION_ERROR'
    });
  }
};

// Request password reset
export const requestPasswordReset = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;
    const { requestPasswordReset } = await import('../../services/authservice/passwordReset');

    if (!email) {
      res.status(400).json({
        success: false,
        message: 'Email is required',
        code: 'MISSING_EMAIL'
      });
      return;
    }

    const result = await requestPasswordReset({ email });

    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        resetToken: result.resetToken // In production, don't return token - send via email instead
      }
    });
  } catch (error: any) {
    console.error('Password reset request error:', error);
    
    if (error.statusCode) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
        code: error.code,
        details: error.details
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'An error occurred while processing your password reset request',
        code: 'INTERNAL_ERROR'
      });
    }
  }
};

// Verify reset token and reset password
export const verifyAndResetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, resetToken, newPassword } = req.body;
    const { verifyAndResetPassword } = await import('../../services/authservice/passwordReset');

    if (!email || !resetToken || !newPassword) {
      res.status(400).json({
        success: false,
        message: 'Email, reset token, and new password are required',
        code: 'MISSING_FIELDS'
      });
      return;
    }

    const result = await verifyAndResetPassword({ email, resetToken, newPassword });

    res.status(200).json({
      success: true,
      message: result.message,
      data: { email }
    });
  } catch (error: any) {
    console.error('Password reset verification error:', error);
    
    if (error.statusCode) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
        code: error.code,
        details: error.details
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'An error occurred while resetting your password',
        code: 'INTERNAL_ERROR'
      });
    }
  }
};

// Change password for authenticated user
export const changePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = (req as any).user?.id;
    const { changePassword } = await import('../../services/authservice/passwordReset');

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'UNAUTHORIZED'
      });
      return;
    }

    if (!currentPassword || !newPassword) {
      res.status(400).json({
        success: false,
        message: 'Current password and new password are required',
        code: 'MISSING_FIELDS'
      });
      return;
    }

    const result = await changePassword(userId, currentPassword, newPassword);

    res.status(200).json({
      success: true,
      message: result.message,
      data: {}
    });
  } catch (error: any) {
    console.error('Change password error:', error);
    
    if (error.statusCode) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
        code: error.code,
        details: error.details
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'An error occurred while changing your password',
        code: 'INTERNAL_ERROR'
      });
    }
  }
};

// Export OAuth handlers
export { handleOAuthCallback, linkOAuthAccount, signOut } from './oauthController';
