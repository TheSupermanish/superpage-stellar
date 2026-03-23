"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletConnect } from "./wallet-connect";
import { ThemeToggle } from "./theme-toggle";
import { useAuth } from "./providers/auth-provider";
import { cn } from "@/lib/utils";

export function PublicNavbar() {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();

  const navLinks = [
    { href: "/", label: "Home", show: true },
    { href: "/explore", label: "Explore", show: true },
    { href: "/docs", label: "Docs", show: true },
    { href: "/faucet", label: "Faucet", show: true },
  ];

  return (
    <nav className="sticky top-0 z-50 bg-card/90 backdrop-blur-xl border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          <Link href="/" className="flex items-center gap-3 group">
            <img src="/logo.png" alt="SuperPage" className="h-10 w-auto" />
          </Link>

          <div className="hidden md:flex items-center gap-10">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "text-sm font-medium transition-colors",
                  pathname === link.href
                    ? "text-primary font-bold"
                    : "text-muted-foreground hover:text-primary"
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <ThemeToggle />
            {isAuthenticated ? (
              <Link
                href="/dashboard"
                className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2.5 rounded-full text-sm font-bold transition-all shadow-lg shadow-primary/10"
              >
                Dashboard
              </Link>
            ) : (
              <WalletConnect />
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
