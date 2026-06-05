/**
 * Apple Sign In wrapper.
 * Uses the global Capacitor bridge directly — no imports needed.
 * On native iOS: Capacitor.Plugins.SignInWithApple is registered by cap sync.
 * On web: shows friendly message.
 */

export const SignInWithApple = {
  authorize: async (options?: Record<string, string>) => {
    const cap = (window as any).Capacitor;
    const plugin = cap?.Plugins?.SignInWithApple;
    if (plugin?.authorize) {
      return plugin.authorize(options);
    }
    throw new Error("Apple Sign In is only available in the iOS app");
  },
};
