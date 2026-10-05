import { redirect } from "next/navigation";
import { getSession } from "@/lib/session.js";
import { discordOAuthUrl } from "@/lib/discord.js";
import LandingPage from "@/components/LandingPage.js";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }) {
  const session = await getSession();
  if (session?.user) redirect("/dashboard");

  const params = await searchParams;
  const authError = params?.error ?? null;
  const loginUrl = discordOAuthUrl();

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/80 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="brand-gradient-text text-lg font-bold">StatX</div>
          <nav className="flex items-center gap-4 text-sm">
            <a href="#pricing" className="text-muted hover:text-foreground">
              Pricing
            </a>
            {loginUrl ? (
              <a href={loginUrl} className="text-accent hover:underline">
                Login
              </a>
            ) : (
              <span className="text-muted">Login</span>
            )}
          </nav>
        </div>
      </header>
      <LandingPage loginUrl={loginUrl} authError={authError} />
    </main>
  );
}
