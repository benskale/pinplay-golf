# Deployment Configuration

## Environment Variables Required for Production

### SESSION_SECRET
- **Purpose**: Used for Express session management and cookie signing
- **Required**: Yes for production deployments
- **Default**: Falls back to 'fallback-dev-secret-key' in development
- **Security**: Should be a strong, randomly generated string (minimum 32 characters)
- **Example**: `openssl rand -base64 32`

### GOOGLE_CLIENT_ID
- **Purpose**: Google OAuth 2.0 Client ID for "Sign in with Google"
- **Required**: Only if Google sign-in is enabled
- **How to get**: [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → Create OAuth 2.0 Client ID (Web application)
- **Example**: `123456789-abc.apps.googleusercontent.com`

### GOOGLE_CLIENT_SECRET
- **Purpose**: Google OAuth 2.0 Client Secret
- **Required**: Only if Google sign-in is enabled
- **How to get**: Same place as Client ID — shown once when creating credentials
- **Security**: Keep this secret, never commit to source control

### GOOGLE_CALLBACK_URL
- **Purpose**: The URL Google redirects to after authentication
- **Required**: No — defaults to `http://localhost:5000/api/auth/google/callback`
- **Production**: Set to `https://pinplay.golf/api/auth/google/callback`
- **Note**: This URL must also be added as an Authorized Redirect URI in Google Cloud Console

## Health Check Endpoint

The application includes a health check endpoint at `/health` that returns:
```json
{
  "status": "healthy",
  "timestamp": "2025-08-08T20:32:36.597Z",
  "uptime": 7.262893762
}
```

This endpoint is used by deployment systems to verify the application is running correctly.

## Session Management

The application uses:
- **express-session** for session handling
- **memorystore** for session persistence 
- Secure cookies in production (secure flag enabled)
- HTTP-only cookies for security
- 24-hour session expiration

## Deployment Fixes Applied

1. ✅ Added SESSION_SECRET environment variable support with graceful fallback
2. ✅ Configured proper session management with MemoryStore
3. ✅ Added /health endpoint for deployment health checks
4. ✅ Added production-appropriate session security settings
5. ✅ Added warning for missing SESSION_SECRET in production

## Testing the Build

To test the production build locally:
```bash
npm run build
NODE_ENV=production SESSION_SECRET=your-secret-key node dist/index.js
```

The health check endpoint can be tested with:
```bash
curl http://localhost:5000/health
```