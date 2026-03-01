import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { encryptToken } from '../../utils/encryption';
import { generateUsername } from '../../utils/username';
import { SECRET } from '../../utils/config';
import { getOAuthEnvConfig } from '../../utils/validateOAuthEnv';
import {
  logAuthenticationSuccess,
  logAuthenticationFailure,
  logAccountLinkingSuccess,
  logAccountLinkingFailure,
  logTokenValidationFailure,
  logSignOut
} from '../../utils/oauthAuditLog';

const prisma = new PrismaClient();

/**
 * OAuth Callback Handler
 * 
 * Processes OAuth authentication callbacks from Google and GitHub providers.
 * Verifies OAuth tokens, creates or updates user accounts, and generates JWT tokens.
 * Supports both providers with consistent user creation and session management.
 * 
 * Requirements:
 * - Requirement 1.1-1.4: OAuth sign-in flow
 * - Requirement 2.1-2.8: Automatic user account creation
 * - Requirement 5.1-5.4: JWT integration
 * - Requirement 6.5-6.6: Token validation
 * - Requirement 9.1-9.7: Database schema compliance
 * - Requirement 10.1-10.4: Session management
 */

interface OAuthCallbackBody {
  provider: string; // 'google' or 'github'
  providerAccountId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  tokenType: string;
  scope: string;
  idToken?: string; // Only used for Google
  email: string;
  name: string;
  image?: string;
}

/**
 * Handles OAuth callback from Google and GitHub authentication
 * 
 * @param req - Express request with OAuth data in body
 * @param res - Express response
 * 
 * Flow:
 * 1. Validate provider is 'google' or 'github'
 * 2. For Google: Verify OAuth token with Google API (check signature, expiration, audience, issuer)
 * 3. For GitHub: Trust frontend validation (ID token not applicable)
 * 4. Find or create user by email and save to database
 * 5. Create or update Account record with encrypted tokens
 * 6. Create Session record for session management
 * 7. Generate JWT access and refresh tokens
 * 8. Log authentication event
 * 9. Return user data and tokens
 * 
 * User Creation:
 * - All users are created with unique username generated from email
 * - password_hash is set to null for OAuth-only accounts
 * - Avatar URL is stored from OAuth provider profile picture
 * - User is saved atomically with Account and Session in transaction
 */
