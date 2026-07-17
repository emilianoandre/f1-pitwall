"use client";

import { usePathname } from "next/navigation";

export function SignOutButton() {
  const pathname = usePathname();
  if (pathname.startsWith("/login")) return null;

  return (
    <button
      onClick={() => {
        void fetch("/api/logout", { method: "POST" }).then(() => {
          window.location.href = "/login";
        });
      }}
      className="fixed bottom-3 right-3 z-50 rounded border border-neutral-800 bg-neutral-950/80 px-2 py-1 text-[10px] uppercase tracking-wide text-neutral-500 backdrop-blur hover:text-neutral-300"
    >
      Sign out
    </button>
  );
}
