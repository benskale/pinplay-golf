/**
 * Wrapper for @capacitor-community/apple-sign-in.
 * 
 * Uses Capacitor's registerPlugin to create a proper bridge to the native
 * iOS plugin. This is exactly what the real npm package does internally.
 * Works because @capacitor/core is available in the Capacitor runtime.
 */

import { registerPlugin } from '@capacitor/core';

export interface AppleSignInResponse {
  response: {
    identityToken: string;
    givenName?: string;
    familyName?: string;
    email?: string;
    user: string;
  };
}

const SignInWithApple = registerPlugin<AppleSignInResponse>('SignInWithApple');

export { SignInWithApple };
