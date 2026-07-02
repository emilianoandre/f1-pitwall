"use client";

import { useLiveConnection } from "@/lib/sse";
import { useLiveStore } from "@/lib/liveStore";
import { SessionPicker } from "@/components/broadcast/SessionPicker";
import { Dashboard } from "@/components/broadcast/Dashboard";
import { DriverDetail } from "@/components/broadcast/DriverDetail";

export default function Home() {
  useLiveConnection();
  const screen = useLiveStore((s) => s.screen);

  return (
    <div className="f1-app">
      {screen === "picker" && <SessionPicker />}
      {screen === "dashboard" && <Dashboard />}
      {screen === "driver" && <DriverDetail />}
    </div>
  );
}
