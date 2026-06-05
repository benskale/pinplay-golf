/**
 * Apple Sign In wrapper.
 * Uses Capacitor's registerPlugin from the injected core runtime.
 * Works with remote URL loading (server.url) because the core
 * Capacitor runtime is always injected into the WebView.
 */
export const SignInWithApple = {
  authorize: async (options?: Record<string, string>) => {
    const cap = (window as any).Capacitor;
    if (cap?.registerPlugin) {
      const plugin = cap.registerPlugin('SignInWithApple');
      if (plugin?.authorize) {
        return plugin.authorize(options);
      }
    }
    throw new Error("Apple Sign In is only available in the iOS app");
  },
};