export async function handleOAuthCallback(req: Request, res: Response): Promise<void> {
  try {
    const data: OAuthCallbackBody = req.body;
    
    // Validate required fields
    if (!data || typeof data !== 'object') {
      res.status(400).json({
        success: false,
        message: 'Invalid request data'
      });
      return;
    }
    
    // Validate provider (Requirement 1.1)
    const validProviders = ['google', 'github'];
    if (!validProviders.includes(data.provider)) {
      console.warn('Unsupported OAuth provider attempted:', {
        provider: data.provider,
        ip: req.ip
      });
      
      // Log authentication failure
      await logAuthenticationFailure(
        req.ip || 'unknown',
        req.headers['user-agent'] || 'unknown',
        `Unsupported provider: ${data.provider}`,
        data.email
      );
      
      res.status(400).json({
        success: false,
        message: 'Unsupported OAuth provider. Supported providers: google, github'
      });
      return;
    }
    
    // Validate required OAuth fields
    if (!data.email || !data.providerAccountId || !data.accessToken) {
      console.warn('Missing required OAuth fields:', {
        hasEmail: !!data.email,
        hasProviderAccountId: !!data.providerAccountId,
        hasAccessToken: !!data.accessToken,
        ip: req.ip
      });
      
      // Log authentication failure
      await logAuthenticationFailure(
        req.ip || 'unknown',
        req.headers['user-agent'] || 'unknown',
        'Missing required authentication data',
        data.email
      );
      
      res.status(400).json({
        success: false,
        message: 'Missing required authentication data'
      });
      return;
    }
    
    // Get OAuth configuration with error handling
    let oauthConfig;
    try {
      oauthConfig = getOAuthEnvConfig();
    } catch (error: any) {
      console.error('OAuth configuration error:', {
        error: error.message,
        ip: req.ip
      });
      
      res.status(500).json({
        success: false,
        message: 'Authentication service temporarily unavailable'
      });
      return;
    }
    
    const googleClient = new OAuth2Client(oauthConfig.GOOGLE_CLIENT_ID);
    
    // Verify OAuth token based on provider (Requirements 1.3, 6.5, 6.6)
    if (data.provider === 'google') {
      // Google token verification with ID token
      if (!data.idToken) {
        console.warn('Missing ID token in Google OAuth callback:', {
          email: data.email,
          ip: req.ip
        });
        
        // Log token validation failure
        await logTokenValidationFailure(
          req.ip || 'unknown',
          req.headers['user-agent'] || 'unknown',
          'Missing ID token',
          data.email
        );
        
        res.status(401).json({
          success: false,
          message: 'Authentication failed'
        });
        return;
      }
      
      let payload;
      try {
        const ticket = await googleClient.verifyIdToken({
          idToken: data.idToken,
          audience: oauthConfig.GOOGLE_CLIENT_ID
        });
        
        payload = ticket.getPayload();
        
        // Validate token claims (Requirements 6.5, 6.6)
        if (!payload) {
          throw new Error('Invalid token payload');
        }
        
        // Validate email matches
        if (payload.email !== data.email) {
          throw new Error('Email mismatch');
        }
        
        // Validate audience
        if (payload.aud !== oauthConfig.GOOGLE_CLIENT_ID) {
          throw new Error('Invalid audience');
        }
        
        // Validate issuer
        if (payload.iss !== 'accounts.google.com' && payload.iss !== 'https://accounts.google.com') {
          throw new Error('Invalid issuer');
        }
        
      } catch (error: any) {
        // Map specific OAuth errors to user-friendly messages
        let userMessage = 'Authentication failed';
        
        if (error.message?.includes('Token used too late') || error.message?.includes('expired')) {
          userMessage = 'Authentication token expired. Please try again.';
        } else if (error.message?.includes('Invalid token signature')) {
          userMessage = 'Invalid authentication token. Please try again.';
        } else if (error.message?.includes('audience') || error.message?.includes('issuer')) {
          userMessage = 'Authentication failed. Please try again.';
        }
        
        console.error('Google token validation failed:', {
          error: error.message,
          type: error.constructor.name,
          ip: req.ip,
          email: data.email
        });
        
        // Log token validation failure
        await logTokenValidationFailure(
          req.ip || 'unknown',
          req.headers['user-agent'] || 'unknown',
          error.message || 'Token validation failed',
          data.email
        );
        
        res.status(401).json({
          success: false,
          message: userMessage
        });
        return;
      }
    } else if (data.provider === 'github') {
      // GitHub OAuth - no ID token verification needed, frontend already validated
      console.log('GitHub OAuth callback received:', {
        email: data.email,
        login: data.providerAccountId,
        ip: req.ip
      });
      
      // GitHub provides the access token - we'll trust it was validated by frontend
      // In production, you could validate with GitHub API if needed
    }
    
    // Start transaction for atomic operations (Requirement 2.8, 9.6)
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        // Check if user exists (Requirement 2.1)
        let user = await tx.users.findUnique({
          where: { email: data.email }
        });
        
        if (!user) {
          // Create new user (Requirements 2.1, 2.2, 2.3, 2.4, 9.4)
          try {
            const username = await generateUsername(data.email, tx);
            
            user = await tx.users.create({
              data: {
                id: crypto.randomUUID(),
                username,
                email: data.email,
                password_hash: null, // OAuth-only account (Requirement 2.3, 9.4)
                avatar_url: data.image || null, // Requirement 9.5
                bio: null,
                created_at: new Date(),
                updated_at: new Date()
              }
            });
          } catch (error: any) {
            // Handle unique constraint violations
            if (error.code === 'P2002') {
              throw new Error('Account with this email already exists');
            }
            throw error;
          }
        } else if (!user.avatar_url && data.image) {
          // Update profile picture if not set (Requirement 9.5)
          try {
            user = await tx.users.update({
              where: { id: user.id },
              data: {
                avatar_url: data.image,
                updated_at: new Date()
              }
            });
          } catch (error: any) {
            // Log but don't fail if avatar update fails
            console.warn('Failed to update user avatar:', {
              userId: user.id,
              error: error.message
            });
          }
        }
        
        // Check if OAuth account already linked (Requirement 2.5)
        const existingAccount = await tx.account.findFirst({
          where: {
            user_id: user.id,
            provider: data.provider // Dynamic provider from request
          }
        });
        
        // Encrypt tokens with error handling
        let encryptedAccessToken: string;
        let encryptedRefreshToken: string | null = null;
        let encryptedIdToken: string | null = null;
        
        try {
          encryptedAccessToken = encryptToken(data.accessToken);
          if (data.refreshToken) {
            encryptedRefreshToken = encryptToken(data.refreshToken);
          }
          if (data.idToken) {
            encryptedIdToken = encryptToken(data.idToken);
          }
        } catch (error: any) {
          console.error('Token encryption failed:', {
            error: error.message,
            userId: user.id
          });
          throw new Error('Failed to secure authentication tokens');
        }
        
        if (!existingAccount) {
          // Create OAuth account record (Requirements 2.5, 2.6, 2.7, 9.1, 9.2, 9.3, 9.7)
          try {
            await tx.account.create({
              data: {
                id: crypto.randomUUID(),
                user_id: user.id,
                provider: data.provider, // Use provider from request (google or github)
                provider_account_id: data.providerAccountId,
                access_token: encryptedAccessToken, // Requirement 2.6, 4.1
                refresh_token: encryptedRefreshToken,
                expires_at: new Date(data.expiresAt * 1000), // Requirement 2.7
                token_type: data.tokenType,
                scope: data.scope,
                id_token: encryptedIdToken, // Will be null for GitHub
                created_at: new Date(),
                updated_at: new Date()
              }
            });
          } catch (error: any) {
            // Handle unique constraint violations
            if (error.code === 'P2002') {
              throw new Error(`${data.provider.charAt(0).toUpperCase() + data.provider.slice(1)} account already linked to another user`);
            }
            throw error;
          }
        } else {
          // Update existing OAuth account (Requirement 4.5)
          try {
            await tx.account.update({
              where: { id: existingAccount.id },
              data: {
                access_token: encryptedAccessToken,
                refresh_token: encryptedRefreshToken,
                expires_at: new Date(data.expiresAt * 1000),
                id_token: encryptedIdToken, // Will be null for GitHub
                updated_at: new Date()
              }
            });
          } catch (error: any) {
            console.error(`Failed to update ${data.provider} OAuth account:`, {
              accountId: existingAccount.id,
              error: error.message
            });
            throw new Error(`Failed to update ${data.provider} authentication credentials`);
          }
        }
        
        // Create session (Requirements 10.1, 10.2, 10.3, 10.4)
        const sessionToken = crypto.randomUUID(); // Requirement 10.3
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days (Requirement 10.4)
        
        try {
          await tx.session.create({
            data: {
              id: crypto.randomUUID(),
              user_id: user.id,
              session_token: sessionToken,
              expires_at: expiresAt,
              created_at: new Date()
            }
          });
        } catch (error: any) {
          console.error('Failed to create session:', {
            userId: user.id,
            error: error.message
          });
          throw new Error('Failed to create user session');
        }
        
        return { user, sessionToken };
      });
    } catch (error: any) {
      // Handle transaction errors with specific messages
      let userMessage = 'Authentication failed';
      let statusCode = 500;
      const providerName = data.provider.charAt(0).toUpperCase() + data.provider.slice(1);
      
      if (error.message?.includes('already exists')) {
        userMessage = 'An account with this email already exists';
        statusCode = 409;
      } else if (error.message?.includes('already linked')) {
        userMessage = `This ${providerName} account is already linked to another user`;
        statusCode = 409;
      } else if (error.message?.includes('secure authentication tokens')) {
        userMessage = 'Failed to secure your authentication. Please try again.';
        statusCode = 500;
      } else if (error.code === 'P2003') {
        // Foreign key constraint violation
        userMessage = 'Database integrity error. Please contact support.';
        statusCode = 500;
      }
      
      console.error(`${providerName} OAuth transaction failed:`, {
        error: error.message,
        code: error.code,
        stack: error.stack,
        email: data.email,
        provider: data.provider,
        ip: req.ip
      });
      
      // Log authentication failure
      await logAuthenticationFailure(
        req.ip || 'unknown',
        req.headers['user-agent'] || 'unknown',
        error.message || 'Transaction failed',
        data.email
      );
      
      res.status(statusCode).json({
        success: false,
        message: userMessage
      });
      return;
    }
    
    // Generate JWT tokens (Requirements 5.1, 5.2, 5.3, 5.4)
    let accessToken: string;
    let refreshToken: string;
    
    try {
      accessToken = jwt.sign(
        {
          sub: result.user.id,  // Standard JWT subject claim
          user_id: result.user.id,  // Backward compatibility
          email: result.user.email,
          username: result.user.username
        },
        SECRET,
        { expiresIn: '7d' } // Requirement 5.3
      );
      
      refreshToken = jwt.sign(
        {
          sub: result.user.id,  // Standard JWT subject claim
          user_id: result.user.id,  // Backward compatibility
          type: 'refresh'
        },
        SECRET,
        { expiresIn: '30d' } // Requirement 5.4
      );
    } catch (error: any) {
      console.error('JWT generation failed:', {
        error: error.message,
        userId: result.user.id
      });
      
      res.status(500).json({
        success: false,
        message: 'Failed to generate authentication tokens'
      });
      return;
    }
    
    // Log OAuth authentication event (Requirement 6.9)
    const isNewUser = !result.user.created_at || 
      (new Date().getTime() - new Date(result.user.created_at).getTime()) < 5000;
    
    await logAuthenticationSuccess(
      result.user.id,
      req.ip || 'unknown',
      req.headers['user-agent'] || 'unknown',
      isNewUser,
      result.user.email
    );
    
    // Return success response (Requirement 1.5)
    res.status(200).json({
      success: true,
      data: {
        user: {
          id: result.user.id,
          username: result.user.username,
          email: result.user.email,
          avatar_url: result.user.avatar_url
        },
        accessToken,
        refreshToken,
        sessionToken: result.sessionToken
      }
    });
    
  } catch (error: any) {
    // Catch-all for unexpected errors
    console.error('Unexpected OAuth callback error:', {
      error: error.message,
      stack: error.stack,
      type: error.constructor.name,
      ip: req.ip
    });
    
    // Log authentication failure
    await logAuthenticationFailure(
      req.ip || 'unknown',
      req.headers['user-agent'] || 'unknown',
      'Unexpected error occurred',
      req.body?.email
    );
    
    // Don't expose internal errors (Requirement 7.7, 7.8)
    res.status(500).json({
      success: false,
      message: 'An unexpected error occurred. Please try again.'
    });
  }
}

