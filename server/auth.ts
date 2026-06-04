import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleOAuthStrategy } from "passport-google-oauth20";
import { Express, type Request, type Response } from "express";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import type { User } from "@shared/schema";

// ── Apple Sign In (passport-apple — optional, graceful fallback if not installed) ──
let AppleStrategy: any = null;
try {
  const appleModule = await import("passport-apple");
  AppleStrategy = appleModule.default || appleModule.Strategy;
} catch {
  console.log("[auth] passport-apple not installed — Apple Sign In (web) unavailable. Install with: npm install passport-apple");
}

// ── Apple token verification (for native Capacitor flow — no passport needed) ──
// Verifies Apple identity tokens using Apple's public keys (jsonwebtoken required)
let jwtVerify: any = null;
try {
  const jwtModule = await import("jsonwebtoken");
  jwtVerify = jwtModule.default?.verify || jwtModule.verify;
} catch {
  console.log("[auth] jsonwebtoken not installed — Apple native sign in unavailable. Install with: npm install jsonwebtoken");
}

/** After login/register, link any anonymous games from this session to the user. */
async function linkSessionGames(req: Request, userId: number): Promise<number> {
  try {
    return await storage.linkGamesToUser(req.sessionID, userId);
  } catch (err) {
    console.error("linkSessionGames error:", err);
    return 0;
  }
}

