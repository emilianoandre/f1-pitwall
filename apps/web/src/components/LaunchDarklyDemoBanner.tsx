"use client";

// LaunchDarkly demo — safe to remove. Toggle "PitWall LaunchDarkly Demo"
// (pitwall-launchdarkly-demo) in the LaunchDarkly dashboard to see this
// appear/disappear (refresh after toggling).
import { useFlags } from "launchdarkly-react-client-sdk";

export function LaunchDarklyDemoBanner() {
  const { pitwallLaunchdarklyDemo } = useFlags();
  if (!pitwallLaunchdarklyDemo) return null;

  return (
    <div
      className="fixed left-1/2 top-3 z-50 -translate-x-1/2 rounded px-3 py-1.5 text-xs font-medium text-white shadow-lg"
      style={{ backgroundColor: "#405BFF" }}
    >
      LaunchDarkly is working — this banner is controlled by a feature flag
    </div>
  );
}
