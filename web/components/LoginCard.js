"use client";

import { Alert, Button, Card } from "@heroui/react";

const AUTH_ERRORS = {
  oauth_failed: {
    title: "Login failed",
    description:
      "Could not finish Discord sign-in. Try again. If it keeps failing, the Discord client secret or redirect URL may be wrong in Vercel env vars.",
  },
  missing_code: {
    title: "Login cancelled",
    description: "Discord did not return an authorization code. Try signing in again.",
  },
};

export default function LoginCard({ loginUrl, authError }) {
  const errorInfo = authError ? AUTH_ERRORS[authError] : null;

  return (
    <Card className="overflow-hidden border border-border/60 p-0 shadow-lg">
      <div className="brand-gradient h-1 w-full" />
      <div className="p-6">
        <Card.Header className="p-0">
          <Card.Title className="text-2xl">Server dashboard</Card.Title>
          <Card.Description>
            Sign in with Discord to configure channels, feature toggles, and view server
            stats. Only server administrators can access guild settings.
          </Card.Description>
        </Card.Header>
        <Card.Content className="flex flex-col gap-4 p-0 pt-4">
          {errorInfo ? (
            <Alert status="danger">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>{errorInfo.title}</Alert.Title>
                <Alert.Description>{errorInfo.description}</Alert.Description>
              </Alert.Content>
            </Alert>
          ) : null}
          {loginUrl ? (
            <Button
              variant="primary"
              className="w-fit font-semibold"
              onPress={() => {
                window.location.assign(loginUrl);
              }}
            >
              Login with Discord
            </Button>
          ) : (
            <Alert status="warning">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>OAuth not configured</Alert.Title>
                <Alert.Description>
                  Set DISCORD_CLIENT_ID in web/.env.local and add your OAuth redirect
                  in the Discord Developer Portal.
                </Alert.Description>
              </Alert.Content>
            </Alert>
          )}
          <p className="text-sm text-muted">
            Free plan shows the last 90 days of stats. Premium unlocks full history.
          </p>
        </Card.Content>
      </div>
    </Card>
  );
}
