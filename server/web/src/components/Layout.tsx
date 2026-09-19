import { useQuery } from "@tanstack/react-query";
import { Link, NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import { fetchMe } from "../api";
import { useIsDesktop } from "../hooks/useMediaQuery";
import PerseusMark from "./PerseusMark";

const NAV_ITEMS = [
  { to: "/", label: "Today / Overview", icon: "▦", end: true },
  { to: "/sleep", label: "Sleep & Recovery", icon: "◔" },
  { to: "/workouts", label: "Workouts & Activity", icon: "↗" },
  { to: "/metrics", label: "Health & Vitals", icon: "⌁" },
  { to: "/correlations", label: "Correlations", icon: "⌘" },
  { to: "/trends", label: "Trends", icon: "⌁" },
];

/* Metrics and Correlations are absent: they need width the phone does not have,
   so below 768px they stay reachable by URL only. Settings sits under More. */
const TAB_ITEMS = [
  { to: "/", label: "Today", end: true },
  { to: "/sleep", label: "Sleep" },
  { to: "/workouts", label: "Train" },
  { to: "/trends", label: "Trends" },
  { to: "/settings", label: "More" },
];

export default function Layout({ children }: { children: ReactNode }) {
  const isDesktop = useIsDesktop();
  const { data: user } = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="min-h-screen flex flex-col">
      {isDesktop ? (
        <aside className="side-nav">
          <Link to="/" className="nav-brand" aria-label="Perseus home">
            <PerseusMark size={42} />
            <span className="brand-copy"><strong>Perseus</strong><small>Stronger you</small></span>
          </Link>
          <div className="side-sync"><i /> Health data connected</div>
          <nav>
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end}>
                <span aria-hidden>{item.icon}</span>{item.label}
              </NavLink>
            ))}
          </nav>
          <NavLink to="/settings" className="side-account">
            <span className="account-avatar">{(user?.display_name || user?.login || "P").slice(0, 1).toUpperCase()}</span>
            <span><strong>{user?.display_name || user?.login || "Local profile"}</strong><small>Settings</small></span>
          </NavLink>
        </aside>
      ) : null}

      <main className={`flex-1 flex flex-col${isDesktop ? " app-with-sidebar" : ""}`}>{children}</main>

      {!isDesktop ? (
        <>
          <Link to="/" className="mobile-brand" aria-label="Perseus home">
            <PerseusMark size={28} />
            <span>Perseus</span>
          </Link>
          {/* Reserves the tab bar's height so the last row is not covered. */}
          <div aria-hidden className="h-[76px]" />
          <nav className="tabs">
            {TAB_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </>
      ) : null}
    </div>
  );
}
