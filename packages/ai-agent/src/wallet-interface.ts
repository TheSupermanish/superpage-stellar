/**
 * Common wallet interface for both EVM and Stellar wallets.
 * Used by tools that need chain-agnostic wallet operations.
 */
export interface IWallet {
  /** Public address (0x... for EVM, G... for Stellar) */
  address: string;

  /** Get USDC balance in human-readable format */
  getUsdcBalance(): Promise<string>;

  /**
   * Transfer USDC to a recipient.
   * @param to - Recipient address
   * @param amountBaseUnits - Amount in the chain's base units (string)
   * @returns Transaction hash
   */
  transferUsdc(to: string, amountBaseUnits: string): Promise<string>;

  /** Wait for a transaction to be confirmed */
  waitForTx(hash: string): Promise<boolean>;

  /** Format base units to display amount */
  formatUsdc(baseUnits: string): string;

  /** Sign an arbitrary message (for authentication) */
  signMessage(message: string): Promise<string>;
}
