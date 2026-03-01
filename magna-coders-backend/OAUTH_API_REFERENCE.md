# OAuth API Request Reference

Complete request/response examples for OAuth integration.

---

## Google OAuth Flow

### Step 1: Get Google Auth Code
User clicks "Sign in with Google" button
```typescript
const login = useGoogleLogin({
  flow: 'implicit',
  access_type: 'offline',
  scope: 'openid email profile'
});
```

### Step 2: Get User Info & ID Token
```bash
# Frontend automatically receives:
{
  "access_token": "ya29.a0AfH6SMBx...",
  "expires_in": 3599,
  "scope": "openid email profile https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email",
  "token_type": "Bearer",
  "id_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6IjJjNmZhNmY1OTUwYTdjZTQ2NTZjZGYyNzUwN2FhNTZkMDI4MzMyODkiLCJ0eXAiOiJKV1QifQ..."
}
```

### Step 3: Fetch Google User Info
```bash
GET https://www.googleapis.com/oauth2/v1/userinfo?access_token={access_token}

Response:
{
  "id": "118364521344821612071",
  "email": "user@gmail.com",
  "verified_email": true,
  "name": "John Doe",
  "picture": "https://lh3.googleusercontent.com/a/default-user=s96-c",
  "locale": "en"
}
```

### Step 4: Send OAuth Data to Backend
```bash
POST http://localhost:5000/api/auth/oauth/callback

Content-Type: application/json

{
  "provider": "google",
  "providerAccountId": "118364521344821612071",
  "accessToken": "ya29.a0AfH6SMBx...",
  "refreshToken": null,
  "expiresAt": 3599,
  "tokenType": "Bearer",
  "scope": "openid email profile https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email",
  "idToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6IjJjNmZhNmY1OTUwYTdjZTQ2NTZjZGYyNzUwN2FhNTZkMDI4MzMyODkiLCJ0eXAiOiJKV1QifQ...",
  "email": "user@gmail.com",
  "name": "John Doe",
  "image": "https://lh3.googleusercontent.com/a/default-user=s96-c"
}
```

### Step 5: Backend Response - Success (200)
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "username": "john_doe_118364521344821612071",
      "email": "user@gmail.com",
      "avatar_url": "https://lh3.googleusercontent.com/a/default-user=s96-c"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDAiLCJ1c2VyX2lkIjoiNTUwZTg0MDAtZTI5Yi00MWQ0LWE3MTYtNDQ2NjU1NDQwMDAwIiwiZW1haWwiOiJ1c2VyQGdtYWlsLmNvbSIsInVzZXJuYW1lIjoiam9obl9kb2VfMTE4MzY0NTIxMzQ0ODIxNjEyMDcxIiwiaWF0IjoxNjQ2MDk5Njc3LCJleHAiOjE2NDYxODYwNzd9.abc123...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDAiLCJ1c2VyX2lkIjoiNTUwZTg0MDAtZTI5Yi00MWQ0LWE3MTYtNDQ2NjU1NDQwMDAwIiwidHlwZSI6InJlZnJlc2giLCJpYXQiOjE2NDYwOTk2NzcsImV4cCI6MTY0ODY5MTY3N30.xyz789...",
    "sessionToken": "a1b2c3d4-e5f6-47g8-h9i0-j1k2l3m4n5o6"
  }
}
```

---

## GitHub OAuth Flow

### Step 1: Redirect to GitHub
```
GET https://github.com/login/oauth/authorize?
  client_id={GITHUB_CLIENT_ID}&
  redirect_uri=http://localhost:3000/auth/github/callback&
  scope=user:email&
  state={random_state_string}
```

### Step 2: User Authorizes, GitHub Redirects Back
```
GET http://localhost:3000/auth/github/callback?
  code=abc123def456&
  state={same_state_string}
```

### Step 3: Exchange Code for Token
```bash
POST https://github.com/login/oauth/access_token

Headers:
  Accept: application/json
  Content-Type: application/json

Body:
{
  "client_id": "your_github_client_id",
  "client_secret": "your_github_client_secret",
  "code": "abc123def456",
  "redirect_uri": "http://localhost:3000/auth/github/callback"
}

Response:
{
  "access_token": "ghu_16C7e42F292c6912E7710c838347Ae178B4a",
  "expires_in": 28800,
  "refresh_token": "ghr_1B4a2e77838347a7E420314A7E38C228E1246D1",
  "refresh_token_expires_in": 15811200,
  "token_type": "bearer",
  "scope": "user:email"
}
```

### Step 4: Fetch GitHub User Info
```bash
GET https://api.github.com/user

