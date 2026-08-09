import { createFileRoute } from "@tanstack/react-router";
import { edgeScopeBrandAssets } from "@/components/brand/edgescope-logo";
import { CinematicLanding } from "@/components/landing/cinematic-landing";
import { getPublicSiteUrl } from "@/lib/site-url";

const SITE_URL = getPublicSiteUrl();
const PAGE_TITLE = "EdgeScope - Trading Journal & Analytics";
const PAGE_DESCRIPTION =
  "EdgeScope helps traders log trades, review execution, track behavior, and uncover evidence-backed patterns from their own journal data.";
const OG_IMAGE = `${SITE_URL}${edgeScopeBrandAssets.lockup.dark}`;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: PAGE_TITLE },
      { name: "description", content: PAGE_DESCRIPTION },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: PAGE_TITLE },
      { property: "og:description", content: PAGE_DESCRIPTION },
      { property: "og:url", content: SITE_URL + "/" },
      { property: "og:type", content: "website" },
      { property: "og:image", content: OG_IMAGE },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: PAGE_TITLE },
      { name: "twitter:description", content: PAGE_DESCRIPTION },
      { name: "twitter:image", content: OG_IMAGE },
    ],
    links: [{ rel: "canonical", href: SITE_URL + "/" }],
    scripts: [
      {
        children:
          "document.documentElement.dataset.cinematicClient='true';try{if(navigator.connection&&navigator.connection.saveData){document.documentElement.dataset.saveData='true'}}catch{}",
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            { "@type": "WebSite", name: "EdgeScope", url: SITE_URL, description: PAGE_DESCRIPTION },
            {
              "@type": "SoftwareApplication",
              name: "EdgeScope",
              applicationCategory: "FinanceApplication",
              operatingSystem: "Web",
              url: SITE_URL,
              description: PAGE_DESCRIPTION,
              image: OG_IMAGE,
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            },
          ],
        }),
      },
    ],
  }),
  component: CinematicLanding,
});
