# Token Management Endpoints

This document provides a concise reference for the two new authentication endpoints related to refresh and validation of JWT tokens.

---

## Refresh Token

**Endpoint:** `POST /api/auth/refresh`

**Purpose:** Exchange a valid refresh token for a new access token (and a new refresh token).

### Request Body
```json
{
  "refreshToken": "<current_refresh_jwt>"
}
```

### Successful Response (200)
```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "accessToken": "<new_access_jwt>",
    "refreshToken": "<new_refresh_jwt>",
    "expiresIn": 604800,          // seconds (7 days)
    "tokenType": "Bearer"
  }
}
```

### Error Responses
- `400 MISSING_REFRESH_TOKEN` – refresh token missing from body
- `401 REFRESH_TOKEN_EXPIRED` – supplied refresh JWT has expired
- `401 INVALID_TOKEN_SIGNATURE` – signature verification failed
- `401 INVALID_TOKEN_TYPE` – provided token is not of type `refresh`
- `401 USER_NOT_FOUND` – user referenced in token no longer exists

---

## Validate Token

**Endpoint:** `GET /api/auth/validate`

**Purpose:** Check a bearer token (access or refresh) for validity and expiration.

### Headers
```
Authorization: Bearer <jwt_token>
```

### Successful Response (200)
```json
{
  "success": true,
  "message": "Token is valid",
  "data": {
    "isValid": true,
    "isExpired": false,
    "expiresAt": "2026-03-08T17:29:03.318Z",
    "userId": "<uuid>",
    "email": "user@example.com",
    "username": "username_123",
    "tokenType": "access" // or "refresh"
  }
}
```

### Error Responses
- `400 MISSING_TOKEN` – no Authorization header provided
- `401 TOKEN_EXPIRED` – token is expired (payload shows `isExpired: true`)
- `401 INVALID_TOKEN_SIGNATURE` – signature is invalid

---

These endpoints are used by the frontend to maintain session state and proactively refresh or re‑authenticate users before their access tokens expire.