import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/recentre")({
  head: () => ({
    meta: [
      { title: "Recentre — EdgeScope" },
      {
        name: "description",
        content: "Pause, settle your mind, and return to your trading process.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Outlet,
});
