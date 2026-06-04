/**
 * Wrapper for @capacitor-community/apple-sign-in.
 * 
 * Works in both environments:
 * - Native (Capacitor iOS app): Calls the real plugin via Capacitor's bridge
 * - Web (browser): Throws a friendly error
 * 
 * On native, the plugin JS is registered by Capacitor at runtime even though
 * this stub is used at build time. We access it through Capacitor.Plugins.
 */

export const SignInWithApple = {
  authorize: async (options?: {
    clientId?: string;
    redirectURI?: string;
    scopes?: string;
  }) => {
    // Try Capacitor's native plugin registry first (works in iOS app)
    const cap = (window as any).Capacitor;
    if (cap?.isNativePlatform?.()) {
      const plugin = cap.Plugins?.SignInWithApple;
      if (plugin?.authorize) {
        return plugin.authorize(options);
      }
    }
    throw new Error("Apple Sign In is only available in the iOS app");
  },
};
