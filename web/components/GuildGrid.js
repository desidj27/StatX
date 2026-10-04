"use client";

import Link from "next/link";
import { Button, Card } from "@heroui/react";

export default function GuildGrid({ guilds, inviteUrl }) {
  if (guilds.length === 0) {
    return (
      <Card className="mt-6 p-6">
        <Card.Content className="flex flex-col gap-4">
          <p>No servers found yet.</p>
          {inviteUrl && (
            <Button
              variant="primary"
              className="w-fit"
              onPress={() => window.location.assign(inviteUrl)}
            >
              Invite bot to a server
            </Button>
          )}
        </Card.Content>
      </Card>
    );
  }

  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {guilds.map((guild) => (
        <Link key={guild.id} href={`/dashboard/${guild.id}`}>
          <Card className="h-full border border-border/60 p-4 transition-colors hover:border-accent/40 hover:bg-surface-secondary">
            <Card.Header>
              <Card.Title>{guild.name}</Card.Title>
              <Card.Description className="font-mono text-xs">
                {guild.id}
              </Card.Description>
            </Card.Header>
          </Card>
        </Link>
      ))}
    </div>
  );
}
