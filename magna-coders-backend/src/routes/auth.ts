import express, { Router } from 'express';
import {
  register,
  login,
  getUserProfile,
  updateUserProfile,
  uploadProfilePicture,
  refreshToken,
  validateToken,
  handleOAuthCallback,
  linkOAuthAccount,
  signOut,
  requestPasswordReset,
  verifyAndResetPassword,
  changePassword
} from '../controllers/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticateToken } from '../middleware/auth';
import { upload } from '../services/fileUpload';
import rateLimit from 'express-rate-limit';

// OAuth rate limiter: 5 requests per 15 minutes per IP
const oauthRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
  // Remove custom keyGenerator to use default (handles IPv6 correctly)
});

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         id:
 *           type: string
 *           description: The auto-generated id of the user
 *         email:
 *           type: string
 *           description: User email address
 *         password:
 *           type: string
 *           description: User password
 *         name:
 *           type: string
 *           description: User's full name
 *         profilePicture:
 *           type: string
 *           description: URL to user's profile picture
 *         bio:
 *           type: string
 *           description: User's biography
 *     AuthResponse:
 *       type: object
 *       properties:
 *         token:
 *           type: string
 *           description: JWT authentication token
 *         user:
 *           $ref: '#/components/schemas/User'
 */

const router: Router = express.Router();

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login a user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - identifier
 *               - password
 *             properties:
 *               identifier:
 *                 type: string
 *                 description: Email, phone number or username
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       401:
 *         description: Invalid credentials
 *       500:
 *         description: Server error
 */
router.post('/login', asyncHandler(login));

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token using a refresh token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: JWT refresh token received from login or previous refresh
 *     responses:
 *       200:
 *         description: New access token and refresh token issued successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                       description: New JWT access token (7 days expiry)
 *                     refreshToken:
 *                       type: string
 *                       description: New JWT refresh token (30 days expiry)
 *                     expiresIn:
 *                       type: number
 *                       description: Access token expiry in seconds (604800 = 7 days)
 *                     tokenType:
 *                       type: string
 *                       example: Bearer
 *       400:
 *         description: Refresh token is required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 code:
 *                   type: string
 *                   example: MISSING_REFRESH_TOKEN
 *       401:
 *         description: Invalid, expired, or malformed refresh token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                   example: Refresh token has expired. Please log in again.
 *                 code:
 *                   type: string
 *                   example: REFRESH_TOKEN_EXPIRED
 *       500:
 *         description: Server error
 */
router.post('/refresh', asyncHandler(refreshToken));

/**
 * @swagger
 * /api/auth/validate:
 *   get:
 *     summary: Validate if access token is valid and not expired
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema: {}
 *     responses:
 *       200:
 *         description: Token is valid and not expired
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Token is valid
 *                 data:
 *                   type: object
 *                   properties:
 *                     isValid:
 *                       type: boolean
 *                       example: true
 *                     isExpired:
 *                       type: boolean
 *                       example: false
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *                       description: ISO timestamp when token expires
 *                     userId:
 *                       type: string
 *                       description: User UUID
 *                     email:
 *                       type: string
 *                     username:
 *                       type: string
 *                     tokenType:
 *                       type: string
 *                       enum: [access, refresh]
 *       400:
 *         description: Authorization header is missing or malformed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 code:
 *                   type: string
 *                   example: MISSING_TOKEN
 *       401:
 *         description: Token is invalid or expired
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                   example: Token has expired
 *                 code:
 *                   type: string
 *                   example: TOKEN_EXPIRED
 *                 data:
 *                   type: object
 *                   properties:
 *                     isValid:
 *                       type: boolean
 *                       example: false
 *                     isExpired:
 *                       type: boolean
 *                       example: true
 *       500:
 *         description: Server error during token validation
 */
router.get('/validate', asyncHandler(validateToken));

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - username
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               username:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Invalid input
 *       409:
 *         description: User already exists
 *       500:
 *         description: Server error
 */
router.post('/register', asyncHandler(register));

