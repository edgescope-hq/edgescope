import { createFileRoute } from "@tanstack/react-router";
import { RecentrePage } from "@/components/recentre/recentre-page";

export const Route = createFileRoute("/_authenticated/recentre/")({
  component: RecentrePage,
});