Headers:
  Authorization: Bearer ghu_16C7e42F292c6912E7710c838347Ae178B4a
  Accept: application/vnd.github.v3+json
  User-Agent: MyApp

Response:
{
  "login": "johndoe",
  "id": 1296269,
  "node_id": "MDQ6VXNlcjEyOTYyNjk=",
  "avatar_url": "https://avatars.githubusercontent.com/u/1296269?v=4",
  "gravatar_id": "",
  "url": "https://api.github.com/users/johndoe",
  "html_url": "https://github.com/johndoe",
  "followers_url": "https://api.github.com/users/johndoe/followers",
  "following_url": "https://api.github.com/users/johndoe/following{/other_user}",
  "gists_url": "https://api.github.com/users/johndoe/gists{/gist_id}",
  "starred_url": "https://api.github.com/users/johndoe/starred{/owner}{/repo}",
  "subscriptions_url": "https://api.github.com/users/johndoe/subscriptions",
  "organizations_url": "https://api.github.com/users/johndoe/orgs",
  "repos_url": "https://api.github.com/users/johndoe/repos",
  "events_url": "https://api.github.com/users/johndoe/events{/privacy}",
  "received_events_url": "https://api.github.com/users/johndoe/received_events",
  "type": "User",
  "site_admin": false,
  "name": "John Doe",
  "company": null,
  "blog": "https://johndoe.com",
  "location": "San Francisco",
  "email": "john@example.com",
  "bio": "Software Engineer",
  "twitter_username": "johndoe",
  "public_repos": 25,
  "public_gists": 3,
  "followers": 100,
  "following": 50,
  "created_at": "2011-01-26T19:01:12Z",
  "updated_at": "2022-03-01T10:30:45Z"
}
```

### Step 5: Fetch GitHub User Email (if primary email not in response)
```bash
GET https://api.github.com/user/emails

Headers:
  Authorization: Bearer ghu_16C7e42F292c6912E7710c838347Ae178B4a
  Accept: application/vnd.github.v3+json

Response:
[
  {
    "email": "octocat@github.com",
    "primary": true,
    "verified": true,
    "visibility": "public"
  },
  {
    "email": "octocat@gmail.com",
    "primary": false,
    "verified": true,
    "visibility": null
  }
]
```

### Step 6: Send OAuth Data to Backend
```bash
POST http://localhost:5000/api/auth/oauth/callback

Content-Type: application/json

{
  "provider": "github",
  "providerAccountId": "1296269",
  "accessToken": "ghu_16C7e42F292c6912E7710c838347Ae178B4a",
  "refreshToken": "ghr_1B4a2e77838347a7E420314A7E38C228E1246D1",
  "expiresAt": 28800,
  "tokenType": "bearer",
  "scope": "user:email",
  "email": "octocat@github.com",
  "name": "John Doe",
  "image": "https://avatars.githubusercontent.com/u/1296269?v=4"
}
```

### Step 7: Backend Response - Success (200)
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "username": "johndoe_1296269",
      "email": "octocat@github.com",
      "avatar_url": "https://avatars.githubusercontent.com/u/1296269?v=4"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDEiLCJ1c2VyX2lkIjoiNTUwZTg0MDAtZTI5Yi00MWQ0LWE3MTYtNDQ2NjU1NDQwMDAxIiwiZW1haWwiOiJvY3RvY2F0QGdpdGh1Yi5jb20iLCJ1c2VybmFtZSI6ImpvaG5kb2VfMTI5NjI2OSIsImlhdCI6MTY0NjA5OTY3OCwiZXhwIjoxNjQ2MTg2MDc4fQ.def456...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDEiLCJ1c2VyX2lkIjoiNTUwZTg0MDAtZTI5Yi00MWQ0LWE3MTYtNDQ2NjU1NDQwMDAxIiwidHlwZSI6InJlZnJlc2giLCJpYXQiOjE2NDYwOTk2NzgsImV4cCI6MTY0ODY5MTY3OH0.ghi789...",
    "sessionToken": "b2c3d4e5-f6g7-48h9-i0j1-k2l3m4n5o6p7"
  }
}
```

---

## Error Responses

### 400 - Bad Request
```json
{
  "success": false,
  "message": "Missing required authentication data",
  "code": "MISSING_FIELDS"
}
```

### 400 - Invalid Provider
```json
{
  "success": false,
  "message": "Unsupported OAuth provider. Supported providers: google, github",
  "code": "INVALID_PROVIDER"
}
```

