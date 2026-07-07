import { createFileRoute } from "@tanstack/react-router";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — EdgeScope" },
      {
        name: "description",
        content: "Your private trading overview, performance, and recent trades.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),

  component: DashboardView,
});
