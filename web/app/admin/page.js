import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session.js";
import AppNavbar from "@/components/AppNavbar.js";
import AdminPanel from "@/components/AdminPanel.js";
import AdminLoginCard from "@/components/AdminLoginCard.js";
import {
  isPlatformAdminUser,
  platformAdminConfigured,
} from "@/lib/platform-admin.js";

export default async function AdminPage() {
  const session = await getSession();

  if (!platformAdminConfigured()) {
    return (
      <main className="min-h-screen bg-background">
        <header className="border-b border-border bg-surface/80 px-4 py-3 backdrop-blur-md">
          <div className="brand-gradient-text mx-auto max-w-6xl text-lg font-bold">
            Platform admin
          </div>
        </header>
        <div className="mx-auto max-w-lg px-4 py-16 text-center text-muted">
          <p className="font-medium text-foreground">Admin panel not configured</p>
          <p className="mt-2 text-sm">
            Set <code className="text-accent">PLATFORM_ADMIN_USER_IDS</code> in{" "}
            <code>web/.env.local</code> to your Discord user ID.
          </p>
          <Link href="/" className="mt-6 inline-block text-sm text-accent hover:underline">
            ← Back to dashboard login
          </Link>
        </div>
      </main>
    );
  }

  if (!session.user) {
    return (
      <main className="min-h-screen bg-background">
        <header className="border-b border-border bg-surface/80 px-4 py-3 backdrop-blur-md">
          <div className="brand-gradient-text mx-auto max-w-6xl text-lg font-bold">
            Platform admin
          </div>
        </header>
        <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-16">
          <AdminLoginCard />
        </div>
      </main>
    );
  }

  if (!isPlatformAdminUser(session.user.id)) {
    return (
      <main className="min-h-screen bg-background">
        <AppNavbar title="Platform admin" userLabel={session.user.global_name || session.user.username} />
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <p className="text-lg font-semibold">Access denied</p>
          <p className="mt-2 text-sm text-muted">
            Your Discord account is not in the platform admin allowlist.
          </p>
          <Link href="/dashboard" className="mt-6 inline-block text-sm text-accent hover:underline">
            Go to server dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <AppNavbar
        title="Platform admin"
        userLabel={session.user.global_name || session.user.username}
      />
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap gap-3 text-sm">
          <Link href="/dashboard" className="text-accent hover:underline">
            Server dashboard
          </Link>
        </div>
        <AdminPanel />
      </div>
    </main>
  );
}