### 401 - Token Validation Failed
```json
{
  "success": false,
  "message": "Authentication token expired. Please try again.",
  "code": "TOKEN_EXPIRED"
}
```

### 400 - Email Mismatch (Linking)
```json
{
  "success": false,
  "message": "Google account email does not match your registered email"
}
```

### 409 - Account Already Exists
```json
{
  "success": false,
  "message": "An account with this email already exists",
  "code": "USER_EXISTS"
}
```

### 409 - Account Already Linked
```json
{
  "success": false,
  "message": "This Google account is already linked to another user",
  "code": "ACCOUNT_ALREADY_LINKED"
}
```

### 429 - Rate Limited
```json
{
  "success": false,
  "message": "Too many authentication attempts. Please try again later."
}
```

### 500 - Server Error
```json
{
  "success": false,
  "message": "An unexpected error occurred. Please try again."
}
```

---

## Linking OAuth Account (Authenticated)

### Request
```bash
POST http://localhost:5000/api/auth/oauth/link

Headers:
  Authorization: Bearer {accessToken}
  Content-Type: application/json

Body:
{
  "provider": "github",
  "providerAccountId": "1296269",
  "accessToken": "ghu_16C7e42F292c6912E7710c838347Ae178B4a",
  "expiresAt": 28800,
  "tokenType": "bearer",
  "scope": "user:email",
  "email": "user@gmail.com",
  "name": "John Doe"
}
```

### Success Response (200)
```json
{
  "success": true,
  "message": "GitHub account linked successfully"
}
```

---

## Token Storage in Cookies

After successful OAuth:

```
Set-Cookie: accessToken=eyJhbGc...; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=604800
Set-Cookie: refreshToken=eyJhbGc...; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=2592000
Set-Cookie: sessionToken=a1b2c3...; Path=/; Secure; HttpOnly; SameSite=Strict
```

---

## Using Access Token in API Requests

All subsequent API requests should include:

```bash
GET http://localhost:5000/api/profile/me

Headers:
  Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDEiLCJ1c2VyX2lkIjoiNTUwZTg0MDAtZTI5Yi00MWQ0LWE3MTYtNDQ2NjU1NDQwMDAxIiwiaWF0IjoxNjQ2MDk5Njc4LCJleHAiOjE2NDYxODYwNzh9.def456...
```

---

## Environment Variables Reference

### Frontend (.env)
```env
# Google OAuth
VITE_GOOGLE_CLIENT_ID=123456789.apps.googleusercontent.com
REACT_APP_GOOGLE_CLIENT_ID=123456789.apps.googleusercontent.com

# GitHub OAuth
VITE_GITHUB_CLIENT_ID=Iv1.abc1234567890def
REACT_APP_GITHUB_CLIENT_ID=Iv1.abc1234567890def

# Backend API
VITE_API_URL=http://localhost:5000/api
REACT_APP_API_URL=http://localhost:5000/api
```

### Backend (.env)
```env
# OAuth
GOOGLE_CLIENT_ID=123456789.apps.googleusercontent.com
GITHUB_CLIENT_ID=Iv1.abc1234567890def
GITHUB_CLIENT_SECRET=abc123def456ghi789jkl012mno345pqr

# JWT
SECRET=your-jwt-secret-key-min-32-chars

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/magna_coders_database

# API
PORT=5000
```

---

## Token Refresh Endpoint

### Use Refresh Token to Get New Access Token

**Endpoint**: `POST /api/auth/refresh`

**Request**:
```bash
POST http://localhost:5000/api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDAiLCJ1c2VyX2lkIjoiNTUwZTg0MDAtZTI5Yi00MWQ0LWE3MTYtNDQ2NjU1NDQwMDAwIiwidHlwZSI6InJlZnJlc2giLCJpYXQiOjE2NDYwOTk2NzcsImV4cCI6MTY0ODY5MTY3N30.xyz789..."
}
```

**Success Response (200)**:
```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDAiLCJ1c2VyX2lkIjoiNTUwZTg0MDAtZTI5Yi00MWQ0LWE3MTYtNDQ2NjU1NDQwMDAwIiwiaWF0IjoxNjQ2MDk5Njc3LCJleHAiOjE2NDYwOTk2Nzd9.abc123...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDAiLCJ1c2VyX2lkIjoiNTUwZTg0MDAtZTI5Yi00MWQ0LWE3MTYtNDQ2NjU1NDQwMDAwIiwidHlwZSI6InJlZnJlc2giLCJpYXQiOjE2NDYwOTk2NzcsImV4cCI6MTY0ODY5MTY3N30.xyz789...",
    "expiresIn": 604800,
    "tokenType": "Bearer"
  }
}
```

