/**
 * Agent Configuration
 *
 * Loads and validates environment variables for the AI agent.
 */
import "dotenv/config";

export type ChainType = "evm" | "stellar";

export interface AgentConfig {
  // LLM
  llmProvider: "anthropic" | "openai" | "google";
  llmModel: string;
  llmApiKey: string;

  // Merchant
  merchantUrl: string;

  // Wallet (EVM)
  walletPrivateKey?: `0x${string}`;

  // Wallet (Stellar)
  stellarSecretKey?: string;
  horizonUrl?: string;

  // Chain
  chainType: ChainType;
  network: string;
  chainId: number;
  rpcUrl: string;
  usdcAddress: string;
  explorerUrl: string;

  // ERC-8004 Trustless Identity
  erc8004AgentId?: string;

  // Behavior
  maxSteps: number;
  autoApprovePayments: boolean;
  verbose: boolean;
}

export function loadConfig(): AgentConfig {
  const provider = (process.env.LLM_PROVIDER || "anthropic") as
    | "anthropic"
    | "openai"
    | "google";

  const apiKeyMap: Record<string, string | undefined> = {
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    google: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY,
  };
  const envVarMap: Record<string, string> = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
    google: "GOOGLE_GENERATIVE_AI_API_KEY",
  };

  const llmApiKey = apiKeyMap[provider];
  if (!llmApiKey) {
    throw new Error(`Missing API key: set ${envVarMap[provider]}`);
  }

  // Determine chain type from network name
  const network = process.env.X402_CHAIN || "flow-testnet";
  const chainType: ChainType = network.startsWith("stellar") ? "stellar" : "evm";

  // Validate wallet keys based on chain type
  const walletPrivateKey = process.env.WALLET_PRIVATE_KEY;
  const stellarSecretKey = process.env.STELLAR_SECRET_KEY;

  if (chainType === "stellar") {
    if (!stellarSecretKey?.startsWith("S")) {
      throw new Error("STELLAR_SECRET_KEY must be set (S-prefixed Stellar secret key) for Stellar networks");
    }
  } else {
    if (!walletPrivateKey?.startsWith("0x")) {
      throw new Error("WALLET_PRIVATE_KEY must be set (0x-prefixed hex) for EVM networks");
    }
  }

  // Stellar defaults
  const stellarDefaults = {
    horizonUrl: process.env.HORIZON_URL || "https://horizon-testnet.stellar.org",
    usdcIssuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    explorerUrl: network === "stellar"
      ? "https://stellar.expert/explorer/public"
      : "https://stellar.expert/explorer/testnet",
  };

  // EVM defaults
  const evmDefaults = {
    chainId: parseInt(process.env.CHAIN_ID || "545", 10),
    rpcUrl: process.env.RPC_URL || "https://testnet.evm.nodes.onflow.org",
    usdcAddress: process.env.USDC_ADDRESS || "0x291b030d596cf505f774426d8de7c946ce5af7a5",
    explorerUrl: process.env.EXPLORER_URL || "https://evm-testnet.flowscan.io",
  };

  return {
    llmProvider: provider,
    llmModel:
      process.env.LLM_MODEL ||
      ({ anthropic: "claude-sonnet-4-20250514", openai: "gpt-4o", google: "gemini-2.0-flash" }[provider] ?? "claude-sonnet-4-20250514"),
    llmApiKey,
    merchantUrl: process.env.MERCHANT_URL || "http://localhost:1337",
    walletPrivateKey: walletPrivateKey as `0x${string}` | undefined,
    stellarSecretKey,
    horizonUrl: stellarDefaults.horizonUrl,
    chainType,
    network,
    chainId: chainType === "stellar" ? 0 : evmDefaults.chainId,
    rpcUrl: chainType === "stellar" ? stellarDefaults.horizonUrl : evmDefaults.rpcUrl,
    usdcAddress: chainType === "stellar" ? stellarDefaults.usdcIssuer : evmDefaults.usdcAddress,
    explorerUrl: chainType === "stellar" ? stellarDefaults.explorerUrl : evmDefaults.explorerUrl,
    erc8004AgentId: process.env.ERC8004_AGENT_ID || undefined,
    maxSteps: parseInt(process.env.MAX_STEPS || "20", 10),
    autoApprovePayments: process.env.AUTO_APPROVE_PAYMENTS === "true",
    verbose: process.env.VERBOSE !== "false",
  };
}
