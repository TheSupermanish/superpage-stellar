"use client";

import { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { EthereumWalletProvider } from "./ethereum-wallet-provider";
import { StellarWalletProvider } from "./stellar-wallet-provider";
import { AuthProvider } from "./auth-provider";
import { OnboardingGuard } from "./onboarding-guard";
import { isStellarNetwork } from "@/lib/chain-config";

interface ProvidersProps {
  children: ReactNode;
}

const IS_STELLAR = isStellarNetwork();

function WalletProvider({ children }: { children: ReactNode }) {
  if (IS_STELLAR) {
    return <StellarWalletProvider>{children}</StellarWalletProvider>;
  }
  return <EthereumWalletProvider>{children}</EthereumWalletProvider>;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <WalletProvider>
        <AuthProvider>
          <OnboardingGuard>{children}</OnboardingGuard>
        </AuthProvider>
      </WalletProvider>
    </ThemeProvider>
  );
}








