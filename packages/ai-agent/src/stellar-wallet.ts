/**
 * Stellar wallet for making payments on the Stellar network.
 * Uses @stellar/stellar-sdk to build, sign, and submit transactions.
 */

import {
  Keypair,
  Networks,
  Asset,
  TransactionBuilder,
  Operation,
  Horizon,
} from "@stellar/stellar-sdk";
import type { AgentConfig } from "./config.js";

export class StellarWallet {
  public address: string;
  private keypair: Keypair;
  private server: Horizon.Server;
  private networkPassphrase: string;
  private usdcAsset: Asset;
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    if (!config.stellarSecretKey) {
      throw new Error("STELLAR_SECRET_KEY is required for StellarWallet");
    }

    this.config = config;
    this.keypair = Keypair.fromSecret(config.stellarSecretKey);
    this.address = this.keypair.publicKey();

    const horizonUrl = config.horizonUrl || "https://horizon-testnet.stellar.org";
    this.server = new Horizon.Server(horizonUrl);

    // Use testnet passphrase by default, mainnet if explicitly set
    this.networkPassphrase =
      config.network === "stellar"
        ? Networks.PUBLIC
        : Networks.TESTNET;

    // USDC asset — the usdcAddress in config holds the issuer for Stellar
    this.usdcAsset = new Asset("USDC", config.usdcAddress);
  }

  /** Get USDC balance in human-readable format */
  async getUsdcBalance(): Promise<string> {
    try {
      const account = await this.server.loadAccount(this.address);
      const usdcBalance = account.balances.find(
        (b: any) =>
          b.asset_type !== "native" &&
          b.asset_code === "USDC" &&
          b.asset_issuer === this.config.usdcAddress
      );
      return usdcBalance ? usdcBalance.balance : "0";
    } catch (err: any) {
      if (err.response?.status === 404) {
        return "0"; // Account not funded
      }
      throw err;
    }
  }

  /** Get XLM balance */
  async getXlmBalance(): Promise<string> {
    try {
      const account = await this.server.loadAccount(this.address);
      const xlmBalance = account.balances.find(
        (b: any) => b.asset_type === "native"
      );
      return xlmBalance ? xlmBalance.balance : "0";
    } catch (err: any) {
      if (err.response?.status === 404) {
        return "0";
      }
      throw err;
    }
  }

  /**
   * Transfer USDC to a recipient.
   * @param to - Stellar public key (G...)
   * @param amountBaseUnits - Amount in base units (7 decimals: 10000000 = 1.0 USDC)
   * @returns Transaction hash
   */
  async transferUsdc(to: string, amountBaseUnits: string): Promise<string> {
    // Convert base units (7 decimals) to Stellar amount string
    const amount = (Number(amountBaseUnits) / 1e7).toFixed(7);

    const sourceAccount = await this.server.loadAccount(this.address);

    const transaction = new TransactionBuilder(sourceAccount, {
      fee: "100", // 100 stroops = 0.00001 XLM
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.payment({
          destination: to,
          asset: this.usdcAsset,
          amount: amount,
        })
      )
      .setTimeout(60)
      .build();

    transaction.sign(this.keypair);

    const result = await this.server.submitTransaction(transaction);
    return result.hash;
  }

  /** Wait for a transaction to be confirmed (Stellar confirms in ~5s) */
  async waitForTx(hash: string): Promise<boolean> {
    const maxAttempts = 10;
    const delay = 2000;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const tx = await this.server.transactions().transaction(hash).call();
        return tx.successful;
      } catch {
        if (i < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    return false;
  }

  /** Format base units (7 decimals) to display amount */
  formatUsdc(baseUnits: string): string {
    const val = Number(baseUnits) / 1e7;
    return val.toFixed(7).replace(/0+$/, "").replace(/\.$/, ".0");
  }

  /** Sign an arbitrary message with the Stellar keypair (Ed25519) */
  async signMessage(message: string): Promise<string> {
    const signature = this.keypair.sign(Buffer.from(message, "utf-8"));
    return signature.toString("base64");
  }
}
