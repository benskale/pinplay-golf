import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";

const AUTH_TOKEN_KEY = "pinplay_auth_token";

/**
 * Landing page for the native Google sign-in flow.
 *
 * The OAuth callback redirects here with the signed Bearer token in the URL
 * hash (never a query param, so it stays out of server logs). We persist it to
 * localStorage — which survives cold starts in the Capacitor webview, unlike
 * session cookies — and the global fetch wrapper in main.tsx attaches it to
 * every API request. This is what keeps users signed in after closing the app.
 */
export default function NativeAuthSuccessPage() {
  const [, setLocation] = useLocation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const hash = window.location.hash.replace(/^#/, "");
        const token = decodeURIComponent(hash || "");
        if (!token || token.split(".").length !== 3) {
          setError("Sign-in link was invalid or incomplete. Please try again.");
          return;
        }
        localStorage.setItem(AUTH_TOKEN_KEY, token);
        // Confirm the token actually authenticates before routing on.
        const res = await fetch("/api/auth/user", { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) {
          localStorage.removeItem(AUTH_TOKEN_KEY);
          setError("Sign-in could not be verified. Please try again.");
          return;
        }
        const user = await res.json();
        queryClient.setQueryData(["/api/auth/user"], user);
        setLocation("/");
      } catch {
        setError("Something went wrong finishing sign-in. Please try again.");
      }
    };
    run();
  }, [setLocation]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50 dark:bg-gray-900">
        <div className="text-center max-w-sm">
          <p className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Almost there</p>
          <p className="text-sm text-gray-500 mb-6">{error}</p>
          <button
            onClick={() => setLocation("/auth")}
            className="w-full p-4 rounded-2xl border-2 border-gray-200 dark:border-gray-700 font-semibold text-gray-900 dark:text-white"
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-green-600 mx-auto mb-3" />
        <p className="text-sm text-gray-500">Finishing sign in…</p>
      </div>
    </div>
  );
}
