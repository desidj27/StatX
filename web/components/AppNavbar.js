"use client";

import Link from "next/link";
import { Button } from "@heroui/react";

export default function AppNavbar({
  title = "Bot Dashboard",
  backHref = null,
  userLabel = null,
}) {
  return (
    <header className="border-b border-border bg-surface/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {backHref ? (
            <Link
              href={backHref}
              className="shrink-0 text-sm text-default-500 hover:text-foreground"
            >
              ← Servers
            </Link>
          ) : (
            <Link href="/dashboard" className="brand-gradient-text shrink-0 text-lg font-bold">
              {title}
            </Link>
          )}
          {backHref && (
            <span className="truncate font-semibold">{title}</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {userLabel && (
            <span className="hidden text-sm text-default-500 sm:inline">
              {userLabel}
            </span>
          )}
          <Button
            variant="secondary"
            size="sm"
            onPress={() => window.location.assign("/api/auth/logout")}
          >
            Log out
          </Button>
        </div>
      </div>
    </header>
  );
}
