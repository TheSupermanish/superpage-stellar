"use client";

import {
  ReactNode,
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";

interface StellarWalletState {
  connected: boolean;
  publicKey: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  signTransaction: (xdr: string, network?: string) => Promise<string>;
}

const StellarWalletContext = createContext<StellarWalletState>({
  connected: false,
  publicKey: null,
  connect: async () => {},
  disconnect: () => {},
  signTransaction: async () => "",
});

export function useStellarWallet() {
  return useContext(StellarWalletContext);
}

interface StellarWalletProviderProps {
  children: ReactNode;
}

export function StellarWalletProvider({ children }: StellarWalletProviderProps) {
  const [connected, setConnected] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Check if Freighter is already connected
    checkConnection();
  }, []);

  async function checkConnection() {
    try {
      const freighter = await getFreighter();
      if (!freighter) return;

      const isConnected = await freighter.isConnected();
      if (isConnected) {
        const { address } = await freighter.getAddress();
        if (address) {
          setPublicKey(address);
          setConnected(true);
        }
      }
    } catch {
      // Freighter not installed or not connected
    }
  }

  const connect = useCallback(async () => {
    const freighter = await getFreighter();
    if (!freighter) {
      window.open("https://www.freighter.app/", "_blank");
      throw new Error("Please install the Freighter wallet extension");
    }

    const { address } = await freighter.requestAccess();
    if (address) {
      setPublicKey(address);
      setConnected(true);
    }
  }, []);

  const disconnect = useCallback(() => {
    setPublicKey(null);
    setConnected(false);
  }, []);

  const signTransaction = useCallback(
    async (xdr: string, network?: string): Promise<string> => {
      const freighter = await getFreighter();
      if (!freighter) throw new Error("Freighter not available");

      const result = await freighter.signTransaction(xdr, {
        networkPassphrase: network || "Test SDF Network ; September 2015",
      });
      return result.signedTxXdr;
    },
    []
  );

  if (!mounted) return null;

  return (
    <StellarWalletContext.Provider
      value={{ connected, publicKey, connect, disconnect, signTransaction }}
    >
      {children}
    </StellarWalletContext.Provider>
  );
}

/** Dynamically import Freighter to avoid SSR issues */
async function getFreighter() {
  try {
    const mod = await import("@stellar/freighter-api");
    return mod;
  } catch {
    return null;
  }
}
