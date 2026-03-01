# OAuth Integration - Quick Start

## 5-Minute Setup

### 1. Install Dependencies
```bash
npm install @react-oauth/google js-cookie axios
```

### 2. Add Environment Variables
```env
VITE_GOOGLE_CLIENT_ID=your_client_id
VITE_GITHUB_CLIENT_ID=your_client_id
VITE_API_URL=http://localhost:5000/api
```

### 3. Wrap App with Google Provider
```tsx
import { GoogleOAuthProvider } from '@react-oauth/google';

<GoogleOAuthProvider clientId={process.env.VITE_GOOGLE_CLIENT_ID}>
  <App />
</GoogleOAuthProvider>
```

### 4. Create Auth Service
```typescript
// src/services/authService.ts
import axios from 'axios';
import Cookies from 'js-cookie';

const api = axios.create({
  baseURL: process.env.VITE_API_URL
});

export const authenticateWithOAuth = async (oauthData) => {
  const response = await api.post('/auth/oauth/callback', oauthData);
  
  // Store tokens
  Cookies.set('accessToken', response.data.data.accessToken, {
    secure: true,
    sameSite: 'strict'
  });
  Cookies.set('refreshToken', response.data.data.refreshToken, {
    secure: true,
    sameSite: 'strict'
  });
  localStorage.setItem('user', JSON.stringify(response.data.data.user));
  
  return response.data;
};
```

### 5. Google Login Button
```tsx
import { useGoogleLogin } from '@react-oauth/google';

export function GoogleLoginButton() {
  const login = useGoogleLogin({
    onSuccess: async (codeResponse) => {
      // Get user info from Google
      const response = await fetch(
        `https://www.googleapis.com/oauth2/v1/userinfo?access_token=${codeResponse.access_token}`
      );
      const googleUser = await response.json();

      // Send to backend
      await authenticateWithOAuth({
        provider: 'google',
        providerAccountId: googleUser.id,
        accessToken: codeResponse.access_token,
        expiresAt: codeResponse.expires_in,
        tokenType: 'Bearer',
        scope: codeResponse.scope,
        idToken: codeResponse.id_token,
        email: googleUser.email,
        name: googleUser.name,
        image: googleUser.picture
      });
    }
  });

  return <button onClick={() => login()}>Sign in with Google</button>;
}
```

### 6. GitHub Login Button
```tsx
export function GitHubLoginButton() {
  const handleGitHubLogin = () => {
    const redirectUri = `${window.location.origin}/auth/github/callback`;
    window.location.href = 
      `https://github.com/login/oauth/authorize?` +
      `client_id=${process.env.VITE_GITHUB_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=user:email`;
  };

  return <button onClick={handleGitHubLogin}>Sign in with GitHub</button>;
}
```

### 7. GitHub Callback Handler
```tsx
// src/pages/GitHubCallback.tsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authenticateWithOAuth } from '../services/authService';

export function GitHubCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      const code = new URLSearchParams(window.location.search).get('code');
      
      if (!code) {
        navigate('/login');
        return;
      }

      try {
        // Get token from backend
        const tokenRes = await fetch('/api/auth/github/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code })
        });
        const { access_token } = await tokenRes.json();

        // Get GitHub user
        const userRes = await fetch('https://api.github.com/user', {
          headers: { Authorization: `Bearer ${access_token}` }
        });
        const githubUser = await userRes.json();

        // Get email
        let email = githubUser.email;
        if (!email) {
          const emailRes = await fetch('https://api.github.com/user/emails', {
            headers: { Authorization: `Bearer ${access_token}` }
          });
          const emails = await emailRes.json();
          email = emails[0].email;
        }

        // Authenticate
        await authenticateWithOAuth({
          provider: 'github',
          providerAccountId: githubUser.id.toString(),
          accessToken: access_token,
          expiresAt: 3600,
          tokenType: 'Bearer',
          scope: 'user:email',
          email,
          name: githubUser.name || githubUser.login,
          image: githubUser.avatar_url
        });

        navigate('/dashboard');
      } catch (error) {
        console.error('Auth failed:', error);
        navigate('/login');
      }
    };

    handleCallback();
  }, []);

  return <div>Authenticating...</div>;
}
```

---

## API Endpoints

### POST /api/auth/oauth/callback
Create or update user via OAuth

**Request:**
```json
{
  "provider": "google|github",
  "providerAccountId": "string",
  "accessToken": "string",
  "expiresAt": 3600,
  "tokenType": "Bearer",
  "scope": "string",
  "email": "user@example.com",
  "name": "User Name",
  "idToken": "string (google only)",
  "image": "string (optional)"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "user": { "id": "...", "username": "...", "email": "..." },
    "accessToken": "jwt...",
    "refreshToken": "jwt...",
    "sessionToken": "uuid..."
  }
}
```

---

## Provider Setup Links

- **Google**: https://console.cloud.google.com/projects
  - Redirect: `http://localhost:3000/auth/callback`
- **GitHub**: https://github.com/settings/developers
  - Redirect: `http://localhost:3000/auth/github/callback`

---

## Common Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| "Invalid provider" | Wrong provider name | Use "google" or "github" (lowercase) |
| "Email mismatch" | Linking to wrong account | Use same email as registered |
| "Already linked" | Provider already connected | Use different provider |
| 429 Too Many Requests | Rate limited | Wait 15 minutes or implement retry |
| Token not persisting | Cookie settings wrong | Check `secure: true, sameSite: 'strict'` |

---

## File Structure

```
src/
├── services/
│   └── authService.ts           # OAuth & token management
├── components/
│   ├── GoogleLoginButton.tsx     # Google login UI
│   └── GitHubLoginButton.tsx     # GitHub login UI
├── pages/
│   ├── LoginPage.tsx             # Login page
│   └── GitHubCallback.tsx        # GitHub callback handler
└── App.tsx                       # Google OAuth provider wrapper
```

---

## Testing

```bash
# Login with Google
# Check browser cookies for accessToken, refreshToken
# Check localStorage for user object
# API requests should include Authorization header

# Login with GitHub
# Should redirect through github.com
# Callback handler processes auth code
# Same token/user storage as Google
```
