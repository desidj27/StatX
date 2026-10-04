import "./globals.css";

export const metadata = {
  title: "Bot Dashboard",
  description: "Configure your Discord server bot",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark" data-theme="dark" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
