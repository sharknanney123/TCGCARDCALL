"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function Register() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
      return setError("Username: 3-20 characters, letters, numbers, underscores.");
    }
    setBusy(true);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signUp({
      email, password,
      options: {
        data: { username },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/dashboard`,
      },
    });
    setBusy(false);
    if (error) return setError(error.message);
    router.push("/verify");
  }

  return (
    <div className="max-w-sm mx-auto py-12 space-y-4">
      <h1 className="font-display text-2xl">Join the season</h1>
      <p className="text-sm text-faded">$10,000 in virtual credits is waiting once you verify your email.</p>
      <form onSubmit={signUp} className="space-y-3">
        <input className="input" placeholder="Username (public)" value={username}
               onChange={(e) => setUsername(e.target.value)} required autoComplete="username" />
        <input className="input" type="email" placeholder="Email (never shown publicly)" value={email}
               onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        <input className="input" type="password" placeholder="Password (8+ characters)" value={password}
               onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
        {error && <p className="text-sm text-ember">{error}</p>}
        <button className="btn-gold w-full" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
      </form>
      <p className="text-sm text-faded">
        Already playing? <Link href="/login" className="text-gold hover:underline">Sign in</Link>
      </p>
    </div>
  );
}
