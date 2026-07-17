/**
 * GHIN Service — Handicap lookup stub.
 *
 * This service is NOT YET ACTIVE. It requires USGA Authorized Handicap
 * Data Affiliate status to obtain OAuth 2.0 credentials from api.ghin.com.
 *
 * Current status: scaffolding only. All methods return null/empty.
 * Manual handicap entry remains the active fallback in the UI.
 *
 * To activate:
 * 1. Complete the USGA Affiliate application
 * 2. Set GHIN_CLIENT_ID and GHIN_CLIENT_SECRET environment variables
 * 3. Uncomment and implement the fetch calls below
 * 4. Wire GhinService into the handicap lookup UI (replace manual entry)
 *
 * API Reference (from SportsFirst documentation):
 *   Base URL: https://api.ghin.com/api/v1
 *   Auth: OAuth 2.0 Client Credentials
 *   GET  /golfers/{ghin}/handicap  — official Handicap Index + trend
 *   GET  /golfers/{ghin}/scores    — score history
 *   POST /scores                    — post a new score
 *   Course Handicap: Math.round(handicapIndex * (slopeRating / 113))
 */

import type {
  GhinServiceInterface,
  GhinHandicapResult,
  GhinScoreEntry,
} from "../../shared/game-config";

export class GhinService implements GhinServiceInterface {
  private clientId: string | null;
  private clientSecret: string | null;
  private baseUrl: string;
  private authToken: string | null;
  private tokenExpiry: number;

  constructor() {
    this.clientId = process.env.GHIN_CLIENT_ID || null;
    this.clientSecret = process.env.GHIN_CLIENT_SECRET || null;
    this.baseUrl = "https://api.ghin.com/api/v1";
    this.authToken = null;
    this.tokenExpiry = 0;
  }

  /** Check if GHIN integration is configured and ready to use */
  isConfigured(): boolean {
    return this.clientId !== null && this.clientSecret !== null;
  }

  /** Authenticate with GHIN OAuth 2.0 (Client Credentials flow) */
  private async authenticate(): Promise<string | null> {
    if (!this.isConfigured()) return null;
    if (this.authToken && Date.now() < this.tokenExpiry) {
      return this.authToken;
    }

    // TODO: Implement OAuth flow once credentials are obtained
    // const response = await fetch(`${this.baseUrl}/oauth/token`, {
    //   method: "POST",
    //   headers: { "Content-Type": "application/x-www-form-urlencoded" },
    //   body: new URLSearchParams({
    //     grant_type: "client_credentials",
    //     client_id: this.clientId!,
    //     client_secret: this.clientSecret!,
    //   }),
    // });
    // const data = await response.json();
    // this.authToken = data.access_token;
    // this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    // return this.authToken;

    return null;
  }

  async lookupHandicap(ghinNumber: string): Promise<GhinHandicapResult | null> {
    if (!this.isConfigured()) return null;
    const token = await this.authenticate();
    if (!token) return null;

    // TODO: Implement once GHIN credentials are obtained
    // const response = await fetch(`${this.baseUrl}/golfers/${ghinNumber}/handicap`, {
    //   headers: { Authorization: `Bearer ${token}` },
    // });
    // const data = await response.json();
    // return {
    //   ghinNumber,
    //   handicapIndex: data.handicap_index,
    //   revisionDate: data.last_revision_date,
    //   trend: data.trend || [],
    // };

    return null;
  }

  async getScores(ghinNumber: string): Promise<GhinScoreEntry[]> {
    if (!this.isConfigured()) return [];
    const token = await this.authenticate();
    if (!token) return [];

    // TODO: Implement once GHIN credentials are obtained
    return [];
  }

  /**
   * Compute course handicap from Handicap Index.
   * Formula: Math.round(handicapIndex * (slopeRating / 113) + (courseRating - par))
   * Simplified: Math.round(handicapIndex * (slopeRating / 113))
   */
  static computeCourseHandicap(
    handicapIndex: number,
    slopeRating: number,
    courseRating?: number,
    par?: number,
  ): number {
    let courseHandicap = Math.round(handicapIndex * (slopeRating / 113));
    if (courseRating !== undefined && par !== undefined) {
      courseHandicap += Math.round(courseRating - par);
    }
    return Math.max(0, courseHandicap);
  }
}

// Singleton instance
export const ghinService = new GhinService();
