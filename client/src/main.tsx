import { createRoot } from "react-dom/client";
import App from "./App";
import { registerServiceWorker } from "./lib/register-sw";
import "./index.css";

// ── Bearer-token persistence (native app webviews drop cookies on cold start) ──
// WKWebView in the iOS app doesn't reliably persist the session cookie between
// launches, which forced a sign-in on every app open. The server now also issues
// a signed 12-hour sliding token; we keep it in localStorage (which the webview
// does persist) and attach it to API requests. X-Auth-Token responses renew it.
const AUTH_TOKEN_KEY = "pinplay_auth_token";

if (typeof window !== "undefined") {
  const origFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const isApiCall = typeof url === "string" && url.includes("/api/");
    const token = localStorage.getItem(AUTH_TOKEN_KEY);

    let headers: Headers | undefined;
    if (isApiCall && token) {
      headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
    }

    const res = headers
      ? await origFetch(input as any, { ...(init ?? {}), headers })
      : await origFetch(input as any, init);

    if (isApiCall) {
      const fresh = res.headers.get("X-Auth-Token");
      if (fresh) {
        localStorage.setItem(AUTH_TOKEN_KEY, fresh);
      } else if (res.status === 401 && token) {
        localStorage.removeItem(AUTH_TOKEN_KEY);
      }
    }
    return res;
  };
}

createRoot(document.getElementById("root")!).render(<App />);
registerServiceWorker();
