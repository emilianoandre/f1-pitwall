"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "login failed");
        return;
      }
      router.replace(params.get("next") || "/");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm space-y-5 rounded-lg border border-neutral-800 bg-neutral-950 p-8"
    >
      <div>
        <div className="text-xs uppercase tracking-widest text-neutral-600">PitWall</div>
        <h1 className="mt-1 text-xl font-semibold text-neutral-100">Sign in</h1>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="username" className="text-xs uppercase tracking-wide text-neutral-500">
          Username
        </label>
        <input
          id="username"
          name="username"
          autoFocus
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="text-xs uppercase tracking-wide text-neutral-500">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
        />
      </div>

      {error && <p className="text-sm text-[#E10600]">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-[#E10600] px-3 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="f1-app flex min-h-screen items-center justify-center p-4">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
