'use client'

import { HealthCardRow } from "@/components/health-card-row";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <HealthCardRow />
    </main>
  );
}