declare global {
  namespace Express {
    interface User extends Omit<import("@shared/schema").User, "passwordHash"> {
      passwordHash?: string | null;
    }
  }
}

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function comparePasswords(supplied: string, stored: string): Promise<boolean> {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function sanitizeUser(user: User): Omit<User, "passwordHash"> {
  const { passwordHash: _, ...safe } = user;
  return safe;
}

export function setupAuth(app: Express) {
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(
      { usernameField: "email", passwordField: "password" },
      async (email, password, done) => {
        try {
          const user = await storage.getUserByEmail(email.toLowerCase().trim());
          if (!user || !user.passwordHash) return done(null, false, { message: "Invalid email or password" });
          const ok = await comparePasswords(password, user.passwordHash);
          if (!ok) return done(null, false, { message: "Invalid email or password" });
          return done(null, user);
        } catch (err) {
          return done(err);
        }
      },
    ),
  );

  // Google OAuth strategy (only configured if credentials are present)
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const googleCallbackUrl = process.env.GOOGLE_CALLBACK_URL || "http://localhost:5000/api/auth/google/callback";

  if (googleClientId && googleClientSecret) {
    passport.use(
      new GoogleOAuthStrategy(
        {
          clientID: googleClientId,
          clientSecret: googleClientSecret,
          callbackURL: googleCallbackUrl,
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const googleId = profile.id;
            const googleEmail = profile.emails?.[0]?.value?.toLowerCase().trim() ?? null;
            const googleName = profile.displayName || profile.name?.givenName || "Google User";
            const googlePhoto = profile.photos?.[0]?.value ?? null;

            // 1. Check if oauth_accounts already has this Google ID
            const existingOAuth = await storage.getOAuthAccount("google", googleId);
            if (existingOAuth) {
              let user = await storage.getUser(existingOAuth.userId);
              if (user) {
                // Auto-update Google photo if user has no custom avatar
                if (googlePhoto && !user.avatarUrl) {
                  user = (await storage.updateUser(user.id, { avatarUrl: googlePhoto })) ?? user;
                }
                return done(null, user);
              }
            }

            // 2. Check if a user with this email already exists → link
            if (googleEmail) {
              const existingUser = await storage.getUserByEmail(googleEmail);
              if (existingUser) {
                await storage.linkOAuthAccount(existingUser.id, "google", googleId, googleEmail);
                // Set Google photo if no avatar yet
                if (googlePhoto && !existingUser.avatarUrl) {
                  const updated = await storage.updateUser(existingUser.id, { avatarUrl: googlePhoto });
                  return done(null, updated ?? existingUser);
                }
                return done(null, existingUser);
              }
            }

            // 3. Neither found → create new user + oauth_accounts row
            const newUser = await storage.createUser({
              name: googleName,
              email: googleEmail,
              passwordHash: null,
              avatarUrl: googlePhoto,
            });

            await storage.createOAuthAccount(newUser.id, "google", googleId, googleEmail);

            return done(null, newUser);
          } catch (err) {
            return done(err);
          }
        },
      ),
    );
    console.log("[Auth] Google OAuth strategy configured");
  } else {
    console.log("[Auth] Google OAuth not configured (missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)");
  }

  // ── Apple Sign In strategy (web OAuth) ────────────────────────────────────
  const appleClientId = process.env.APPLE_CLIENT_ID;
  const appleTeamId = process.env.APPLE_TEAM_ID;
  const appleKeyId = process.env.APPLE_KEY_ID;
  const applePrivateKey = process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const appleCallbackUrl = process.env.APPLE_CALLBACK_URL || "https://pinplay.golf/api/auth/apple/callback";

  if (AppleStrategy && appleClientId && appleTeamId && appleKeyId && applePrivateKey) {
    passport.use(
      new AppleStrategy(
        {
          clientID: appleClientId,
          teamID: appleTeamId,
          keyID: appleKeyId,
          privateKeyString: applePrivateKey,
          callbackURL: appleCallbackUrl,
          passReqToCallback: true,
        },
        async (_req: Request, _accessToken: string, _refreshToken: string, idToken: any, profile: any, done: any) => {
          try {
            const appleId = idToken?.sub || profile?.id;
            const appleEmail = idToken?.email || profile?.email || null;
            const appleName = profile?.name
              ? `${profile.name.firstName || ""} ${profile.name.lastName || ""}`.trim()
              : "Apple User";

            if (!appleId) return done(new Error("No Apple ID in token"));

            // 1. Check if oauth_accounts already has this Apple ID
            const existingOAuth = await storage.getOAuthAccount("apple", appleId);
            if (existingOAuth) {
              const user = await storage.getUser(existingOAuth.userId);
              if (user) return done(null, user);
            }

            // 2. Check if a user with this email already exists → link
            if (appleEmail) {
              const existingUser = await storage.getUserByEmail(appleEmail);
              if (existingUser) {
                await storage.linkOAuthAccount(existingUser.id, "apple", appleId, appleEmail);
                return done(null, existingUser);
              }
            }

            // 3. Neither found → create new user + oauth_accounts row
            const newUser = await storage.createUser({
              name: appleName,
              email: appleEmail,
              passwordHash: null,
              avatarUrl: null,
            });

            await storage.createOAuthAccount(newUser.id, "apple", appleId, appleEmail);

            return done(null, newUser);
          } catch (err) {
            return done(err);
          }
        },
      ),
    );
    console.log("[Auth] Apple Sign In strategy configured");
  } else {
    console.log("[Auth] Apple Sign In not configured (missing passport-apple or APPLE_CLIENT_ID / APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY)");
  }

  passport.serializeUser((user, done) => done(null, (user as User).id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user ?? false);
    } catch (err) {
      done(err);
    }
  });

  // ── Auth routes ──────────────────────────────────────────────────────────────

  // Register with email + password
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, name } = req.body;
      if (!email || !password || !name) return res.status(400).json({ message: "Name, email and password are required" });
      if (password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });
      if (password.length > 128) return res.status(400).json({ message: "Password too long" });

      const cleanName = name.trim().replace(/[\x00-\x1F\x7F<>]/g, "").replace(/\s+/g, " ").slice(0, 50);
      if (cleanName.length < 1) return res.status(400).json({ message: "Name is required" });

      const existing = await storage.getUserByEmail(email.toLowerCase().trim());
      if (existing) return res.status(400).json({ message: "An account with this email already exists" });

      const user = await storage.createUser({
        name: cleanName,
        email: email.toLowerCase().trim(),
        passwordHash: await hashPassword(password),
      });

      req.login(user, async (err) => {
        if (err) return res.status(500).json({ message: "Login failed after registration" });
        await linkSessionGames(req, user.id);
        res.status(201).json(sanitizeUser(user));
      });
    } catch (err) {
      console.error("Register error:", err);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // Login with email + password
  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", async (err: any, user: User | false, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message ?? "Invalid credentials" });
      req.login(user, async (loginErr) => {
        if (loginErr) return next(loginErr);
        await linkSessionGames(req, user.id);
        res.json(sanitizeUser(user));
      });
    })(req, res, next);
  });

  // Send OTP to phone
  app.post("/api/auth/send-otp", async (req, res) => {
    try {
      const { phone } = req.body;
      if (!phone) return res.status(400).json({ message: "Phone number is required" });

      const normalised = phone.replace(/\s+/g, "").replace(/[^\d+]/g, "");
      const code = generateOtp();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

      await storage.createOtp(normalised, code, expiresAt);

      // TODO: Send via Twilio once connected
      // For now, return code in development only
      const isDev = process.env.NODE_ENV !== "production";
      console.log(`[OTP] ${normalised} → ${code}`);

      res.json({
        message: "Code sent",
        ...(isDev ? { devCode: code } : {}),
      });
    } catch (err) {
      console.error("Send OTP error:", err);
      res.status(500).json({ message: "Failed to send code" });
    }
  });

  // Verify OTP + login or register
  app.post("/api/auth/verify-otp", async (req, res) => {
    try {
      const { phone, code, name } = req.body;
      if (!phone || !code) return res.status(400).json({ message: "Phone and code are required" });

      const normalised = phone.replace(/\s+/g, "").replace(/[^\d+]/g, "");
      const valid = await storage.verifyOtp(normalised, code);
      if (!valid) return res.status(401).json({ message: "Invalid or expired code" });

      let user = await storage.getUserByPhone(normalised);
      if (!user) {
        if (!name) return res.status(400).json({ message: "Name is required for new accounts", needsName: true });
        user = await storage.createUser({ phone: normalised, name: name.trim() });
      }

      req.login(user, async (err) => {
        if (err) return res.status(500).json({ message: "Login failed" });
        await linkSessionGames(req, user!.id);
        res.json(sanitizeUser(user!));
      });
    } catch (err) {
      console.error("Verify OTP error:", err);
      res.status(500).json({ message: "Verification failed" });
    }
  });

  // Get current user
  app.get("/api/auth/user", (req, res) => {
    if (!req.isAuthenticated() || !req.user) return res.status(401).json({ message: "Not authenticated" });
    res.json(sanitizeUser(req.user as User));
  });

  // ── Google OAuth routes ──────────────────────────────────────────────────────

  // Redirect to Google consent screen
  app.get("/api/auth/google", (req, res, next) => {
    if (!googleClientId || !googleClientSecret) {
      return res.status(500).json({ message: "Google OAuth is not configured" });
    }
    passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
  });

  // Google OAuth callback
  app.get("/api/auth/google/callback", (req, res, next) => {
    passport.authenticate("google", (err: any, user: User | false, _info: any) => {
      if (err) {
        console.error("Google OAuth callback error:", err);
        return res.redirect("/auth?error=oauth_failed");
      }
      if (!user) {
        return res.redirect("/auth?error=oauth_denied");
      }
      req.login(user, async (loginErr) => {
        if (loginErr) {
          console.error("Google OAuth login error:", loginErr);
          return res.redirect("/auth?error=oauth_failed");
        }
        await linkSessionGames(req, (user as User).id);
        // Redirect to home/profile on success
        res.redirect("/");
      });
    })(req, res, next);
  });

  // ── Apple Sign In routes ──────────────────────────────────────────────────────

  // Redirect to Apple consent screen (web OAuth)
  app.get("/api/auth/apple", (req, res, next) => {
    if (!AppleStrategy || !appleClientId) {
      return res.status(500).json({ message: "Apple Sign In is not configured" });
    }
    passport.authenticate("apple")(req, res, next);
  });

  // Apple OAuth callback (web)
  app.post("/api/auth/apple/callback", (req, res, next) => {
    passport.authenticate("apple", (err: any, user: User | false, _info: any) => {
      if (err) {
        console.error("Apple OAuth callback error:", err);
        return res.redirect("/auth?error=oauth_failed");
      }
      if (!user) {
        return res.redirect("/auth?error=oauth_denied");
      }
      req.login(user, async (loginErr) => {
        if (loginErr) {
          console.error("Apple OAuth login error:", loginErr);
          return res.redirect("/auth?error=oauth_failed");
        }
        await linkSessionGames(req, (user as User).id);
        res.redirect("/");
      });
    })(req, res, next);
  });

  // Apple native sign in (Capacitor — receives identityToken from iOS native Apple Sign In)
  app.post("/api/auth/apple/native", async (req, res) => {
    try {
      const { identityToken, fullName } = req.body;
      if (!identityToken) return res.status(400).json({ message: "identityToken required" });

      // Decode the JWT without full verification (Apple's public keys)
      // In production, verify with Apple's public keys — for now decode the payload
      const base64Payload = identityToken.split(".")[1];
      if (!base64Payload) return res.status(400).json({ message: "Invalid identity token" });
      const payload = JSON.parse(Buffer.from(base64Payload, "base64").toString("utf-8"));

      const appleId = payload.sub;
      const appleEmail = payload.email || null;
      const appleName = fullName || "Apple User";

      if (!appleId) return res.status(400).json({ message: "No Apple ID in token" });

      // Same find-or-create flow as Google
      const existingOAuth = await storage.getOAuthAccount("apple", appleId);
      if (existingOAuth) {
        const user = await storage.getUser(existingOAuth.userId);
        if (user) {
          req.login(user, async (loginErr) => {
            if (loginErr) return res.status(500).json({ message: "Login failed" });
            await linkSessionGames(req, user.id);
            res.json(sanitizeUser(user));
          });
          return;
        }
      }

      if (appleEmail) {
        const existingUser = await storage.getUserByEmail(appleEmail);
        if (existingUser) {
          await storage.linkOAuthAccount(existingUser.id, "apple", appleId, appleEmail);
          req.login(existingUser, async (loginErr) => {
            if (loginErr) return res.status(500).json({ message: "Login failed" });
            await linkSessionGames(req, existingUser.id);
            res.json(sanitizeUser(existingUser));
          });
          return;
        }
      }

      const newUser = await storage.createUser({
        name: appleName,
        email: appleEmail,
        passwordHash: null,
        avatarUrl: null,
      });
      await storage.createOAuthAccount(newUser.id, "apple", appleId, appleEmail);

      req.login(newUser, async (loginErr) => {
        if (loginErr) return res.status(500).json({ message: "Login failed" });
        await linkSessionGames(req, newUser.id);
        res.json(sanitizeUser(newUser));
      });
    } catch (err) {
      console.error("Apple native sign in error:", err);
      res.status(500).json({ message: "Apple sign in failed" });
    }
  });
  app.patch("/api/auth/profile", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) return res.status(401).json({ message: "Not authenticated" });
    try {
      const { name, handicapIndex, homeCourse, avatarUrl, phone } = req.body;
      const sanitizedName = name !== undefined ? name.trim().replace(/[\x00-\x1F\x7F<>]/g, "").replace(/\s+/g, " ").slice(0, 50) : undefined;
      const updated = await storage.updateUser((req.user as User).id, {
        ...(name !== undefined && { name: sanitizedName }),
        ...(phone !== undefined && { phone: phone?.trim().replace(/[^\d+\-() ]/g, "") || null }),
        ...(handicapIndex !== undefined && { handicapIndex: handicapIndex === "" ? null : Number(handicapIndex) }),
        ...(homeCourse !== undefined && { homeCourse: homeCourse.trim().replace(/[\x00-\x1F\x7F<>]/g, "").slice(0, 200) || null }),
        ...(avatarUrl !== undefined && { avatarUrl: avatarUrl || null }),
      });
      if (!updated) return res.status(404).json({ message: "User not found" });
      res.json(sanitizeUser(updated));
    } catch (err) {
      console.error("Update profile error:", err);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Get game history for current user (created + played in)
  app.get("/api/auth/games", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) return res.status(401).json({ message: "Not authenticated" });
    try {
      const user = req.user as User;
      const [created, played] = await Promise.all([
        storage.getGamesByUser(user.id),
        storage.getGamesByPlayerName(user.name),
      ]);
      // Deduplicate by game id
      const seen = new Set<string>();
      const all = [...created, ...played].filter(g => {
        if (seen.has(g.id)) return false;
        seen.add(g.id);
        return true;
      });
      // Sort newest first
      all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      res.json(all);
    } catch (err) {
      console.error("Get games error:", err);
      res.status(500).json({ message: "Failed to fetch game history" });
    }
  });

  // Logout
  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      res.json({ message: "Logged out" });
    });
  });

  // Delete account (GDPR / App Store requirement)
  app.delete("/api/auth/account", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) return res.status(401).json({ message: "Not authenticated" });
    try {
      const userId = (req.user as User).id;
      const deleted = await storage.deleteUser(userId);
      if (!deleted) return res.status(404).json({ message: "User not found" });
      req.logout((err) => {
        if (err) console.error("Logout after delete error:", err);
        res.json({ message: "Account deleted" });
      });
    } catch (err) {
      console.error("Delete account error:", err);
      res.status(500).json({ message: "Failed to delete account" });
    }
  });

  // Upload avatar image — accepts binary JPEG directly in body (avoids WAF blocking base64 in JSON)
  app.post("/api/auth/avatar", express.raw({ type: "image/*", limit: "2mb" }), async (req, res) => {
    if (!req.isAuthenticated() || !req.user) return res.status(401).json({ message: "Not authenticated" });
    try {
      const userId = (req.user as User).id;
      const rawBody = req.body;

      // If it's a Buffer from express.raw, convert to base64 data URL
      if (Buffer.isBuffer(rawBody) && rawBody.length > 0) {
        if (rawBody.length > 2_000_000) return res.status(400).json({ message: "Image too large (max ~2MB)" });
        const base64 = rawBody.toString("base64");
        const avatarUrl = `data:image/jpeg;base64,${base64}`;
        const updated = await storage.updateUser(userId, { avatarUrl });
        if (!updated) return res.status(404).json({ message: "User not found" });
        return res.json(sanitizeUser(updated));
      }

      // Legacy JSON format fallback
      const { image } = req.body;
      if (!image || typeof image !== "string") return res.status(400).json({ message: "Image data required" });
      if (image.length > 2_700_000) return res.status(400).json({ message: "Image too large (max ~2MB)" });
      const avatarUrl = image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}`;
      const updated = await storage.updateUser(userId, { avatarUrl });
      if (!updated) return res.status(404).json({ message: "User not found" });
      return res.json(sanitizeUser(updated));
    } catch (err) {
      console.error("Avatar upload error:", err);
      res.status(500).json({ message: "Failed to save avatar" });
    }
  });

  // ── Favorites ────────────────────────────────────────────────────────────────

  // Get favorites list
  app.get("/api/auth/favorites", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) return res.status(401).json({ message: "Not authenticated" });
    try {
      const favs = await storage.getFavorites((req.user as User).id);
      res.json(favs.map((f: any) => ({
        id: f.id,
        favoriteUserId: f.favoriteUserId,
        favoriteName: f.favoriteName,
        avatarUrl: f.avatarUrl,
        handicapIndex: f.handicapIndex,
      })));
    } catch (err) {
      console.error("Get favorites error:", err);
      res.status(500).json({ message: "Failed to fetch favorites" });
    }
  });

  // Search users to add as favorites
  app.get("/api/auth/search-users", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) return res.status(401).json({ message: "Not authenticated" });
    try {
      const q = (req.query.q as string || "").trim();
      if (q.length < 2) return res.json([]);
      const results = await storage.searchUsers(q, (req.user as User).id);
      res.json(results.map((u: User) => ({ id: u.id, name: u.name, avatarUrl: u.avatarUrl ?? null, handicapIndex: u.handicapIndex ?? null })));
    } catch (err) {
      console.error("Search users error:", err);
      res.status(500).json({ message: "Failed to search users" });
    }
  });

  // Add favorite
  app.post("/api/auth/favorites", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) return res.status(401).json({ message: "Not authenticated" });
    try {
      const { favoriteUserId, favoriteName } = req.body;
      if (!favoriteUserId || !favoriteName) return res.status(400).json({ message: "User ID and name required" });
      const userId = (req.user as User).id;
      if (favoriteUserId === userId) return res.status(400).json({ message: "Can't add yourself" });
      const fav = await storage.addFavorite(userId, favoriteUserId, favoriteName);
      res.status(201).json(fav);
    } catch (err) {
      console.error("Add favorite error:", err);
      res.status(500).json({ message: "Failed to add favorite" });
    }
  });

  // Remove favorite
  app.delete("/api/auth/favorites/:favoriteUserId", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) return res.status(401).json({ message: "Not authenticated" });
    try {
      const ok = await storage.removeFavorite((req.user as User).id, parseInt(req.params.favoriteUserId));
      if (!ok) return res.status(404).json({ message: "Favorite not found" });
      res.json({ message: "Removed" });
    } catch (err) {
      console.error("Remove favorite error:", err);
      res.status(500).json({ message: "Failed to remove favorite" });
    }
  });

  // Generate invite link
  app.get("/api/auth/invite-link", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) return res.status(401).json({ message: "Not authenticated" });
    const user = req.user as User;
    // Always use the public URL — never the Replit dev domain
    const baseUrl = "https://pinplay.golf";
    const inviteLink = `${baseUrl}?ref=${user.id}`;
    const shareText = `Join me on PinPlay Golf! 🏌️ Track scores for 23 game types in real-time. ${inviteLink}`;
    res.json({ link: inviteLink, text: shareText });
  });
}