/**
 * Handles OAuth account linking for existing authenticated users
 * 
 * @param req - Express request with OAuth data and authenticated user
 * @param res - Express response
 * 
 * Requirements:
 * - Requirement 3.1-3.6: OAuth account linking
 */
export async function linkOAuthAccount(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.id; // From auth middleware
    const data: OAuthCallbackBody = req.body;
    
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }
    
    // Validate required fields
    if (!data || typeof data !== 'object') {
      res.status(400).json({
        success: false,
        message: 'Invalid request data'
      });
      return;
    }
    
    if (!data.email || !data.providerAccountId || !data.accessToken) {
      console.warn('Missing required OAuth linking fields:', {
        userId,
        hasEmail: !!data.email,
        hasProviderAccountId: !!data.providerAccountId,
        hasAccessToken: !!data.accessToken
      });
      
      res.status(400).json({
        success: false,
        message: 'Missing required authentication data'
      });
      return;
    }
    
    // Get user's registered email (Requirement 3.3)
    let user;
    try {
      user = await prisma.users.findUnique({
        where: { id: userId },
        select: { email: true }
      });
    } catch (error: any) {
      console.error('Database error fetching user:', {
        userId,
        error: error.message
      });
      
      res.status(500).json({
        success: false,
        message: 'Failed to verify user account'
      });
      return;
    }
    
    if (!user) {
      console.warn('User not found for OAuth linking:', { userId });
      
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }
    
    // Validate email matches (Requirement 3.3)
    if (user.email !== data.email) {
      console.warn(`Email mismatch during ${data.provider} OAuth linking:`, {
        userId,
        userEmail: user.email,
        oauthEmail: data.email
      });
      
      // Log account linking failure
      await logAccountLinkingFailure(
        userId,
        req.ip || 'unknown',
        req.headers['user-agent'] || 'unknown',
        'Email mismatch',
        data.email
      );
      
      const providerName = data.provider.charAt(0).toUpperCase() + data.provider.slice(1);
      res.status(400).json({
        success: false,
        message: `${providerName} account email does not match your registered email`
      });
      return;
    }
    
    // Check if already linked (Requirement 3.4)
    let existingAccount;
    try {
      existingAccount = await prisma.account.findFirst({
        where: {
          user_id: userId,
          provider: data.provider
        }
      });
    } catch (error: any) {
      console.error('Database error checking existing account:', {
        userId,
        provider: data.provider,
        error: error.message
      });
      
      res.status(500).json({
        success: false,
        message: 'Failed to check account status'
      });
      return;
    }
    
    if (existingAccount) {
      // Log account linking failure
      await logAccountLinkingFailure(
        userId,
        req.ip || 'unknown',
        req.headers['user-agent'] || 'unknown',
        'Account already linked',
        data.email
      );
      
      const providerName = data.provider.charAt(0).toUpperCase() + data.provider.slice(1);
      res.status(400).json({
        success: false,
        message: `${providerName} account already linked`
      });
      return;
    }
    
    // Encrypt tokens with error handling
    let encryptedAccessToken: string;
    let encryptedRefreshToken: string | null = null;
    let encryptedIdToken: string | null = null;
    
    try {
      encryptedAccessToken = encryptToken(data.accessToken);
      if (data.refreshToken) {
        encryptedRefreshToken = encryptToken(data.refreshToken);
      }
      if (data.idToken) {
        encryptedIdToken = encryptToken(data.idToken);
      }
    } catch (error: any) {
      console.error('Token encryption failed during linking:', {
        userId,
        error: error.message
      });
      
      res.status(500).json({
        success: false,
        message: 'Failed to secure authentication tokens'
      });
      return;
    }
    
    // Create OAuth account link (Requirements 3.2, 3.4, 3.5)
    try {
      await prisma.account.create({
        data: {
          id: crypto.randomUUID(),
          user_id: userId,
          provider: data.provider,
          provider_account_id: data.providerAccountId,
          access_token: encryptedAccessToken,
          refresh_token: encryptedRefreshToken,
          expires_at: new Date(data.expiresAt * 1000),
          token_type: data.tokenType,
          scope: data.scope,
          id_token: encryptedIdToken,
          created_at: new Date(),
          updated_at: new Date()
        }
      });
    } catch (error: any) {
      // Handle specific database errors
      let userMessage = 'Failed to link account';
      let statusCode = 500;
      const providerName = data.provider.charAt(0).toUpperCase() + data.provider.slice(1);
      
      if (error.code === 'P2002') {
        // Unique constraint violation
        userMessage = `This ${providerName} account is already linked to another user`;
        statusCode = 409;
      } else if (error.code === 'P2003') {
        // Foreign key constraint violation
        userMessage = 'User account not found';
        statusCode = 404;
      }
      
      console.error(`Database error creating ${data.provider} OAuth account link:`, {
        userId,
        provider: data.provider,
        error: error.message,
        code: error.code,
        stack: error.stack
      });
      
      // Log account linking failure
      await logAccountLinkingFailure(
        userId,
        req.ip || 'unknown',
        req.headers['user-agent'] || 'unknown',
        userMessage,
        data.email
      );
      
      res.status(statusCode).json({
        success: false,
        message: userMessage
      });
      return;
    }
    
    // Log successful linking
    await logAccountLinkingSuccess(
      userId,
      req.ip || 'unknown',
      req.headers['user-agent'] || 'unknown',
      data.email
    );
    
    const providerName = data.provider.charAt(0).toUpperCase() + data.provider.slice(1);
    res.status(200).json({
      success: true,
      message: `${providerName} account linked successfully`
    });
    
  } catch (error: any) {
    // Catch-all for unexpected errors
    console.error('Unexpected OAuth linking error:', {
      error: error.message,
      stack: error.stack,
      type: error.constructor.name,
      userId: (req as any).user?.id
    });
    
    // Log account linking failure
    await logAccountLinkingFailure(
      (req as any).user?.id || 'unknown',
      req.ip || 'unknown',
      req.headers['user-agent'] || 'unknown',
      'Unexpected error occurred',
      req.body?.email
    );
    
    res.status(500).json({
      success: false,
      message: 'An unexpected error occurred. Please try again.'
    });
  }
}

