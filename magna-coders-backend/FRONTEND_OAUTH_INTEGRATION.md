# Frontend OAuth Integration Guide

This guide provides step-by-step instructions for integrating Google and GitHub OAuth authentication in your frontend application.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [OAuth Setup](#oauth-setup)
4. [Backend API Endpoints](#backend-api-endpoints)
5. [Frontend Implementation](#frontend-implementation)
6. [Google OAuth Integration](#google-oauth-integration)
7. [GitHub OAuth Integration](#github-oauth-integration)
8. [Token Management](#token-management)
9. [Error Handling](#error-handling)
10. [Security Best Practices](#security-best-practices)

---

## Overview

The application supports OAuth 2.0 authentication through two providers:
- **Google** - Uses ID tokens for secure verification
- **GitHub** - Uses access tokens for API integration

Both providers follow the same frontend-to-backend flow:
1. User authenticates with OAuth provider on frontend
2. Frontend obtains OAuth tokens and user info from provider
3. Frontend sends OAuth data to backend `/api/auth/oauth/callback`
4. Backend verifies tokens, creates/updates user, returns JWT tokens
5. Frontend stores JWT for subsequent API requests

---

## Prerequisites

### Frontend Dependencies

Install required OAuth libraries:

```bash
# For React applications
npm install @react-oauth/google                    # Google OAuth
npm install @react-oauth/oauth2                    # General OAuth 2.0
npm install js-cookie                              # Cookie management
npm install axios                                  # HTTP client

# Or with yarn
yarn add @react-oauth/google js-cookie axios

# Or with pnpm
pnpm add @react-oauth/google js-cookie axios
```

### Environment Variables

Create a `.env` file in your frontend root directory:

```env
# Google OAuth
VITE_GOOGLE_CLIENT_ID=your_google_client_id_here
REACT_APP_GOOGLE_CLIENT_ID=your_google_client_id_here

# GitHub OAuth
VITE_GITHUB_CLIENT_ID=your_github_client_id_here
REACT_APP_GITHUB_CLIENT_ID=your_github_client_id_here

# Backend API
VITE_API_URL=http://localhost:5000/api
REACT_APP_API_URL=http://localhost:5000/api
```

---

## OAuth Setup

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable **Google+ API**
4. Go to **Credentials** (left sidebar)
5. Click **Create Credentials** > **OAuth Client ID**
6. Select **Web Application**
7. Add authorized JavaScript origins:
   ```
   http://localhost:3000
   http://localhost:5173 (Vite default)
   https://yourdomain.com
   ```
8. Add authorized redirect URIs:
   ```
   http://localhost:3000/auth/callback
   http://localhost:5173/auth/callback
   https://yourdomain.com/auth/callback
   ```
9. Copy **Client ID** and save to `.env`

### GitHub OAuth Setup

1. Go to [GitHub Settings](https://github.com/settings/developers)
2. Click **OAuth Apps** > **New OAuth App**
3. Fill in application details:
   - **Application name**: Your App Name
   - **Homepage URL**: `http://localhost:3000` (or your domain)
   - **Authorization callback URL**: `http://localhost:3000/auth/callback`
4. Copy **Client ID** to `.env`
5. Generate and copy **Client Secret** (keep secure!)

---

## Backend API Endpoints

### OAuth Callback - Create/Update User

**Endpoint**: `POST /api/auth/oauth/callback`

**Rate Limited**: Yes (5 requests per 15 minutes per IP)

**Request Body**:
```typescript
{
  provider: "google" | "github",           // Required
  providerAccountId: string,               // Required: User ID from provider
  accessToken: string,                     // Required: OAuth access token
  refreshToken?: string,                   // Optional: Refresh token
  expiresAt: number,                       // Required: Expiration in seconds
  tokenType: string,                       // Required: Usually "Bearer"
  scope: string,                           // Required: OAuth scopes
  idToken?: string,                        // Optional: Required for Google
  email: string,                           // Required: User email
  name: string,                            // Required: User full name
  image?: string                           // Optional: Profile picture URL
}
```

**Success Response (200)**:
```typescript
{
  success: true,
  data: {
    user: {
      id: string,                          // User UUID
      username: string,                    // Generated username
      email: string,
      avatar_url: string | null
    },
    accessToken: string,                   // JWT access token (7d expiry)
    refreshToken: string,                  // JWT refresh token (30d expiry)
    sessionToken: string                   // Session token for server tracking
  }
}
```

**Error Responses**:
- **400** - Invalid provider, missing fields, email mismatch
- **401** - Token validation failed
- **409** - Account already exists or already linked
- **429** - Too many requests
- **500** - Server error

---

### Link OAuth Account - Connect to Existing User

**Endpoint**: `POST /api/auth/oauth/link`

**Authentication**: Required (Bearer token)

**Rate Limited**: Yes (5 requests per 15 minutes per IP)

**Request Body**: Same as `/oauth/callback`

**Success Response (200)**:
```typescript
{
  success: true,
  message: "Google account linked successfully" // or "GitHub account linked successfully"
}
```

**Error Responses**:
- **400** - Email mismatch, already linked
- **401** - Authentication required
- **404** - User not found
- **429** - Too many requests
- **500** - Failed to link

---

### Request Password Reset

**Endpoint**: `POST /api/auth/password/request-reset`

**Request Body**:
```typescript
{
  email: string                            // Required: User email
}
```

**Response (200)**:
```typescript
{
  success: true,
  message: "If an account exists with this email, a password reset link has been sent",
  data: {
    resetToken?: string                    // For development only
  }
}
```

---

## Frontend Implementation

### 1. Create OAuth Service

Create `src/services/authService.ts`:

```typescript
import axios from 'axios';
import Cookies from 'js-cookie';

const API_URL = process.env.VITE_API_URL || 'http://localhost:5000/api';

interface OAuthData {
  provider: 'google' | 'github';
  providerAccountId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  tokenType: string;
  scope: string;
  idToken?: string;
  email: string;
  name: string;
  image?: string;
}

interface OAuthResponse {
  success: boolean;
  data: {
    user: {
      id: string;
      username: string;
      email: string;
      avatar_url?: string;
    };
    accessToken: string;
    refreshToken: string;
    sessionToken: string;
  };
}

class AuthService {
  private apiClient = axios.create({
    baseURL: API_URL,
    headers: {
      'Content-Type': 'application/json'
    }
  });

  /**
   * Authenticate user with OAuth provider
   */
  async authenticateWithOAuth(oauthData: OAuthData): Promise<OAuthResponse> {
    try {
      const response = await this.apiClient.post<OAuthResponse>(
        '/auth/oauth/callback',
        oauthData
      );

      // Store tokens in secure storage
      this.storeTokens(response.data.data);

      return response.data;
    } catch (error: any) {
      throw this.handleOAuthError(error);
    }
  }

  /**
   * Link OAuth account to existing authenticated user
   */
  async linkOAuthAccount(oauthData: OAuthData): Promise<any> {
    try {
      const accessToken = this.getAccessToken();
      const response = await this.apiClient.post(
        '/auth/oauth/link',
        oauthData,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      return response.data;
    } catch (error: any) {
      throw this.handleOAuthError(error);
    }
  }

  /**
   * Store auth tokens securely
   */
  private storeTokens(data: {
    user: any;
    accessToken: string;
    refreshToken: string;
    sessionToken: string;
  }): void {
    // Store in HttpOnly cookie (most secure) or secure localStorage
    Cookies.set('accessToken', data.accessToken, {
      secure: true,        // Only sent over HTTPS
      sameSite: 'strict',  // CSRF protection
      path: '/'
    });

    Cookies.set('refreshToken', data.refreshToken, {
      secure: true,
      sameSite: 'strict',
      path: '/',
      expires: 30         // 30 days
    });

    Cookies.set('sessionToken', data.sessionToken, {
      secure: true,
      sameSite: 'strict',
      path: '/'
    });

    // Store user info in localStorage
    localStorage.setItem('user', JSON.stringify(data.user));
  }

  /**
   * Get stored access token
   */
  getAccessToken(): string | null {
    return Cookies.get('accessToken') || null;
  }

  /**
   * Get stored user info
   */
  getUser(): any | null {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  }

  /**
   * Clear all auth tokens and user info
   */
  logout(): void {
    Cookies.remove('accessToken');
    Cookies.remove('refreshToken');
    Cookies.remove('sessionToken');
    localStorage.removeItem('user');
  }

  /**
   * Handle OAuth errors with user-friendly messages
   */
  private handleOAuthError(error: any): Error {
    if (error.response?.status === 400) {
      const message = error.response.data?.message || 'Invalid authentication data';
      return new Error(message);
    }
    
    if (error.response?.status === 401) {
      return new Error('Authentication failed. Please try again.');
    }
    
    if (error.response?.status === 409) {
      const message = error.response.data?.message || 'Account already exists or linked';
      return new Error(message);
    }
    
    if (error.response?.status === 429) {
      return new Error('Too many authentication attempts. Please try again later.');
    }

    return error;
  }
}

export default new AuthService();
```

---

## Google OAuth Integration

### 1. Install Google OAuth Library

```bash
npm install @react-oauth/google
```

### 2. Set Up Google OAuth Provider

In your main App component or root component (`src/App.tsx`):

```typescript
import { GoogleOAuthProvider } from '@react-oauth/google';
import { BrowserRouter } from 'react-router-dom';
import Dashboard from './pages/Dashboard';

function App() {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    </GoogleOAuthProvider>
  );
}

export default App;
```

### 3. Create Google Login Button Component

Create `src/components/GoogleLoginButton.tsx`:

```typescript
import { useGoogleLogin } from '@react-oauth/google';
import { useState } from 'react';
import authService from '../services/authService';

interface GoogleLoginButtonProps {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export function GoogleLoginButton({ onSuccess, onError }: GoogleLoginButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const googleLogin = useGoogleLogin({
    onSuccess: async (codeResponse) => {
      setIsLoading(true);
      setError(null);

      try {
        // Decode the JWT to get user info
        const token = codeResponse.access_token;
        const response = await fetch(
          `https://www.googleapis.com/oauth2/v1/userinfo?access_token=${token}`
        );
        const googleUser = await response.json();

        // Send OAuth data to backend
        const result = await authService.authenticateWithOAuth({
          provider: 'google',
          providerAccountId: googleUser.id,
          accessToken: token,
          expiresAt: codeResponse.expires_in,
          tokenType: 'Bearer',
          scope: codeResponse.scope,
          idToken: codeResponse.id_token,
          email: googleUser.email,
          name: googleUser.name,
          image: googleUser.picture
        });

        console.log('✓ Logged in:', result.data.user);
        onSuccess?.();
      } catch (err: any) {
        const errorMessage = err.message || 'Google login failed';
        setError(errorMessage);
        onError?.(err);
      } finally {
        setIsLoading(false);
      }
    },
    onError: () => {
      const errorMessage = 'Google login failed';
      setError(errorMessage);
      onError?.(new Error(errorMessage));
    },
    flow: 'implicit', // or 'auth-code' for server-side verification
    access_type: 'offline' // Gets refresh token
  });

  return (
    <div>
      <button
        onClick={() => googleLogin()}
        disabled={isLoading}
        className="btn btn-google"
      >
        {isLoading ? 'Signing in...' : 'Continue with Google'}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
```

---

## GitHub OAuth Integration

### 1. Create GitHub Login Button Component

Create `src/components/GitHubLoginButton.tsx`:

```typescript
import { useState, useEffect } from 'react';
import authService from '../services/authService';

interface GitHubLoginButtonProps {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export function GitHubLoginButton({ onSuccess, onError }: GitHubLoginButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGitHubLogin = () => {
    const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID;
    const redirectUri = `${window.location.origin}/auth/github/callback`;
    const scope = 'user:email';

    // Redirect to GitHub authorization
    const authUrl = `https://github.com/login/oauth/authorize?` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${encodeURIComponent(scope)}`;

    window.location.href = authUrl;
  };

  return (
    <div>
      <button
        onClick={handleGitHubLogin}
        disabled={isLoading}
        className="btn btn-github"
      >
        {isLoading ? 'Signing in...' : 'Continue with GitHub'}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

/**
 * GitHub Callback Handler Component
 * Place this at your redirect URI path (e.g., /auth/github/callback)
 */
export function GitHubAuthCallback() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get authorization code from URL
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');

        if (!code) {
          throw new Error('No authorization code received');
        }

        // Exchange code for token via backend (you need to create this endpoint)
        const response = await fetch('/api/auth/github/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code })
        });

        if (!response.ok) {
          throw new Error('Failed to exchange authorization code');
        }

        const tokenData = await response.json();

        // Get GitHub user info
        const userResponse = await fetch('https://api.github.com/user', {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            Accept: 'application/vnd.github.v3+json'
          }
        });

        const githubUser = await userResponse.json();

        // Get user email
        let email = githubUser.email;
        if (!email) {
          const emailResponse = await fetch('https://api.github.com/user/emails', {
            headers: {
              Authorization: `Bearer ${tokenData.access_token}`,
              Accept: 'application/vnd.github.v3+json'
            }
          });
          const emails = await emailResponse.json();
          email = emails.find((e: any) => e.primary)?.email || emails[0]?.email;
        }

        if (!email) {
          throw new Error('Unable to fetch email from GitHub');
        }

        // Send to backend OAuth callback
        const result = await authService.authenticateWithOAuth({
          provider: 'github',
          providerAccountId: githubUser.id.toString(),
          accessToken: tokenData.access_token,
          expiresAt: tokenData.expires_in || 3600,
          tokenType: 'Bearer',
          scope: 'user:email',
          email: email,
          name: githubUser.name || githubUser.login,
          image: githubUser.avatar_url
        });

        console.log('✓ GitHub login successful:', result.data.user);
        // Redirect to dashboard or home
        window.location.href = '/dashboard';
      } catch (err: any) {
        setError(err.message || 'GitHub authentication failed');
      } finally {
        setIsLoading(false);
      }
    };

    handleCallback();
  }, []);

  if (isLoading) {
    return <div>Authenticating with GitHub...</div>;
  }

  return error ? <div className="error">{error}</div> : null;
}
```

### 2. Backend GitHub Token Exchange Endpoint (Optional)

If you want to handle token exchange on the backend for added security, create this endpoint:

```typescript
// In your auth routes
router.post('/github/token', asyncHandler(async (req: Request, res: Response) => {
  const { code } = req.body;
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  try {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code
      })
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error_description || 'Failed to get access token');
    }

    res.json({
      access_token: data.access_token,
      expires_in: data.expires_in || 3600,
      token_type: data.token_type || 'Bearer'
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
}));
```

---

## Token Management

### 1. Refresh Token Endpoint

**POST `/api/auth/refresh`** - Get new access token using refresh token

**Request**:
```typescript
{
  refreshToken: string  // Your current refresh token JWT
}
```

**Success Response (200)**:
```typescript
{
  success: true,
  message: "Token refreshed successfully",
  data: {
    accessToken: string;      // New JWT access token (expires in 7 days)
    refreshToken: string;     // New JWT refresh token (expires in 30 days)
    expiresIn: 604800;        // Seconds until access token expires (7 days)
    tokenType: "Bearer";
  }
}
```

**Error Responses**:
- `400 MISSING_REFRESH_TOKEN` - No refresh token provided
- `401 REFRESH_TOKEN_EXPIRED` - Refresh token has expired (must login again)
- `401 INVALID_TOKEN_SIGNATURE` - Refresh token signature is invalid
- `401 INVALID_TOKEN_TYPE` - Token is not a refresh token
- `401 USER_NOT_FOUND` - User account no longer exists

**Usage in your auth service**:
```typescript
async refreshAccessToken(): Promise<string> {
  try {
    const refreshToken = Cookies.get('refreshToken');
    
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await axios.post(`${API_URL}/auth/refresh`, {
      refreshToken
    });

    // Store new tokens
    const { accessToken, refreshToken: newRefreshToken } = response.data.data;
    Cookies.set('accessToken', accessToken, { secure: true, httpOnly: false });
    Cookies.set('refreshToken', newRefreshToken, { secure: true, httpOnly: false });
    
    // Update in-memory token
    this.accessToken = accessToken;
    this.refreshToken = newRefreshToken;

    return accessToken;
  } catch (error: any) {
    console.error('Token refresh failed:', error);
    
    // If refresh fails, user needs to log in again
    this.logout();
    window.location.href = '/login';
    
    throw error;
  }
}
```

### 2. Validate Token Endpoint

**GET `/api/auth/validate`** - Check if access token is valid

**Headers Required**:
```
Authorization: Bearer {accessToken}
```

**Success Response (200)** - Token is valid:
```typescript
{
  success: true,
  message: "Token is valid",
  data: {
    isValid: true,
    isExpired: false,
    expiresAt: "2026-03-08T17:29:03.318Z",  // ISO 8601 timestamp
    userId: "550e8400-e29b-41d4-a716-446655440000",
    email: "user@example.com",
    username: "username_123",
    tokenType: "access"
  }
}
```

**Error Response (401)** - Token is expired:
```typescript
{
  success: false,
  message: "Token has expired",
  code: "TOKEN_EXPIRED",
  data: {
    isValid: false,
    isExpired: true
  }
}
```

**Error Response (401)** - Token signature is invalid:
```typescript
{
  success: false,
  message: "Token signature is invalid",
  code: "INVALID_TOKEN_SIGNATURE",
  data: {
    isValid: false,
    isExpired: false
  }
}
```

**Error Response (400)** - No token provided:
```typescript
{
  success: false,
  message: "No token provided",
  code: "MISSING_TOKEN"
}
```

**Usage in your auth service**:
```typescript
async validateToken(): Promise<{
  isValid: boolean;
  isExpired: boolean;
  expiresAt?: string;
}> {
  try {
    const accessToken = this.getAccessToken();
    
    if (!accessToken) {
      return { isValid: false, isExpired: false };
    }

    const response = await axios.get(`${API_URL}/auth/validate`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    const { isValid, isExpired, expiresAt } = response.data.data;
    return { isValid, isExpired, expiresAt };
  } catch (error: any) {
    if (error.response?.status === 401) {
      const data = error.response.data?.data;
      
      if (data?.isExpired) {
        // Token expired, try to refresh it
        try {
          await this.refreshAccessToken();
          return { isValid: true, isExpired: false };
        } catch {
          // Refresh failed, need to login
          this.logout();
          return { isValid: false, isExpired: true };
        }
      }
    }
    
    return { isValid: false, isExpired: false };
  }
}
```

### 3. Add Request Interceptor

Update your API client to automatically include auth token and handle refreshes:

```typescript
// In authService.ts
private apiClient = axios.create({
  baseURL: API_URL
});

// Add request interceptor to include auth token
this.apiClient.interceptors.request.use(
  (config) => {
    const token = this.getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Add response interceptor to handle token expiration and refresh
this.apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If 401 (Unauthorized) and haven't retried yet, try to refresh token
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      // Check if it's a token expiration error
      const errorCode = error.response?.data?.code;
      if (errorCode === 'TOKEN_EXPIRED' || errorCode === 'INVALID_TOKEN') {
        try {
          // Attempt to refresh the token
          const newAccessToken = await this.refreshAccessToken();
          
          // Update the original request with new token
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          
          // Retry the original request with new token
          return this.apiClient(originalRequest);
        } catch (refreshError) {
          // Refresh failed, logout user and redirect to login
          console.error('Token refresh failed:', refreshError);
          this.logout();
          window.location.href = '/login';
          return Promise.reject(refreshError);
        }
      }
    }

    return Promise.reject(error);
  }
);
```

### 4. Validate Token on App Load

Check token validity when app initializes:

```typescript
// In useEffect hook in your main component (App.tsx or Dashboard.tsx)
useEffect(() => {
  const validateAndRefreshToken = async () => {
    try {
      const validation = await authService.validateToken();
      
      if (!validation.isValid || validation.isExpired) {
        // Token invalid or expired, try to refresh
        try {
          const newToken = await authService.refreshAccessToken();
          console.log('Token refreshed successfully');
        } catch {
          // Refresh failed, redirect to login
          console.error('Token validation failed, redirecting to login');
          window.location.href = '/login';
        }
      } else if (validation.expiresAt) {
        // Token is valid, check if it expires soon (within 3 days)
        const expiresAt = new Date(validation.expiresAt);
        const daysUntilExpiry = (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
        
        if (daysUntilExpiry < 3) {
          // Proactively refresh token before it expires
          console.log(`Token expires in ${daysUntilExpiry.toFixed(1)} days, refreshing...`);
          try {
            await authService.refreshAccessToken();
          } catch (error) {
            console.error('Proactive token refresh failed:', error);
          }
        }
      }
    } catch (error) {
      console.error('Token validation error:', error);
    }
  };

  validateAndRefreshToken();
  
  // Set interval to validate token periodically (every hour)
  const interval = setInterval(validateAndRefreshToken, 60 * 60 * 1000);
  
  return () => clearInterval(interval);
}, []);
```

### 5. Logout Functionality

```typescript
const handleLogout = async () => {
  try {
    // Notify backend of session termination
    const sessionToken = Cookies.get('sessionToken');
    const accessToken = this.getAccessToken();
    
    if (accessToken) {
      await this.apiClient.post(
        '/auth/signout',
        { sessionToken },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );
    }
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    // Clear local storage
    this.logout();
    window.location.href = '/login';
  }
};
```

---

## Error Handling

### Handle Common OAuth Errors

```typescript
const handleOAuthError = (error: Error) => {
  console.error('OAuth Error:', error.message);

  if (error.message.includes('already exists')) {
    alert('This account is already registered. Please log in instead.');
  } else if (error.message.includes('already linked')) {
    alert('This account is already connected to your profile.');
  } else if (error.message.includes('email mismatch')) {
    alert('Account email does not match. Please use a different account.');
  } else if (error.message.includes('Too many')) {
    alert('Too many login attempts. Please try again later.');
  } else {
    alert('Authentication failed. Please try again.');
  }
};
```

### Handle Token Management Errors

```typescript
const handleTokenError = (error: any) => {
  const errorCode = error.response?.data?.code;
  const status = error.response?.status;

  console.error(`Token Error [${errorCode}]:`, error.message);

  switch (errorCode) {
    case 'MISSING_REFRESH_TOKEN':
      console.error('No refresh token available - user must login again');
      // Redirect to login
      window.location.href = '/login';
      break;

    case 'REFRESH_TOKEN_EXPIRED':
      console.error('Refresh token has expired - session is no longer valid');
      // Clear tokens and redirect to login
      authService.logout();
      window.location.href = '/login?reason=session_expired';
      break;

    case 'INVALID_TOKEN_SIGNATURE':
      console.error('Token signature is invalid - tokens may be corrupted');
      // Clear tokens and redirect to login
      authService.logout();
      window.location.href = '/login?reason=invalid_token';
      break;

    case 'INVALID_TOKEN_TYPE':
      console.error('Token is not the expected type');
      break;

    case 'TOKEN_EXPIRED':
    case 'INVALID_TOKEN':
      // Token expired, will be handled by interceptor to refresh automatically
      console.log('Token expired, attempting automatic refresh...');
      break;

    case 'MISSING_TOKEN':
      console.error('No token provided in Authorization header');
      break;

    case 'USER_NOT_FOUND':
      console.error('User account no longer exists');
      authService.logout();
      window.location.href = '/login?reason=user_not_found';
      break;

    default:
      if (status === 429) {
        alert('Too many authentication attempts. Please wait 15 minutes and try again.');
      } else {
        alert('An unexpected error occurred. Please try again.');
      }
  }
};
```

### Handle Network Errors During Token Refresh

```typescript
// In your API interceptor or service
const handleRefreshError = (error: any) => {
  if (!error.response) {
    // Network error - can't reach backend
    console.error('Network error during token refresh - backend unreachable');
    // Could implement offline handling or queue requests
  } else if (error.response.status === 401) {
    // Authentication failed - force login
    console.error('Token refresh failed with 401 - logging out user');
    authService.logout();
    window.location.href = '/login?reason=auth_failed';
  } else if (error.response.status === 429) {
    // Rate limited - wait before retrying
    console.error('Rate limited - please wait before retrying');
  } else {
    // Other server error
    console.error('Server error during token refresh:', error.response.status);
  }
};
```

---

## Security Best Practices

### 1. Token Storage

✅ **Recommended**:
- Store in HttpOnly, Secure, SameSite cookies
- Set proper cookie domain and path

❌ **Avoid**:
- Storing tokens in localStorage (vulnerable to XSS)
- Storing tokens in sessionStorage
- Showing tokens in browser console

```typescript
// ✓ Secure storage
Cookies.set('accessToken', token, {
  secure: true,      // HTTPS only
  httpOnly: true,    // Not accessible from JavaScript
  sameSite: 'strict' // CSRF protection
});
```

### 2. CSRF Protection

Always validate CSRF tokens when sending state-changing requests:

```typescript
// Use axios with CSRF support
import axios from 'axios';

const api = axios.create();
api.defaults.xsrfCookieName = 'csrftoken';
api.defaults.xsrfHeaderName = 'X-CSRFToken';
```

### 3. State Parameter (OAuth Best Practice)

For GitHub OAuth, implement state parameter to prevent CSRF:

```typescript
// Generate random state
const state = Math.random().toString(36).substring(7);
sessionStorage.setItem('oauth_state', state);

// Include in authorization URL
const authUrl = `https://github.com/login/oauth/authorize?` +
  `state=${encodeURIComponent(state)}&` +
  `...`;

// Verify in callback
const returnedState = params.get('state');
if (returnedState !== sessionStorage.getItem('oauth_state')) {
  throw new Error('State mismatch - possible CSRF attack');
}
```

### 4. HTTPS Only

Always use HTTPS in production:
- Set `secure: true` in cookie options
- Backend should enforce HTTPS
- Use HSTS headers

### 5. Rate Limiting

Backend enforces rate limiting (5 requests per 15 minutes):
- Handle 429 responses gracefully
- Implement exponential backoff retry logic
- Show user-friendly error messages

---

## Complete Login Page Example

```typescript
// src/pages/LoginPage.tsx
import { useNavigate } from 'react-router-dom';
import { GoogleLoginButton } from '../components/GoogleLoginButton';
import { GitHubLoginButton } from '../components/GitHubLoginButton';

export function LoginPage() {
  const navigate = useNavigate();

  const handleAuthSuccess = () => {
    navigate('/dashboard');
  };

  const handleAuthError = (error: Error) => {
    console.error('Auth error:', error);
  };

  return (
    <div className="login-container">
      <h1>Sign In to Magna Coders</h1>
      
      <div className="oauth-buttons">
        <GoogleLoginButton 
          onSuccess={handleAuthSuccess}
          onError={handleAuthError}
        />
        <GitHubLoginButton 
          onSuccess={handleAuthSuccess}
          onError={handleAuthError}
        />
      </div>

      <div className="divider">or</div>

      <form className="email-login">
        {/* Email/password login form */}
      </form>
    </div>
  );
}
```

---

## Testing OAuth Integration

### Manual Testing Checklist

- [ ] Google OAuth login creates new user
- [ ] Google OAuth login existing user works
- [ ] GitHub OAuth login creates new user
- [ ] GitHub OAuth login existing user works
- [ ] Link Google to existing account
- [ ] Link GitHub to existing account
- [ ] Can't link same provider twice
- [ ] Email mismatch prevents linking
- [ ] Rate limiting works (429 response)
- [ ] Tokens are securely stored
- [ ] Logout clears all tokens
- [ ] Token refresh works
- [ ] User profile displays correctly

### Test OAuth Credentials (for development)

```env
# Google Test Account
VITE_GOOGLE_CLIENT_ID=test-client-id
# Create at: https://console.cloud.google.com

# GitHub Test Account
VITE_GITHUB_CLIENT_ID=test-client-id
# Create at: https://github.com/settings/developers

# Local Backend
VITE_API_URL=http://localhost:5000/api
```

---

## Troubleshooting

### Issue: "Invalid provider" error

**Solution**: Ensure provider is exactly "google" or "github" (lowercase)

### Issue: Email mismatch error when linking

**Solution**: The OAuth provider email must match the registered account email

### Issue: Rate limit error (429)

**Solution**: Wait 15 minutes before retrying, implement exponential backoff

### Issue: Network error in callback

**Solution**: Ensure backend is running at `VITE_API_URL`

### Issue: Tokens not persisting across page reload

**Solution**: Check that cookies have `sameSite: 'strict'` and `secure: true` options

---

## Support

For API issues, refer to:
- Backend API documentation: `/api-docs`
- Swagger UI: `http://localhost:5000/api-docs`

For OAuth provider specific issues:
- Google: https://developers.google.com/identity/protocols/oauth2
- GitHub: https://docs.github.com/en/developers/apps/building-oauth-apps
