import { useEffect, useState } from "react";

function computeGreeting(): string {
  // Asia/Kolkata hour (IST, UTC+5:30)
  const hourStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    hour12: false,
  }).format(new Date());
  const hour = parseInt(hourStr, 10);
  if (hour >= 5 && hour < 12) return "Good Morning";
  if (hour >= 12 && hour < 17) return "Good Afternoon";
  return "Good Evening"; // 17:00–23:59 and 00:00–04:59
}

export function useISTGreeting(): string {
  const [g, setG] = useState<string>(() => computeGreeting());
  useEffect(() => {
    const tick = () => setG(computeGreeting());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);
  return g;
}
