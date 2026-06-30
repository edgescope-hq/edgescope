import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  LineChart,
  CandlestickChart,
  BarChart3,
  Sparkles,
  Users,
  BookOpen,
  Settings,
  Menu,
  X,
  UserCog,
  Wallet,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import appLogo from "@/assets/edgescope-logo.png.asset.json";
import appLogoHorizontal from "@/assets/edgescope-horizontal.png.asset.json";
import { amIAdmin } from "@/lib/invites.functions";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; disabled?: boolean; badge?: string };

const primaryNav: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/trades", label: "My Trades", icon: LineChart },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/playbook", label: "Playbook", icon: BookOpen },
  { to: "/edge-discovery", label: "Scope", icon: Sparkles },
  { to: "/paper", label: "Paper Trading", icon: CandlestickChart, disabled: true, badge: "Soon" },
];

const secondaryBaseNav: NavItem[] = [
  { to: "/community", label: "Community", icon: Users },
  { to: "/accounts", label: "Accounts", icon: Wallet },
];

const settingsItem: NavItem = { to: "/settings", label: "Settings", icon: Settings };

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);

  const adminFn = useServerFn(amIAdmin);
  const { data: adminInfo } = useQuery({
    queryKey: ["am-i-admin"],
    queryFn: async () => {
      try { return await adminFn(); } catch { return { admin: false }; }
    },
    staleTime: 60_000,
    retry: false,
  });

  const secondaryNav: NavItem[] = [
    ...secondaryBaseNav,
    ...(adminInfo?.admin ? [{ to: "/people", label: "People", icon: UserCog } as NavItem] : []),
    settingsItem,
  ];

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const renderItem = (item: NavItem) => {
    const active = !item.disabled && (pathname === item.to || pathname.startsWith(item.to + "/"));
    const Icon = item.icon;
    if (item.disabled) {
      return (
        <div
          key={item.to}
          title="Coming soon"
          aria-disabled
          className="group relative flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground/40"
        >
          <Icon className="h-4 w-4 text-muted-foreground/30" />
          <span>{item.label}</span>
          {item.badge && (
            <span className="ml-auto rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary ring-1 ring-primary/20">{item.badge}</span>
          )}
        </div>
      );
    }
    return (
      <Link
        key={item.to}
        to={item.to}
        className={cn(
          "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
          active ? "bg-primary/10 text-foreground" : "text-muted-foreground/70 hover:bg-white/[0.04] hover:text-foreground",
        )}
      >
        {active && (
          <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
        )}
        <Icon className={cn("h-4 w-4 transition-colors duration-200", active ? "text-primary" : "text-muted-foreground/50 group-hover:text-muted-foreground/80")} />
        <span>{item.label}</span>
      </Link>
    );
  };

  const NavBody = (
    <div className="flex flex-1 flex-col min-h-0">
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
        {primaryNav.map(renderItem)}
      </nav>
      <div className="border-t border-white/[0.05] px-3 py-2 space-y-0.5">
        {secondaryNav.map(renderItem)}
      </div>
    </div>
  );

  const Brand = (
    <div className="flex items-center px-5 py-5">
      <img
        src={appLogoHorizontal.url}
        alt="EdgeScope"
        className="h-12 w-auto max-w-full object-contain"
      />
    </div>
  );

  return (
    <>
      <header className="md:hidden sticky top-0 z-40 flex items-center justify-between border-b border-white/[0.04] bg-[oklch(0.07_0.012_270/0.95)] px-4 py-3 backdrop-blur-xl">
        <img src={appLogoHorizontal.url} alt="EdgeScope" className="h-9 w-auto object-contain" />
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation menu"
          className="grid h-9 w-9 place-items-center rounded-lg bg-white/[0.04] text-foreground ring-1 ring-white/[0.06]"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 flex w-[78%] max-w-[300px] flex-col border-r border-white/[0.06] bg-[oklch(0.07_0.012_270)] shadow-2xl">
            <div className="flex items-center justify-between">
              {Brand}
              <button onClick={() => setMobileOpen(false)} aria-label="Close navigation menu" className="mr-3 grid h-9 w-9 place-items-center rounded-lg bg-white/[0.04] ring-1 ring-white/[0.06]">
                <X className="h-4 w-4" />
              </button>
            </div>
            {NavBody}
          </aside>
        </div>
      )}

      <aside className="hidden md:flex sticky top-0 h-screen w-[250px] shrink-0 flex-col border-r border-white/[0.04] bg-[oklch(0.07_0.012_270/0.95)] backdrop-blur-xl">
        {Brand}
        {NavBody}
      </aside>
    </>
  );
}
