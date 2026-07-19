import { createFileRoute, redirect } from "@tanstack/react-router";
import { RecentrePage } from "@/components/recentre/recentre-page";
import { isRecentreStateId } from "@/lib/recentre";

export const Route = createFileRoute("/_authenticated/recentre/$state")({
  beforeLoad: ({ params }) => {
    if (!isRecentreStateId(params.state)) throw redirect({ to: "/recentre" });
  },
  head: ({ params }) => ({
    meta: [
      {
        title: `${isRecentreStateId(params.state) ? params.state[0].toUpperCase() + params.state.slice(1) : "Recentre"} — EdgeScope`,
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RecentreGuideRoute,
});

function RecentreGuideRoute() {
  const { state } = Route.useParams();
  if (!isRecentreStateId(state)) return null;
  return <RecentrePage stateId={state} />;
}