/**
 * @swagger
 * /api/auth/profile/{id}:
 *   get:
 *     summary: Get user profile
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: User ID
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       404:
 *         description: User not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/profile/:id', authenticateToken, asyncHandler(getUserProfile));

/**
 * @swagger
 * /api/auth/profile/{id}:
 *   put:
 *     summary: Update user profile
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               profilePicture:
 *                 type: string
 *               bio:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       404:
 *         description: User not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.put('/profile/:id', authenticateToken, asyncHandler(updateUserProfile));

/**
 * @swagger
 * /api/auth/profile/upload-picture:
 *   post:
 *     summary: Upload profile picture
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Profile picture uploaded successfully
 *       400:
 *         description: No file uploaded
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post('/profile/upload-picture', authenticateToken, upload.single('file'), asyncHandler(uploadProfilePicture));

/**
 * @swagger
 * /api/auth/oauth/callback:
 *   post:
 *     summary: Handle OAuth callback authentication (Google or GitHub)
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - provider
 *               - providerAccountId
 *               - accessToken
 *               - expiresAt
 *               - tokenType
 *               - scope
 *               - email
 *               - name
 *             properties:
 *               provider:
 *                 type: string
 *                 enum: [google, github]
 *                 description: OAuth provider (google or github)
 *                 example: google
 *               providerAccountId:
 *                 type: string
 *                 description: User ID from OAuth provider
 *               accessToken:
 *                 type: string
 *                 description: OAuth access token
 *               refreshToken:
 *                 type: string
 *                 description: OAuth refresh token (optional)
 *               expiresAt:
 *                 type: number
 *                 description: Token expiration timestamp (seconds)
 *               tokenType:
 *                 type: string
 *                 description: Token type (usually 'Bearer')
 *                 example: Bearer
 *               scope:
 *                 type: string
 *                 description: OAuth scopes granted
 *               idToken:
 *                 type: string
 *                 description: ID token from provider (required for Google, not used for GitHub)
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User email address
 *               name:
 *                 type: string
 *                 description: User's name
 *               image:
 *                 type: string
 *                 format: url
 *                 description: User's profile picture URL (optional)
 *     responses:
 *       200:
 *         description: OAuth authentication successful, user created/updated and session established
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         username:
 *                           type: string
 *                         email:
 *                           type: string
 *                         avatar_url:
 *                           type: string
 *                     accessToken:
 *                       type: string
 *                       description: JWT access token
 *                     refreshToken:
 *                       type: string
 *                       description: JWT refresh token
 *                     sessionToken:
 *                       type: string
 *                       description: Session token for server-side session management
 *       400:
 *         description: Invalid provider, missing required fields, or email mismatch
 *       401:
 *         description: Token validation failed or invalid credentials
 *       409:
 *         description: Account email already exists or account already linked
 *       429:
 *         description: Too many authentication attempts
 *       500:
 *         description: Server error or authentication service unavailable
 */
router.post('/oauth/callback', oauthRateLimiter, asyncHandler(handleOAuthCallback));

/**
 * @swagger
 * /api/auth/oauth/link:
 *   post:
 *     summary: Link OAuth account (Google or GitHub) to existing user account
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - provider
 *               - providerAccountId
 *               - accessToken
 *               - expiresAt
 *               - tokenType
 *               - scope
 *               - email
 *             properties:
 *               provider:
 *                 type: string
 *                 enum: [google, github]
 *                 description: OAuth provider to link
 *               providerAccountId:
 *                 type: string
 *                 description: User ID from OAuth provider
 *               accessToken:
 *                 type: string
 *                 description: OAuth access token
 *               refreshToken:
 *                 type: string
 *                 description: OAuth refresh token (optional)
 *               expiresAt:
 *                 type: number
 *                 description: Token expiration timestamp (seconds)
 *               tokenType:
 *                 type: string
 *                 description: Token type (usually 'Bearer')
 *               scope:
 *                 type: string
 *                 description: OAuth scopes granted
 *               idToken:
 *                 type: string
 *                 description: ID token from provider (required for Google, not used for GitHub)
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email address from OAuth provider must match registered email
 *     responses:
 *       200:
 *         description: Account linked successfully
 *       400:
 *         description: Email mismatch, already linked, or invalid request
 *       401:
 *         description: Authentication required
 *       404:
 *         description: User not found
 *       429:
 *         description: Too many authentication attempts
 *       500:
 *         description: Failed to link account
 */
router.post('/oauth/link', authenticateToken, oauthRateLimiter, asyncHandler(linkOAuthAccount));

/**
 * @swagger
 * /api/auth/signout:
 *   post:
 *     summary: Sign out user and delete session
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sessionToken:
 *                 type: string
 *                 description: Specific session token to delete (optional, deletes all sessions if not provided)
 *     responses:
 *       200:
 *         description: Signed out successfully
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Failed to sign out
 */
router.post('/signout', authenticateToken, asyncHandler(signOut));

/**
 * @swagger
 * /api/auth/password/request-reset:
 *   post:
 *     summary: Request password reset - sends reset link to email
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email address associated with the account
 *     responses:
 *       200:
 *         description: Password reset email sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 code:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     resetToken:
 *                       type: string
 *                       description: Reset token (for development only - in production send via email)
 *       400:
 *         description: Invalid email or missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 code:
 *                   type: string
 *       500:
 *         description: Server error
 */
router.post('/password/request-reset', asyncHandler(requestPasswordReset));

/**
 * @swagger
 * /api/auth/password/reset:
 *   post:
 *     summary: Reset password using reset token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - resetToken
 *               - newPassword
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email address associated with the account
 *               resetToken:
 *                 type: string
 *                 description: Password reset token from email
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *                 description: New password (minimum 8 characters)
 *     responses:
 *       200:
 *         description: Password reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     email:
 *                       type: string
 *       400:
 *         description: Invalid input or weak password
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 code:
 *                   type: string
 *       401:
 *         description: Invalid or expired reset token
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.post('/password/reset', asyncHandler(verifyAndResetPassword));

/**
 * @swagger
 * /api/auth/password/change:
 *   post:
 *     summary: Change password for authenticated user
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 description: Current password for verification
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *                 description: New password (minimum 8 characters, must be different from current)
 *     responses:
 *       200:
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *       400:
 *         description: Invalid input or weak password
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 code:
 *                   type: string
 *       401:
 *         description: Invalid current password or authentication required
 *       500:
 *         description: Server error
 */
router.post('/password/change', authenticateToken, asyncHandler(changePassword));

export default router;