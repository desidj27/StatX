"use client";

import Link from "next/link";
import { Button, Card } from "@heroui/react";

export default function AdminLoginCard() {
  return (
    <Card className="overflow-hidden border border-border/60 p-0 shadow-lg">
      <div className="brand-gradient h-1 w-full" />
      <div className="p-6">
        <Card.Header className="p-0">
          <Card.Title className="text-2xl">Platform admin</Card.Title>
          <Card.Description>
            Sign in with Discord to manage all servers and subscription plans. Only
            allowlisted platform admins can access this area.
          </Card.Description>
        </Card.Header>
        <Card.Content className="flex flex-col gap-4 p-0 pt-4">
          <Button
            variant="primary"
            className="w-fit font-semibold"
            onPress={() => {
              window.location.assign("/api/auth/discord?next=/admin");
            }}
          >
            Login with Discord
          </Button>
          <p className="text-sm text-muted">
            Premium unlocks full stats history per server. Free plan keeps the last 90
            days visible.
          </p>
          <Link href="/" className="text-sm text-accent hover:underline">
            ← Server owner login
          </Link>
        </Card.Content>
      </div>
    </Card>
  );
}
