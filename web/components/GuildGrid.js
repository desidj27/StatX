"use client";

import Link from "next/link";
import { Button, Card } from "@heroui/react";

export default function GuildGrid({ guilds, inviteUrl }) {
  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {inviteUrl ? (
          <Button
            variant="primary"
            className="w-fit font-semibold"
            onPress={() => window.open(inviteUrl, "_blank", "noopener,noreferrer")}
          >
            Invite to server
          </Button>
        ) : null}
      </div>

      {guilds.length === 0 ? (
        <Card className="border border-border/60 p-6">
          <Card.Content className="flex flex-col gap-2 p-0">
            <p className="font-medium">No servers found yet</p>
            <p className="text-sm text-muted">
              Invite the bot to a server you administer, then refresh this page.
            </p>
          </Card.Content>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
      )}
    </div>
  );
}
