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
import { Sheet, SheetContent, SheetTrigger, SheetClose, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

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
          ? "py-4 bg-white border-b border-neutral-200"
          : "py-6 bg-white border-b border-neutral-200"
      )}
    >
      <div className="container mx-auto max-w-7xl flex items-center justify-between px-6">
        <Link href="/" className="font-semibold text-2xl tracking-tight text-neutral-900 group cursor-pointer flex items-center gap-3">
          <div className="w-9 h-9 bg-black rounded-full flex items-center justify-center transition-colors duration-150">
            <Image src="/brand-mark.svg" alt="Businto" width={28} height={28} />
          </div>
          <span className="text-neutral-900">Businto</span>
        </Link>

        <div className="hidden md:flex items-center gap-8 mr-auto ml-16">
          <Link
            href="/operators"
            className="text-sm font-medium text-neutral-600 hover:text-black transition-colors duration-150"
          >
            Operators
          </Link>
          <Link
            href="/pricing"
            className="text-sm font-medium text-neutral-600 hover:text-black transition-colors duration-150"
          >
            Pricing
          </Link>
          {isAuthenticated && (
            <>
              <Link
                href="/trips"
                className="text-sm font-medium text-neutral-600 hover:text-black transition-colors duration-150"
              >
                My Trips
              </Link>
              <Link
                href="/dashboard/bookings"
                className="text-sm font-medium text-neutral-600 hover:text-black transition-colors duration-150"
              >
                Bookings
              </Link>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Mobile Menu */}
          {mounted && (
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden h-10 w-10">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] p-0">
                <SheetHeader className="p-6 border-b border-neutral-100">
                  <SheetTitle asChild>
                    <Link href="/" className="font-semibold text-xl tracking-tighter text-neutral-900 flex items-center gap-3 text-left">
                      <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center">
                        <Image src="/brand-mark.svg" width={24} height={24} alt="Businto" />
                      </div>
                      <span>Businto</span>
                    </Link>
                  </SheetTitle>
                  <SheetDescription className="sr-only">
                    Navigation menu for mobile users.
                  </SheetDescription>
                </SheetHeader>
                <div className="p-6 space-y-1">
                  <SheetClose asChild>
                    <Link
                      href="/operators"
                      className="block py-3 px-4 rounded-lg text-sm font-semibold text-neutral-600 hover:bg-white hover:text-neutral-900 transition-colors"
                    >
                      Operators
                    </Link>
                  </SheetClose>
                  <SheetClose asChild>
                    <Link
                      href="/pricing"
                      className="block py-3 px-4 rounded-lg text-sm font-semibold text-neutral-600 hover:bg-white hover:text-neutral-900 transition-colors"
                    >
                      Pricing
                    </Link>
                  </SheetClose>
                  {isAuthenticated && (
                    <>
                      <SheetClose asChild>
                        <Link
                          href="/trips"
                          className="block py-3 px-4 rounded-lg text-sm font-semibold text-neutral-600 hover:bg-white hover:text-neutral-900 transition-colors"
                        >
                          My Trips
                        </Link>
                      </SheetClose>
                      <SheetClose asChild>
                        <Link
                          href="/dashboard/bookings"
                          className="block py-3 px-4 rounded-lg text-sm font-semibold text-neutral-600 hover:bg-white hover:text-neutral-900 transition-colors"
                        >
                          Bookings
                        </Link>
                      </SheetClose>
                    </>
                  )}
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
                      <Button
                        variant="ghost"
                        className="w-full justify-start text-red-500 hover:text-red-600 hover:bg-red-50 font-semibold"
                        onClick={async () => {
                          await logout();
                          window.location.href = "/";
                        }}
                      >
                        <LogOut className="mr-3 h-4 w-4" />
                        Sign Out
                      </Button>
                    </>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          )}

          {mounted && (
            <>
              <NotificationCenter />

              {isAuthenticated ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-10 flex items-center gap-2 px-2 hover:bg-white rounded-md transition-colors duration-150">
                      <div className="w-8 h-8 rounded-full overflow-hidden border border-neutral-200">
                        <img
                          src={user?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.name}`}
                          alt={user?.name}
                          className="w-full h-full object-cover"
                          suppressHydrationWarning
                        />
                      </div>
                      <div className="hidden lg:flex flex-col items-start leading-tight">
                        <span className="text-sm font-medium text-neutral-900">{user?.name}</span>
                        <span className="text-[10px] font-medium text-neutral-400 capitalize">{user?.role}</span>
                      </div>
                      <ChevronDown size={14} className="text-neutral-400 hidden lg:block" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 mt-2 p-2 rounded-lg border-neutral-100 shadow-lg bg-white">
                    <DropdownMenuLabel className="px-3 py-2">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-semibold text-neutral-900">{user?.name}</span>
                        <span className="text-xs text-neutral-500 font-normal">{user?.email}</span>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-white mx-1" />
                    <DropdownMenuItem asChild className="focus:bg-white rounded-md px-3 py-2 cursor-pointer group">
                      <Link href="/users" className="flex items-center w-full">
                        <User size={16} className="mr-3 text-neutral-400 group-hover:text-neutral-900 transition-colors duration-150" />
                        <span className="text-sm font-medium text-neutral-600 group-hover:text-neutral-900 transition-colors duration-150">Users & Team</span>
                      </Link>
                    </DropdownMenuItem>

                    {(user?.role === "admin" || user?.role === "manager") && (
                      <DropdownMenuItem asChild className="focus:bg-white rounded-md px-3 py-2 cursor-pointer group">
                        <Link href="/admin" className="flex items-center w-full">
                          <LayoutDashboard size={16} className="mr-3 text-neutral-400 group-hover:text-neutral-900 transition-colors duration-150" />
                          <span className="text-sm font-medium text-neutral-600 group-hover:text-neutral-900 transition-colors duration-150">Admin Panel</span>
                        </Link>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem className="focus:bg-white rounded-md px-3 py-2 cursor-pointer group">
                      <Settings size={16} className="mr-3 text-neutral-400 group-hover:text-neutral-900 transition-colors duration-150" />
                      <span className="text-sm font-medium text-neutral-600 group-hover:text-neutral-900 transition-colors duration-150">Settings</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="focus:bg-white rounded-md px-3 py-2 cursor-pointer group">
                      <Shield size={16} className="mr-3 text-neutral-400 group-hover:text-neutral-900 transition-colors duration-150" />
                      <span className="text-sm font-medium text-neutral-600 group-hover:text-neutral-900 transition-colors duration-150">Security</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-white mx-1" />
                    <DropdownMenuItem
                      onClick={async () => {
                        await logout();
                        window.location.href = "/";
                      }}
                      className="focus:bg-red-50 rounded-md px-3 py-2 cursor-pointer group"
                    >
                      <LogOut size={16} className="mr-3 text-red-400 group-hover:text-red-600 transition-colors duration-150" />
                      <span className="text-sm font-medium text-red-500 group-hover:text-red-600 transition-colors duration-150">Sign out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <>
                  <Link href="/login">
                    <Button variant="ghost" size="sm" className="text-sm font-medium text-neutral-600 hover:text-black hover:bg-white rounded-md h-9 transition-colors duration-150">
                      Sign In
                    </Button>
                  </Link>
                  <Link href="/signup" className="hidden sm:block">
                    <Button size="sm" className="bg-neutral-900 text-white text-sm font-medium rounded-md h-9 hover:bg-black transition-colors duration-150">
                      Sign Up
                    </Button>
                  </Link>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
