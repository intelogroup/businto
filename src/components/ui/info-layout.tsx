import React from 'react';
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

interface InfoLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

export function InfoLayout({ children, title, subtitle }: InfoLayoutProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-grow pt-32 pb-20">
        <div className="container mx-auto max-w-4xl px-6">
          <div className="mb-12 border-b border-neutral-100 pb-12">
            <h1 className="text-4xl font-semibold tracking-tight text-neutral-900 mb-4">
              {title}
            </h1>
            {subtitle && (
              <p className="text-xl text-neutral-500 font-medium">
                {subtitle}
              </p>
            )}
          </div>
          <div className="prose prose-neutral max-w-none">
            {children}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
