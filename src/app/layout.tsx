import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Businto – Intelligent Dispatch for Private Transport",
  description: "Route your transportation requests to 50+ local operators instantly. School routes, elderly care, private charters.",
};

import { Footer } from "@/components/footer";
import { AuthProvider } from "@/hooks/use-auth";
import { NotificationProvider } from "@/hooks/use-notifications";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body
        className="font-sans antialiased bg-white"
      >
        <AuthProvider>
          <NotificationProvider>
            <Toaster />
            <SonnerToaster position="top-right" richColors closeButton />
            <div className="flex flex-col min-h-screen">
              <main className="flex-grow">
                {children}
              </main>
              <Footer />
            </div>
          </NotificationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
