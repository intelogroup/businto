"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { LogOut, User, Settings, Shield, ChevronDown, LayoutDashboard, Menu, X, Bus } from "lucide-react";
import { NotificationCenter } from "./notification-center";
import { Sheet, SheetContent, SheetTrigger, SheetClose } from "@/components/ui/sheet";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { user, logout, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-colors duration-150",
        scrolled
          ? "py-4 bg-white border-b border-black/[0.03]"
          : "py-6 bg-transparent"
      )}
    >
      <div className="container mx-auto max-w-7xl flex items-center justify-between px-6">
        <Link href="/" className="font-semibold text-2xl tracking-tighter text-neutral-900 group cursor-pointer flex items-center gap-3">
          <div className="w-9 h-9 bg-black rounded-full flex items-center justify-center transition-all duration-200 group-hover:shadow-lg group-hover:shadow-black/30">
            <Image src="/brand-mark.svg" alt="Businto" width={28} height={28} />
          </div>
          <span className="text-neutral-900 tracking-[-0.04em]">Businto</span>
        </Link>

        <div className="hidden md:flex items-center gap-10 mr-auto ml-16">
          {["Operators", "Pricing"].map((item) => (
            <a
              key={item}
              href="#"
              className="text-[13px] font-bold uppercase tracking-widest text-neutral-500 hover:text-black transition-colors duration-150 relative group"
            >
              {item}
              <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-0 h-[2px] bg-neutral-950 transition-all duration-150 group-hover:w-full" />
            </a>
          ))}
          <Link
            href="/trips"
            className="text-[13px] font-bold uppercase tracking-widest text-neutral-500 hover:text-black transition-colors duration-150 relative group"
          >
            My Trips
            <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-0 h-[2px] bg-neutral-950 transition-all duration-150 group-hover:w-full" />
          </Link>
        </div>

        <div className="flex items-center gap-3">
          {/* Mobile Menu */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden h-10 w-10">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] p-0">
              <div className="p-6 border-b border-neutral-100">
                <Link href="/" className="font-semibold text-xl tracking-tighter text-neutral-900 flex items-center gap-3">
                  <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center">
                    <Image src="/brand-mark.svg" width={24} height={24} alt="Businto" />
                  </div>
                  <span>Businto</span>
                </Link>
              </div>
              <div className="p-6 space-y-1">
                {["Operators", "Pricing"].map((item) => (
                  <SheetClose asChild key={item}>
                    <a
                      href="#"
                      className="block py-3 px-4 rounded-lg text-sm font-semibold text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 transition-colors"
                    >
                      {item}
                    </a>
                  </SheetClose>
                ))}
                <SheetClose asChild>
                  <Link
                    href="/trips"
                    className="block py-3 px-4 rounded-lg text-sm font-semibold text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 transition-colors"
                  >
                    My Trips
                  </Link>
                </SheetClose>
              </div>
              <div className="p-6 border-t border-neutral-100 space-y-3">
                {!isAuthenticated && (
                  <>
                    <Link href="/login" className="block">
                      <Button variant="outline" className="w-full">Sign In</Button>
                    </Link>
                    <Link href="/signup" className="block">
                      <Button className="w-full bg-neutral-950">Sign Up</Button>
                    </Link>
                  </>
                )}
                {isAuthenticated && (
                  <>
                    <Link href="/dashboard" className="block">
                      <Button variant="outline" className="w-full">Dashboard</Button>
                    </Link>
                    <Link href="/dashboard/bookings" className="block">
                      <Button variant="outline" className="w-full">My Bookings</Button>
                    </Link>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.dispatchEvent(new CustomEvent('open-trips-sidebar'))}
            className="hidden sm:flex text-xs font-semibold uppercase tracking-widest text-yellow-600 bg-yellow-50/50 hover:bg-yellow-100/50 rounded-md px-4 h-10 transition-colors duration-150 gap-2"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-600" />
            Tracking
          </Button>

          <NotificationCenter />

          {isAuthenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 flex items-center gap-2 px-2 hover:bg-neutral-100/50 rounded-md transition-colors duration-150">
                  <div className="w-8 h-8 rounded-lg overflow-hidden border border-neutral-200">
                    <img
                      src={user?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.name}`}
                      alt={user?.name}
                      className="w-full h-full object-cover"
                      suppressHydrationWarning
                    />
                  </div>
                  <div className="hidden lg:flex flex-col items-start leading-none gap-0.5">
                    <span className="text-[11px] font-bold text-neutral-900 uppercase tracking-wider">{user?.name}</span>
                    <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-[0.1em]">{user?.role}</span>
                  </div>
                  <ChevronDown size={14} className="text-neutral-400 hidden lg:block" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 mt-2 p-2 rounded-lg border-neutral-100 shadow-sm bg-white">
                <DropdownMenuLabel className="px-3 py-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-bold text-neutral-900">{user?.name}</span>
                    <span className="text-xs text-neutral-500 font-medium">{user?.email}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-neutral-100 mx-1" />
                <DropdownMenuItem asChild className="focus:bg-neutral-50 rounded-md px-3 py-2 cursor-pointer group">
                  <Link href="/users" className="flex items-center w-full">
                    <User size={16} className="mr-3 text-neutral-400 group-hover:text-black transition-colors duration-150" />
                    <span className="text-sm font-semibold text-neutral-600 group-hover:text-black transition-colors duration-150">Users & Team</span>
                  </Link>
                </DropdownMenuItem>

                {(user?.role === "admin" || user?.role === "manager") && (
                  <DropdownMenuItem asChild className="focus:bg-indigo-50 rounded-md px-3 py-2 cursor-pointer group">
                    <Link href="/admin" className="flex items-center w-full">
                      <LayoutDashboard size={16} className="mr-3 text-indigo-400 group-hover:text-indigo-600 transition-colors duration-150" />
                      <span className="text-sm font-semibold text-neutral-600 group-hover:text-indigo-600 transition-colors duration-150">Admin Panel</span>
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem className="focus:bg-neutral-50 rounded-md px-3 py-2 cursor-pointer group">
                  <Settings size={16} className="mr-3 text-neutral-400 group-hover:text-black transition-colors duration-150" />
                  <span className="text-sm font-semibold text-neutral-600 group-hover:text-black transition-colors duration-150">Settings</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="focus:bg-neutral-50 rounded-md px-3 py-2 cursor-pointer group">
                  <Shield size={16} className="mr-3 text-neutral-400 group-hover:text-black transition-colors duration-150" />
                  <span className="text-sm font-semibold text-neutral-600 group-hover:text-black transition-colors duration-150">Security</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-neutral-100 mx-1" />
                <DropdownMenuItem
                  onClick={async () => {
                    await logout();
                    router.push("/");
                  }}
                  className="focus:bg-red-50 rounded-md px-3 py-2 cursor-pointer group"
                >
                  <LogOut size={16} className="mr-3 text-red-400 group-hover:text-red-600 transition-colors duration-150" />
                  <span className="text-sm font-semibold text-red-500 group-hover:text-red-600 transition-colors duration-150">Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm" className="hidden sm:flex text-xs font-semibold uppercase tracking-widest text-neutral-500 hover:text-black hover:bg-neutral-100/50 rounded-md px-5 h-10 transition-colors duration-150">
                  Sign In
                </Button>
              </Link>
              <Link href="/signup">
                <Button size="lg" className="bg-neutral-950 text-white text-xs font-semibold uppercase tracking-widest rounded-md px-7 h-10 hover:bg-black shadow-sm transition-colors duration-150">
                  Sign Up
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
