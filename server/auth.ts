import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleOAuthStrategy } from "passport-google-oauth20";
import { Express } from "express";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import type { User } from "@shared/schema";

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

            // 1. Check if oauth_accounts already has this Google ID
            const existingOAuth = await storage.getOAuthAccount("google", googleId);
            if (existingOAuth) {
              const user = await storage.getUser(existingOAuth.userId);
              if (user) return done(null, user);
            }

            // 2. Check if a user with this email already exists → link
            if (googleEmail) {
              const existingUser = await storage.getUserByEmail(googleEmail);
              if (existingUser) {
                await storage.linkOAuthAccount(existingUser.id, "google", googleId, googleEmail);
                return done(null, existingUser);
              }
            }

            // 3. Neither found → create new user + oauth_accounts row
            const newUser = await storage.createUser({
              name: googleName,
              email: googleEmail,
              passwordHash: null,
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

      const existing = await storage.getUserByEmail(email.toLowerCase().trim());
      if (existing) return res.status(400).json({ message: "An account with this email already exists" });

      const user = await storage.createUser({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        passwordHash: await hashPassword(password),
      });

      req.login(user, (err) => {
        if (err) return res.status(500).json({ message: "Login failed after registration" });
        res.status(201).json(sanitizeUser(user));
      });
    } catch (err) {
      console.error("Register error:", err);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // Login with email + password
  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: User | false, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message ?? "Invalid credentials" });
      req.login(user, (loginErr) => {
        if (loginErr) return next(loginErr);
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

      req.login(user, (err) => {
        if (err) return res.status(500).json({ message: "Login failed" });
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
      req.login(user, (loginErr) => {
        if (loginErr) {
          console.error("Google OAuth login error:", loginErr);
          return res.redirect("/auth?error=oauth_failed");
        }
        // Redirect to home/profile on success
        res.redirect("/");
      });
    })(req, res, next);
  });

  // Update profile
  app.patch("/api/auth/profile", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) return res.status(401).json({ message: "Not authenticated" });
    try {
      const { name, handicapIndex, homeCourse } = req.body;
      const updated = await storage.updateUser((req.user as User).id, {
        ...(name !== undefined && { name: name.trim() }),
        ...(handicapIndex !== undefined && { handicapIndex: handicapIndex === "" ? null : Number(handicapIndex) }),
        ...(homeCourse !== undefined && { homeCourse: homeCourse.trim() || null }),
      });
      if (!updated) return res.status(404).json({ message: "User not found" });
      res.json(sanitizeUser(updated));
    } catch (err) {
      console.error("Update profile error:", err);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Get game history for current user
  app.get("/api/auth/games", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) return res.status(401).json({ message: "Not authenticated" });
    try {
      const history = await storage.getGamesByUser((req.user as User).id);
      res.json(history);
    } catch (err) {
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
}
