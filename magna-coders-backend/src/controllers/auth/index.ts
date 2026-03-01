import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import AuthService from '../../services/authService';
import { PrismaClient } from '@prisma/client';

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

    if (!userId) {
      res.status(400).json({
        success: false,
        message: 'User ID is required'
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
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({
        success: false,
        message: 'Refresh token is required'
      });
      return;
    }

    // For now, return a simple response
    // In a real implementation, you'd validate and generate new tokens
    res.status(200).json({
      success: true,
      message: 'Token refresh not fully implemented yet'
    });
  } catch (error: any) {
    console.error('Refresh token error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to refresh token'
    });
  }
};

// Export OAuth handlers
export { handleOAuthCallback, linkOAuthAccount, signOut } from './oauthController';
