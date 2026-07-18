"use client";

import { type ReactElement, type ReactNode, useEffect, useState } from "react";
import { asyncWithLDProvider } from "launchdarkly-react-client-sdk";

const clientSideID = process.env.NEXT_PUBLIC_LAUNCHDARKLY_CLIENT_SIDE_ID;

type LDProviderComponent = (props: { children: ReactNode }) => ReactElement;

/**
 * Renders children immediately (flags unavailable) and swaps in the real
 * LDProvider once the client finishes initializing, so a slow/missing
 * LaunchDarkly connection never blocks the dashboard from rendering.
 */
export function LaunchDarklyProvider({ children }: { children: ReactNode }) {
  const [Provider, setProvider] = useState<LDProviderComponent | null>(null);

  useEffect(() => {
    if (!clientSideID) return;
    let cancelled = false;
    void asyncWithLDProvider({
      clientSideID,
      context: { kind: "user", key: "anonymous" },
      timeout: 5,
    }).then((P) => {
      if (!cancelled) setProvider(() => P);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!clientSideID || !Provider) return <>{children}</>;
  return <Provider>{children}</Provider>;
}
