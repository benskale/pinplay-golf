import { createContext, ReactNode, useContext } from "react";
import { useQuery, useMutation, UseMutationResult } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export type AuthUser = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  handicapIndex: number | null;
  homeCourse: string | null;
  avatarUrl: string | null;
  createdAt: string;
};

type RegisterData = { name: string; email: string; password: string };
type LoginData = { email: string; password: string };
type OtpSendData = { phone: string };
type OtpVerifyData = { phone: string; code: string; name?: string };
type ProfileData = { name?: string; phone?: string | null; handicapIndex?: number | null; homeCourse?: string | null; avatarUrl?: string | null };

type AuthContextType = {
  user: AuthUser | null;
  isLoading: boolean;
  registerMutation: UseMutationResult<AuthUser, Error, RegisterData>;
  loginMutation: UseMutationResult<AuthUser, Error, LoginData>;
  sendOtpMutation: UseMutationResult<{ message: string; devCode?: string }, Error, OtpSendData>;
  verifyOtpMutation: UseMutationResult<AuthUser | { needsName: true }, Error, OtpVerifyData>;
  updateProfileMutation: UseMutationResult<AuthUser, Error, ProfileData>;
  uploadAvatarMutation: UseMutationResult<AuthUser, Error, string>;
  logoutMutation: UseMutationResult<void, Error, void>;
  deleteAccountMutation: UseMutationResult<void, Error, void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();

  const { data: user = null, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/user"],
    queryFn: async () => {
      const res = await fetch("/api/auth/user", { credentials: "include" });
      if (res.status === 401) return null;
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const registerMutation = useMutation<AuthUser, Error, RegisterData>({
    mutationFn: async (data) => {
      const res = await apiRequest("POST", "/api/auth/register", data);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/auth/user"], user);
      toast({ title: `Welcome, ${user.name}!` });
    },
    onError: (err) => toast({ title: "Registration failed", description: err.message, variant: "destructive" }),
  });

  const loginMutation = useMutation<AuthUser, Error, LoginData>({
    mutationFn: async (data) => {
      const res = await apiRequest("POST", "/api/auth/login", data);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/auth/user"], user);
      toast({ title: `Welcome back, ${user.name}!` });
    },
    onError: (err) => toast({ title: "Login failed", description: err.message, variant: "destructive" }),
  });

  const sendOtpMutation = useMutation<{ message: string; devCode?: string }, Error, OtpSendData>({
    mutationFn: async (data) => {
      const res = await apiRequest("POST", "/api/auth/send-otp", data);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onError: (err) => toast({ title: "Couldn't send code", description: err.message, variant: "destructive" }),
  });

  const verifyOtpMutation = useMutation<AuthUser | { needsName: true }, Error, OtpVerifyData>({
    mutationFn: async (data) => {
      const res = await apiRequest("POST", "/api/auth/verify-otp", data);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: (result) => {
      if ("id" in result) {
        queryClient.setQueryData(["/api/auth/user"], result);
        toast({ title: `Welcome, ${(result as AuthUser).name}!` });
      }
    },
    onError: (err) => toast({ title: "Verification failed", description: err.message, variant: "destructive" }),
  });

  const updateProfileMutation = useMutation<AuthUser, Error, ProfileData>({
    mutationFn: async (data) => {
      const res = await apiRequest("PATCH", "/api/auth/profile", data);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/auth/user"], user);
      toast({ title: "Profile saved" });
    },
    onError: (err) => toast({ title: "Couldn't save profile", description: err.message, variant: "destructive" }),
  });

  const uploadAvatarMutation = useMutation<AuthUser, Error, string>({
    mutationFn: async (imageDataUrl: string) => {
      // Strip data URL prefix to avoid WAF/Cloudflare blocking — send raw base64 only
      const base64 = imageDataUrl.replace(/^data:image\/[^;]+;base64,/, "");
      const res = await apiRequest("POST", "/api/auth/avatar", { image: base64 });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/auth/user"], user);
      toast({ title: "Avatar updated" });
    },
    onError: (err) => toast({ title: "Couldn't save avatar", description: err.message, variant: "destructive" }),
  });

  const logoutMutation = useMutation<void, Error, void>({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/logout");
      if (!res.ok) throw new Error("Logout failed");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/user"], null);
      queryClient.invalidateQueries({ queryKey: ["/api/auth"] });
    },
    onError: (err) => toast({ title: "Logout failed", description: err.message, variant: "destructive" }),
  });

  const deleteAccountMutation = useMutation<void, Error, void>({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/auth/account");
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/user"], null);
      queryClient.invalidateQueries({ queryKey: ["/api/auth"] });
      toast({ title: "Account deleted", description: "Your account and data have been permanently removed." });
    },
    onError: (err) => toast({ title: "Couldn't delete account", description: err.message, variant: "destructive" }),
  });

  return (
    <AuthContext.Provider value={{
      user, isLoading,
      registerMutation, loginMutation,
      sendOtpMutation, verifyOtpMutation,
      updateProfileMutation, uploadAvatarMutation, logoutMutation, deleteAccountMutation,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