**Error Response (400)** - Missing refresh token:
```json
{
  "success": false,
  "message": "Refresh token is required",
  "code": "MISSING_REFRESH_TOKEN",
  "status": 400
}
```

**Error Response (401)** - Refresh token expired:
```json
{
  "success": false,
  "message": "Refresh token has expired",
  "code": "REFRESH_TOKEN_EXPIRED",
  "status": 401
}
```

**Error Response (401)** - Invalid token signature:
```json
{
  "success": false,
  "message": "Token signature is invalid",
  "code": "INVALID_TOKEN_SIGNATURE",
  "status": 401
}
```

**Error Response (401)** - Invalid token type:
```json
{
  "success": false,
  "message": "Invalid token type",
  "code": "INVALID_TOKEN_TYPE",
  "status": 401
}
```

**Error Response (401)** - User not found:
```json
{
  "success": false,
  "message": "User not found",
  "code": "USER_NOT_FOUND",
  "status": 401
}
```

---

## Token Validation Endpoint

### Check if Access Token is Valid

**Endpoint**: `GET /api/auth/validate`

**Request**:
```bash
GET http://localhost:5000/api/auth/validate
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDAiLCJ1c2VyX2lkIjoiNTUwZTg0MDAtZTI5Yi00MWQ0LWE3MTYtNDQ2NjU1NDQwMDAwIiwiaWF0IjoxNjQ2MDk5Njc3LCJleHAiOjE2NDYxODYwNzd9.abc123...
```

**Success Response (200)** - Token is valid:
```json
{
  "success": true,
  "message": "Token is valid",
  "data": {
    "isValid": true,
    "isExpired": false,
    "expiresAt": "2026-03-08T17:29:03.318Z",
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@gmail.com",
    "username": "john_doe_118364521344821612071",
    "tokenType": "access"
  }
}
```

**Error Response (401)** - Token has expired:
```json
{
  "success": false,
  "message": "Token has expired",
  "code": "TOKEN_EXPIRED",
  "status": 401,
  "data": {
    "isValid": false,
    "isExpired": true
  }
}
```

**Error Response (401)** - Token signature is invalid:
```json
{
  "success": false,
  "message": "Token signature is invalid",
  "code": "INVALID_TOKEN_SIGNATURE",
  "status": 401,
  "data": {
    "isValid": false,
    "isExpired": false
  }
}
```

**Error Response (400)** - No token provided:
```json
{
  "success": false,
  "message": "No token provided",
  "code": "MISSING_TOKEN",
  "status": 400
}
```

---

## Curl Examples

### Refresh Access Token
```bash
curl -X POST http://localhost:5000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDAiLCJ1c2VyX2lkIjoiNTUwZTg0MDAtZTI5Yi00MWQ0LWE3MTYtNDQ2NjU1NDQwMDAwIiwidHlwZSI6InJlZnJlc2giLCJpYXQiOjE2NDYwOTk2NzcsImV4cCI6MTY0ODY5MTY3N30.xyz789..."
  }'
```

### Validate Current Access Token
```bash
curl -X GET http://localhost:5000/api/auth/validate \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDAiLCJ1c2VyX2lkIjoiNTUwZTg0MDAtZTI5Yi00MWQ0LWE3MTYtNDQ2NjU1NDQwMDAwIiwiaWF0IjoxNjQ2MDk5Njc3LCJleHAiOjE2NDYxODYwNzd9.abc123..."
```

### Test Google OAuth Callback
```bash
curl -X POST http://localhost:5000/api/auth/oauth/callback \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "google",
    "providerAccountId": "118364521344821612071",
    "accessToken": "ya29.a0AfH6SMBx...",
    "expiresAt": 3599,
    "tokenType": "Bearer",
    "scope": "openid email profile",
    "idToken": "eyJhbGciOiJSUzI1NiI...",
    "email": "user@gmail.com",
    "name": "John Doe",
    "image": "https://lh3.googleusercontent.com/..."
  }'
```

### Test GitHub OAuth Callback
```bash
curl -X POST http://localhost:5000/api/auth/oauth/callback \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "github",
    "providerAccountId": "1296269",
    "accessToken": "ghu_16C7e42F292c6912E7710c838347Ae178B4a",
    "expiresAt": 28800,
    "tokenType": "bearer",
    "scope": "user:email",
    "email": "user@github.com",
    "name": "John Doe",
    "image": "https://avatars.githubusercontent.com/..."
  }'
```
