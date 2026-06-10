"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const supabase = supabaseBrowser();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setError(error.message);
    if (!data.user?.email_confirmed_at) return router.push("/verify");
    router.push("/dashboard");
    router.refresh();
  }

  async function resetPassword() {
    if (!email) return setError("Enter your email first, then choose reset.");
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/dashboard`,
    });
    setError(error ? error.message : "Password reset email sent.");
  }

  return (
    <div className="max-w-sm mx-auto py-12 space-y-4">
      <h1 className="font-display text-2xl">Sign in</h1>
      <form onSubmit={signIn} className="space-y-3">
        <input className="input" type="email" placeholder="Email" value={email}
               onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        <input className="input" type="password" placeholder="Password" value={password}
               onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        {error && <p className="text-sm text-ember">{error}</p>}
        <button className="btn-gold w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
      <div className="flex justify-between text-sm text-faded">
        <button onClick={resetPassword} className="hover:text-parchment">Forgot password</button>
        <Link href="/register" className="hover:text-parchment">Create account</Link>
      </div>
    </div>
  );
}
