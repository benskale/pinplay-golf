export const SignInWithApple = {
  authorize: async (options) => {
    const cap = window.Capacitor;
    if (cap && cap.registerPlugin) {
      const plugin = cap.registerPlugin("SignInWithApple");
      return plugin.authorize(options);
    }
    throw new Error("Apple Sign In is only available in the iOS app");
  },
};