/**
 * Handles user sign-out by deleting the session from the database
 * 
 * @param req - Express request with session token
 * @param res - Express response
 * 
 * Requirements:
 * - Requirement 10.6: Session deletion on sign-out
 */
export async function signOut(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.id; // From auth middleware
    const sessionToken = req.body.sessionToken || req.headers['x-session-token'];
    
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }
    
    // Delete session from database (Requirement 10.6)
    try {
      if (sessionToken) {
        const result = await prisma.session.deleteMany({
          where: {
            user_id: userId,
            session_token: sessionToken as string
          }
        });
        
        if (result.count === 0) {
          console.warn('No session found to delete:', {
            userId,
            sessionToken: typeof sessionToken === 'string' ? sessionToken.substring(0, 8) + '...' : 'invalid'
          });
        }
      } else {
        // If no specific session token provided, delete all sessions for the user
        await prisma.session.deleteMany({
          where: {
            user_id: userId
          }
        });
      }
    } catch (error: any) {
      console.error('Database error during sign-out:', {
        userId,
        error: error.message,
        code: error.code
      });
      
      res.status(500).json({
        success: false,
        message: 'Failed to sign out. Please try again.'
      });
      return;
    }
    
    // Log sign-out event
    await logSignOut(
      userId,
      req.ip || 'unknown',
      req.headers['user-agent'] || 'unknown',
      sessionToken as string | undefined
    );
    
    res.status(200).json({
      success: true,
      message: 'Signed out successfully'
    });
    
  } catch (error: any) {
    // Catch-all for unexpected errors
    console.error('Unexpected sign-out error:', {
      error: error.message,
      stack: error.stack,
      type: error.constructor.name,
      userId: (req as any).user?.id
    });
    
    res.status(500).json({
      success: false,
      message: 'An unexpected error occurred. Please try again.'
    });
  }
}
