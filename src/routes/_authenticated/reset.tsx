import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/reset")({
  beforeLoad: () => {
    throw redirect({ to: "/recentre", replace: true });
  },
});
