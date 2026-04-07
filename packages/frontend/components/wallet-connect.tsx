"use client";

import { useState, useEffect } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useAuth } from "./providers/auth-provider";
import { useStellarWallet } from "./providers/stellar-wallet-provider";
import { isStellarNetwork } from "@/lib/chain-config";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Wallet, LogOut, User, Loader2, AlertCircle } from "lucide-react";
import Image from "next/image";

const IS_STELLAR = isStellarNetwork();

interface WalletConnectProps {
  compact?: boolean;
}

const btnClass = (compact?: boolean) =>
  compact
    ? "shimmer-btn px-6 py-3 rounded-full text-sm font-bold text-white transition-all flex items-center gap-2"
    : "shimmer-btn px-8 py-4 rounded-full text-lg font-bold text-white transition-all flex items-center gap-2";

function StellarWalletConnect({ compact }: WalletConnectProps) {
  const [mounted, setMounted] = useState(false);
  const { connected, publicKey, connect, disconnect } = useStellarWallet();

  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return <button className={btnClass(compact)}><Wallet className="h-4 w-4" /><span>Connect Wallet</span></button>;

  const formatAddress = (addr: string | null) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "";

  if (!connected || !publicKey) {
    return (
      <button onClick={connect} className={btnClass(compact)}>
        <Wallet className="h-4 w-4" />
        <span>Connect Freighter</span>
      </button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="gap-2 border-border hover:bg-muted hover:border-border px-4 py-2 rounded-full border transition-all flex items-center">
          <div className="w-7 h-7 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center text-xs text-white font-bold">S</div>
          <span className="hidden sm:inline font-medium font-mono text-sm">{formatAddress(publicKey)}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-card border-border">
        <div className="px-2 py-2">
          <p className="text-xs text-muted-foreground">Stellar Wallet</p>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">{formatAddress(publicKey)}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/dashboard" className="cursor-pointer">Dashboard</a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={disconnect} className="text-red-600 cursor-pointer">
          <LogOut className="h-4 w-4 mr-2" />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function WalletConnect({ compact }: WalletConnectProps = {}) {
  if (IS_STELLAR) return <StellarWalletConnect compact={compact} />;
  return <EVMWalletConnect compact={compact} />;
}

function EVMWalletConnect({ compact }: WalletConnectProps) {
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { disconnect } = useDisconnect();
  const { creator, isAuthenticated, isLoading, signIn, signOut } = useAuth();

  if (!mounted) {
    return (
      <button className={btnClass(compact)}>
        <Wallet className="h-4 w-4" />
        <span>Connect Wallet</span>
      </button>
    );
  }

  const avatarUrl = creator?.avatarUrl
    || `https://api.dicebear.com/7.x/shapes/svg?seed=${creator?.name || address || "user"}`;

  // Format wallet address
  const formatAddress = (addr: string | undefined) => {
    if (!addr) return "";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  // Not connected - show connect button
  if (!isConnected) {
    return (
      <button
        onClick={openConnectModal}
        className={btnClass(compact)}
      >
        <Wallet className="h-4 w-4" />
        <span>Connect Wallet</span>
      </button>
    );
  }

  // Connected but not authenticated - show sign in button
  if (isConnected && !isAuthenticated) {
    const handleConnect = async () => {
      if (isLoading) return;
      setError(null);

      try {
        await signIn();
      } catch (err: any) {
        const msg = err?.message || "Sign in failed";
        if (msg.includes("Backend server") || msg.includes("Failed to fetch")) {
          setError("Backend offline");
        } else if (msg.includes("User rejected") || msg.includes("denied")) {
          setError(null);
        } else {
          setError(msg.length > 30 ? msg.slice(0, 30) + "..." : msg);
          disconnect();
          openConnectModal?.();
        }
      }
    };

    return (
      <div className="flex items-center gap-2">
        {error && (
          <span className="text-xs text-red-500 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {error}
          </span>
        )}
        <button
          onClick={handleConnect}
          disabled={isLoading}
          className={`${btnClass(compact)} disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Connecting...</span>
            </>
          ) : (
            <>
              <Wallet className="h-4 w-4" />
              <span>{error ? "Retry" : "Sign In"}</span>
            </>
          )}
        </button>
      </div>
    );
  }

  // Authenticated - show user menu
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="gap-2 border-border hover:bg-muted hover:border-border px-4 py-2 rounded-full border transition-all flex items-center">
          <Image
            src={avatarUrl}
            alt={creator?.name || "User"}
            width={28}
            height={28}
            className="rounded-full bg-muted shadow-lg shadow-primary/10"
          />
          <span className="hidden sm:inline font-medium">
            {creator?.name || formatAddress(address)}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-card border-border">
        <div className="px-2 py-2 flex items-center gap-3">
          <Image
            src={avatarUrl}
            alt={creator?.name || "User"}
            width={40}
            height={40}
            className="rounded-full bg-muted shrink-0"
          />
          <div>
            <p className="text-sm font-semibold text-foreground">{creator?.name}</p>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              {formatAddress(address)}
            </p>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/dashboard" className="cursor-pointer">
            Dashboard
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="/dashboard/resources" className="cursor-pointer">
            My Resources
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="/dashboard/settings" className="cursor-pointer">
            Settings
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            signOut();
            disconnect();
          }}
          className="text-red-600 cursor-pointer"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
