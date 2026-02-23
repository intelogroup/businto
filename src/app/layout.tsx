import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Businto – Intelligent Dispatch for Private Transport",
  description: "Route your transportation requests to 50+ local operators instantly. School routes, elderly care, private charters.",
};

import { Footer } from "@/components/footer";
import { TripsSidebar } from "@/components/trips-sidebar";
import { SimulationProvider } from "@/components/simulation-provider";
import { AuthProvider } from "@/hooks/use-auth";
import { NotificationProvider } from "@/hooks/use-notifications";
import { Toaster } from "@/components/ui/toaster";

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
            <TripsSidebar>
              <SimulationProvider>
                <div className="flex flex-col min-h-screen">
                  <main className="flex-grow">
                    {children}
                  </main>
                  <Footer />
                </div>
              </SimulationProvider>
            </TripsSidebar>
          </NotificationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
