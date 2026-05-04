import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, Phone, Eye, EyeOff, ArrowLeft, ChevronRight } from "lucide-react";

type Mode = "choose" | "email-login" | "email-register" | "phone-send" | "phone-verify" | "phone-name";

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading, loginMutation, registerMutation, sendOtpMutation, verifyOtpMutation } = useAuth();

  const [mode, setMode] = useState<Mode>("choose");
  const [showPassword, setShowPassword] = useState(false);

  // Email form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  // Phone form
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [needsName, setNeedsName] = useState(false);
  const [phoneName, setPhoneName] = useState("");

  // Redirect if already logged in
  useEffect(() => {
    if (!isLoading && user) setLocation("/profile");
  }, [user, isLoading]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ email, password }, { onSuccess: () => setLocation("/") });
  };

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    registerMutation.mutate({ name, email, password }, { onSuccess: () => setLocation("/") });
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    sendOtpMutation.mutate({ phone }, {
      onSuccess: (data) => {
        if (data.devCode) setDevCode(data.devCode);
        setMode("phone-verify");
      },
    });
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    verifyOtpMutation.mutate({ phone, code: otp }, {
      onSuccess: (result) => {
        if ("needsName" in result) {
          setNeedsName(true);
          setMode("phone-name");
        } else {
          setLocation("/");
        }
      },
    });
  };

  const handlePhoneName = async (e: React.FormEvent) => {
    e.preventDefault();
    verifyOtpMutation.mutate({ phone, code: otp, name: phoneName }, {
      onSuccess: () => setLocation("/"),
    });
  };

  const isPending = loginMutation.isPending || registerMutation.isPending ||
    sendOtpMutation.isPending || verifyOtpMutation.isPending;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="text-white px-4 pt-10 pb-16 text-center relative" style={{ background: "radial-gradient(ellipse 80% 55% at 50% 35%, #2e7d52 0%, #0f3520 55%, #081f10 100%)" }}>
        <div className="flex justify-center mb-3">
          <img src="/logo-dark.png" alt="PinPlay Golf" className="w-44 h-auto drop-shadow-2xl" />
        </div>
        <p className="text-[0.875rem] font-medium" style={{ color: "rgba(134,196,159,0.85)" }}>
          Save your rounds. Track your handicap.
        </p>
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-background" style={{ borderRadius: "2.5rem 2.5rem 0 0" }} />
      </div>

      {/* Card */}
      <div className="flex-1 max-w-sm mx-auto w-full px-4 -mt-2 pb-16">

        {/* Choose method */}
        {mode === "choose" && (
          <div className="space-y-3 pt-4">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white text-center mb-6">Sign in or create account</h1>
            <button
              onClick={() => setMode("phone-send")}
              className="w-full flex items-center justify-between p-4 rounded-2xl border-2 border-gray-200 dark:border-gray-700 hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-950/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/50 flex items-center justify-center">
                  <Phone className="w-5 h-5 text-primary-700 dark:text-primary-400" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-gray-900 dark:text-white text-sm">Continue with Phone</p>
                  <p className="text-xs text-gray-500">Get a code via SMS</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </button>

            <button
              onClick={() => setMode("email-login")}
              className="w-full flex items-center justify-between p-4 rounded-2xl border-2 border-gray-200 dark:border-gray-700 hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-950/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-gray-900 dark:text-white text-sm">Continue with Email</p>
                  <p className="text-xs text-gray-500">Sign in or create account</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </button>

            <div className="pt-4 text-center">
              <button onClick={() => setLocation("/")} className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                Skip — continue as guest
              </button>
            </div>
          </div>
        )}

        {/* Email login */}
        {mode === "email-login" && (
          <form onSubmit={handleEmailLogin} className="space-y-4 pt-4">
            <div className="flex items-center gap-3 mb-6">
              <button type="button" onClick={() => setMode("choose")} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">Sign in with Email</h1>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium text-gray-700 dark:text-gray-300">Email</Label>
              <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required className="rounded-xl h-12" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-medium text-gray-700 dark:text-gray-300">Password</Label>
              <div className="relative">
                <Input id="password" type={showPassword ? "text" : "password"} placeholder="••••••" value={password} onChange={e => setPassword(e.target.value)} required className="rounded-xl h-12 pr-10" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" disabled={isPending} className="w-full h-12 rounded-xl font-semibold bg-primary-700 hover:bg-primary-800 text-white">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sign In"}
            </Button>
            <p className="text-center text-sm text-gray-500">
              No account?{" "}
              <button type="button" onClick={() => setMode("email-register")} className="text-primary-700 dark:text-primary-400 font-semibold hover:underline">
                Create one
              </button>
            </p>
          </form>
        )}

        {/* Email register */}
        {mode === "email-register" && (
          <form onSubmit={handleEmailRegister} className="space-y-4 pt-4">
            <div className="flex items-center gap-3 mb-6">
              <button type="button" onClick={() => setMode("email-login")} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">Create Account</h1>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-sm font-medium text-gray-700 dark:text-gray-300">Your name</Label>
              <Input id="name" placeholder="John Smith" value={name} onChange={e => setName(e.target.value)} required className="rounded-xl h-12" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-email" className="text-sm font-medium text-gray-700 dark:text-gray-300">Email</Label>
              <Input id="reg-email" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required className="rounded-xl h-12" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-password" className="text-sm font-medium text-gray-700 dark:text-gray-300">Password</Label>
              <div className="relative">
                <Input id="reg-password" type={showPassword ? "text" : "password"} placeholder="At least 6 characters" value={password} onChange={e => setPassword(e.target.value)} required className="rounded-xl h-12 pr-10" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" disabled={isPending} className="w-full h-12 rounded-xl font-semibold bg-primary-700 hover:bg-primary-800 text-white">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Account"}
            </Button>
            <p className="text-center text-sm text-gray-500">
              Already have one?{" "}
              <button type="button" onClick={() => setMode("email-login")} className="text-primary-700 dark:text-primary-400 font-semibold hover:underline">Sign in</button>
            </p>
          </form>
        )}

        {/* Phone — send OTP */}
        {mode === "phone-send" && (
          <form onSubmit={handleSendOtp} className="space-y-4 pt-4">
            <div className="flex items-center gap-3 mb-6">
              <button type="button" onClick={() => setMode("choose")} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">Enter your phone</h1>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone" className="text-sm font-medium text-gray-700 dark:text-gray-300">Phone number</Label>
              <Input id="phone" type="tel" placeholder="+1 555 000 0000" value={phone} onChange={e => setPhone(e.target.value)} required className="rounded-xl h-12" />
              <p className="text-xs text-gray-400">Include country code, e.g. +1 for US</p>
            </div>
            <Button type="submit" disabled={isPending} className="w-full h-12 rounded-xl font-semibold bg-primary-700 hover:bg-primary-800 text-white">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send Code"}
            </Button>
          </form>
        )}

        {/* Phone — verify OTP */}
        {mode === "phone-verify" && (
          <form onSubmit={handleVerifyOtp} className="space-y-4 pt-4">
            <div className="flex items-center gap-3 mb-2">
              <button type="button" onClick={() => setMode("phone-send")} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">Enter the code</h1>
            </div>
            <p className="text-sm text-gray-500 pb-2">We sent a 6-digit code to {phone}</p>
            {devCode && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-sm text-amber-700 dark:text-amber-400">
                Development mode — your code is: <span className="font-bold font-mono">{devCode}</span>
              </div>
            )}
            <div className="space-y-1.5">
              <Input
                type="text" inputMode="numeric" placeholder="000000" maxLength={6}
                value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ""))}
                required className="rounded-xl h-12 text-center text-2xl font-mono tracking-widest"
              />
            </div>
            <Button type="submit" disabled={isPending || otp.length < 6} className="w-full h-12 rounded-xl font-semibold bg-primary-700 hover:bg-primary-800 text-white">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
            </Button>
            <p className="text-center text-sm text-gray-500">
              Wrong number?{" "}
              <button type="button" onClick={() => setMode("phone-send")} className="text-primary-700 font-semibold hover:underline">Change it</button>
            </p>
          </form>
        )}

        {/* Phone — needs name */}
        {mode === "phone-name" && (
          <form onSubmit={handlePhoneName} className="space-y-4 pt-4">
            <h1 className="text-lg font-bold text-gray-900 dark:text-white mb-2">What's your name?</h1>
            <p className="text-sm text-gray-500 pb-2">Just so we know who you are on the scorecard.</p>
            <div className="space-y-1.5">
              <Label htmlFor="phone-name" className="text-sm font-medium text-gray-700 dark:text-gray-300">Your name</Label>
              <Input id="phone-name" placeholder="John Smith" value={phoneName} onChange={e => setPhoneName(e.target.value)} required className="rounded-xl h-12" />
            </div>
            <Button type="submit" disabled={isPending || !phoneName.trim()} className="w-full h-12 rounded-xl font-semibold bg-primary-700 hover:bg-primary-800 text-white">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Continue"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
