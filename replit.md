# Wolf Tracker - Golf Game Scoring Application

## Overview

PinPlay Golf is a full-stack web application for tracking scores in 23 golf game formats. It provides real-time multiplayer score tracking, game state management, player profiles with authentication, and social sharing features. Live at pinplay.golf.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript using Vite as the build tool
- **UI Components**: Built on shadcn/ui component library with Radix UI primitives
- **Styling**: Tailwind CSS with custom design system (dark green primary, sage green background, DM Sans font)
- **State Management**: TanStack React Query for server state management and caching
- **Routing**: Wouter for client-side routing
- **Real-time Communication**: Native WebSocket API for live game updates
- **Form Handling**: React Hook Form with Zod validation

### Backend Architecture
- **Framework**: Express.js with TypeScript running on Node.js
- **Database ORM**: Drizzle ORM for type-safe database operations
- **Real-time Features**: WebSocket server implementation for live game state synchronization
- **API Design**: RESTful APIs for CRUD operations with WebSocket overlay for real-time updates
- **Authentication**: Passport.js with LocalStrategy (email/password) + phone OTP flow
- **Session Management**: Express session with PostgreSQL session store (connect-pg-simple)

### Data Storage
- **Primary Database**: PostgreSQL (Replit-managed, Neon-compatible)
- **ORM**: Drizzle with node-postgres driver
- **Session Store**: connect-pg-simple for PostgreSQL session management
- **Schema**: `shared/schema.ts` — tables: `games`, `users`, `otp_codes`

### Authentication
- **Email + Password**: Passport LocalStrategy with scrypt hashing
- **Phone + OTP**: 6-digit code, 10-min expiry, stored in `otp_codes` table
  - SMS sending via Twilio (not yet connected — dev mode shows code in response)
- **Sessions**: 30-day cookie, secure in production
- **Guest mode**: All auth is optional; games work without an account
- **Profile routes**: `/auth` (login/register), `/profile` (edit profile + round history)

### Key Files
- `shared/schema.ts` — Drizzle schema (games, users, otp_codes) + Zod types
- `server/db.ts` — Drizzle + pg Pool connection
- `server/storage.ts` — DatabaseStorage (Postgres) + MemStorage fallback, IStorage interface
- `server/auth.ts` — Passport setup, auth routes (/api/auth/*)
- `server/routes.ts` — Game routes + WebSocket server
- `server/index.ts` — Express app + session middleware
- `client/src/hooks/use-auth.tsx` — AuthProvider + useAuth hook
- `client/src/hooks/use-websocket.ts` — Single WS connection per game
- `client/src/hooks/use-game.ts` — Game actions (uses shared WS connection)
- `client/src/pages/auth.tsx` — Login/register UI (phone + email, OTP flow)
- `client/src/pages/profile.tsx` — Profile editor + round history
- `client/src/lib/game-logic.ts` — GAME_DEFINITIONS, calcHoleResult, isLowerBetter, etc.
- `client/src/components/active-game.tsx` — In-round scoring UI
- `client/src/components/final-standings.tsx` — End-of-round results
- `client/src/components/ghin-export-modal.tsx` — GHIN score export helper

### Design System
- Hero background: `radial-gradient(ellipse 80% 55% at 50% 35%, #2e7d52 0%, #0f3520 55%, #081f10 100%)`
- Active-game header: `linear-gradient(160deg, #081f10 0%, #0f3520 60%, #155e35 100%)`
- Primary color: `hsl(152 58% 18%)`
- Background: sage green `hsl(148 22% 96%)`
- Font: DM Sans (Google Fonts)
- Logo: `client/public/logo-dark.png` (transparent, white PIN + green PLAY, for dark backgrounds)
- Favicon: `client/public/favicon.png`

### Pending / Future
- Twilio connector for actual SMS delivery (currently OTP is logged server-side + returned in dev mode)
- Sign in with Apple (requires Apple Developer account)
- USGA GHIN score posting API (requires USGA vendor partnership)
