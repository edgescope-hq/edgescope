import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/notebook")({
  head: () => ({
    meta: [{ title: "Playbook — EdgeScope" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/playbook" });
  },
  component: () => null,
});
