/**
 * Payment MCP Tools
 * 
 * Tools for EVM blockchain payments: transfers, balances, config
 */

import { z } from "zod";
import { privateKeyToAccount } from "viem/accounts";
import {
  createPublicClient,
  createWalletClient,
  http,
  formatUnits,
  encodeFunctionData,
  type Hash,
} from "viem";
import { toolRegistry, defineTool } from "../tool-registry.js";
import {
  getChainConfig,
  getChainMetadata,
  isValidNetwork,
  isStellarNetwork,
  getTokenAddress,
  getAvailableTokens,
  isNativeToken,
  getSupportedNetworks,
  type NetworkId,
  type TokenSymbol,
} from "../../config/chain-config.js";

// ERC20 ABI
const ERC20_ABI = [
  {
    name: "transfer",
    type: "function",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "decimals",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

// ============================================================
// Tool Definitions
// ============================================================

const makePaymentTool = defineTool({
  name: "make_payment",
  description: "Make a payment on EVM chains or Stellar. Supports native tokens, ERC20 tokens (USDC, USDT), and Stellar USDC/XLM.",
  inputSchema: z.object({
    recipientAddress: z.string().describe("Wallet address to send tokens to (0x... for EVM, G... for Stellar)"),
    amount: z.string().describe("Amount in base units (e.g., 10000 for 0.01 USDC with 6 decimals on EVM, 7 decimals on Stellar)"),
    network: z.string().optional().describe("Network ID (e.g. base-sepolia, stellar-testnet). Defaults to configured network."),
    token: z.string().optional().describe("Token symbol: USDC, ETH, XLM, etc. Defaults to configured currency."),
  }),
  handler: async ({ recipientAddress, amount, network: networkArg, token: tokenArg }) => {
    const chainConfig = getChainConfig();
    const network = networkArg || chainConfig.network;
    const token = tokenArg || chainConfig.currency;

    if (!recipientAddress) {
      return { success: false, error: "Missing required parameter: recipientAddress" };
    }
    if (!amount) {
      return { success: false, error: "Missing required parameter: amount" };
    }

    if (!isValidNetwork(network)) {
      return { success: false, error: `Unsupported network: ${network}. Supported: ${getSupportedNetworks().join(", ")}` };
    }

    // ── Stellar payment ──
    if (isStellarNetwork(network)) {
      return handleStellarPayment(recipientAddress, amount, network as NetworkId, token);
    }

    // ── EVM payment ──
    return handleEVMPayment(recipientAddress, amount, network as NetworkId, token);
  },
});

async function handleStellarPayment(
  recipientAddress: string,
  amount: string,
  network: NetworkId,
  token: string
) {
  console.log(`[make_payment] Starting Stellar payment...`);

  const stellarSecretKey = process.env.STELLAR_SECRET_KEY;
  if (!stellarSecretKey) {
    return { success: false, error: "STELLAR_SECRET_KEY not configured on server" };
  }

  try {
    const chainMeta = getChainMetadata(network);
    const { Keypair, Networks, Asset, TransactionBuilder, Operation, Horizon } = await import("@stellar/stellar-sdk");

    const keypair = Keypair.fromSecret(stellarSecretKey);
    const server = new Horizon.Server(chainMeta.rpcUrl);
    const networkPassphrase = network === "stellar" ? Networks.PUBLIC : Networks.TESTNET;

    console.log(`[make_payment] Network: ${network}`);
    console.log(`[make_payment] Wallet: ${keypair.publicKey()}`);
    console.log(`[make_payment] Recipient: ${recipientAddress}`);
    console.log(`[make_payment] Amount: ${amount} base units`);

    // Convert base units (7 decimals) to Stellar amount string
    const stellarAmount = (Number(amount) / 1e7).toFixed(7);

    // Determine asset
    let asset: any;
    if (token === "XLM" || token === "NATIVE") {
      asset = Asset.native();
    } else {
      const issuer = chainMeta.assetIssuer || chainMeta.tokens?.USDC?.address;
      if (!issuer) {
        return { success: false, error: `No issuer found for ${token} on ${network}` };
      }
      asset = new Asset(token, issuer);
    }

    const sourceAccount = await server.loadAccount(keypair.publicKey());

    const transaction = new TransactionBuilder(sourceAccount, {
      fee: "100",
      networkPassphrase,
    })
      .addOperation(
        Operation.payment({
          destination: recipientAddress,
          asset,
          amount: stellarAmount,
        })
      )
      .setTimeout(60)
      .build();

    transaction.sign(keypair);
    const result = await server.submitTransaction(transaction);
    const txHash = result.hash;

    console.log(`[make_payment] Transaction sent: ${txHash}`);

    const paymentProof = {
      transactionHash: txHash,
      network,
      chainId: 0,
      timestamp: Date.now(),
    };

    return {
      success: true,
      paymentProof,
      details: {
        transactionHash: txHash,
        recipientAddress,
        amount,
        amountFormatted: `${stellarAmount} ${token}`,
        network,
        chainId: 0,
        token,
        confirmedAt: new Date().toISOString(),
        explorerUrl: `${chainMeta.explorerUrl}/tx/${txHash}`,
      },
      message: `Stellar payment of ${stellarAmount} ${token} sent successfully.`,
    };
  } catch (err: any) {
    console.error(`[make_payment] Stellar payment failed:`, err.message);
    return {
      success: false,
      error: err.message,
      hint: "Check Stellar wallet balance and trustlines. Ensure account is funded.",
    };
  }
}

async function handleEVMPayment(
  recipientAddress: string,
  amount: string,
  network: NetworkId,
  token: string
) {
    console.log(`[make_payment] Starting EVM payment...`);

    const privateKey = process.env.WALLET_PRIVATE_KEY || process.env.ETH_PRIVATE_KEY;
    if (!privateKey) {
      return { success: false, error: "WALLET_PRIVATE_KEY not configured on server" };
    }

    try {
      const chainMeta = getChainMetadata(network);

      console.log(`[make_payment] Network: ${network} (Chain ID: ${chainMeta.chainId})`);
      console.log(`[make_payment] Token: ${token}`);
      console.log(`[make_payment] Recipient: ${recipientAddress}`);
      console.log(`[make_payment] Amount: ${amount} base units`);

      const account = privateKeyToAccount(privateKey as `0x${string}`);
      console.log(`[make_payment] Wallet: ${account.address}`);

      const publicClient = createPublicClient({
        transport: http(chainMeta.rpcUrl),
      });

      const walletClient = createWalletClient({
        account,
        chain: {
          id: chainMeta.chainId,
          name: chainMeta.name,
          nativeCurrency: {
            name: chainMeta.nativeToken.symbol,
            symbol: chainMeta.nativeToken.symbol,
            decimals: chainMeta.nativeToken.decimals,
          },
          rpcUrls: {
            default: { http: [chainMeta.rpcUrl] },
          },
        },
        transport: http(chainMeta.rpcUrl),
      });

      let txHash: Hash;
      const amountBigInt = BigInt(amount);

      // Native token transfer
      if (isNativeToken(token as TokenSymbol) || token === "NATIVE") {
        console.log(`[make_payment] Sending native token (${chainMeta.nativeToken.symbol})...`);

        txHash = await walletClient.sendTransaction({
          to: recipientAddress as `0x${string}`,
          value: amountBigInt,
        });
      } else {
        // ERC20 token transfer
        const tokenAddress = getTokenAddress(network, token as TokenSymbol);
        if (!tokenAddress) {
          return {
            success: false,
            error: `Token ${token} not available on ${network}. Available: ${getAvailableTokens(network).join(", ")}`
          };
        }

        console.log(`[make_payment] Sending ERC20 token...`);
        console.log(`[make_payment] Token contract: ${tokenAddress}`);

        const data = encodeFunctionData({
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [recipientAddress as `0x${string}`, amountBigInt],
        });

        txHash = await walletClient.sendTransaction({
          to: tokenAddress as `0x${string}`,
          data,
          value: 0n,
        });
      }

      console.log(`[make_payment] Transaction sent: ${txHash}`);

      // Wait for confirmation
      console.log(`[make_payment] Waiting for confirmation...`);
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations: 1,
      });

      if (receipt.status === "reverted") {
        return {
          success: false,
          error: "Transaction reverted on-chain",
          transactionHash: txHash,
        };
      }

      console.log(`[make_payment] Confirmed in block ${receipt.blockNumber}`);

      // Create payment proof
      const paymentProof = {
        transactionHash: txHash,
        network,
        chainId: chainMeta.chainId,
        timestamp: Date.now(),
      };

      const decimals = token === "USDC" || token === "USDT" ? 6 : 18;
      const amountFormatted = formatUnits(amountBigInt, decimals);

      return {
        success: true,
        paymentProof,
        details: {
          transactionHash: txHash,
          blockNumber: receipt.blockNumber.toString(),
          recipientAddress,
          amount,
          amountFormatted: `${amountFormatted} ${token}`,
          network,
          chainId: chainMeta.chainId,
          token,
          confirmedAt: new Date().toISOString(),
          explorerUrl: `${chainMeta.explorerUrl}/tx/${txHash}`,
        },
        message: `Payment of ${amountFormatted} ${token} sent successfully. Use paymentProof to finalize checkout.`,
      };
    } catch (err: any) {
      console.error(`[make_payment] Payment failed:`, err.message);
      return {
        success: false,
        error: err.message,
        hint: "Check wallet balance and gas. Make sure network RPC is accessible.",
      };
    }
}

const getBalanceTool = defineTool({
  name: "get_balance",
  description: "Check wallet balance for native tokens or ERC20/Stellar tokens (USDC, etc)",
  inputSchema: z.object({
    address: z.string().optional().describe("Wallet address to check. Defaults to configured wallet."),
    token: z.string().optional().describe("Token symbol: USDC, ETH, XLM, NATIVE, etc. Defaults to USDC."),
    network: z.string().optional().describe("Network to check balance on. Defaults to configured network."),
  }),
  handler: async ({ address, token = "USDC", network: networkArg }) => {
    const chainConfig = getChainConfig();
    const network = networkArg || chainConfig.network;

    if (!isValidNetwork(network)) {
      return { success: false, error: `Unsupported network: ${network}` };
    }

    // ── Stellar balance ──
    if (isStellarNetwork(network)) {
      try {
        const chainMeta = getChainMetadata(network as NetworkId);
        const { Keypair, Horizon } = await import("@stellar/stellar-sdk");

        // Determine wallet address
        let walletAddress = address;
        if (!walletAddress) {
          const secretKey = process.env.STELLAR_SECRET_KEY;
          if (secretKey) {
            walletAddress = Keypair.fromSecret(secretKey).publicKey();
          }
        }
        if (!walletAddress) {
          return { success: false, error: "No wallet address provided or configured" };
        }

        const server = new Horizon.Server(chainMeta.rpcUrl);
        const account = await server.loadAccount(walletAddress);

        if (token === "XLM" || token === "NATIVE") {
          const xlmBal = account.balances.find((b: any) => b.asset_type === "native");
          return {
            success: true,
            address: walletAddress,
            token: "XLM",
            balance: xlmBal?.balance || "0",
            balanceFormatted: `${xlmBal?.balance || "0"} XLM`,
            network,
          };
        }

        // Find specific asset balance
        const issuer = chainMeta.assetIssuer || chainMeta.tokens?.USDC?.address;
        const assetBal = account.balances.find(
          (b: any) => b.asset_code === token && (issuer ? b.asset_issuer === issuer : true)
        );

        return {
          success: true,
          address: walletAddress,
          token,
          balance: assetBal?.balance || "0",
          balanceFormatted: `${assetBal?.balance || "0"} ${token}`,
          network,
          hasTrustline: !!assetBal,
        };
      } catch (err: any) {
        if (err.response?.status === 404) {
          return { success: true, address: address || "unknown", token, balance: "0", balanceFormatted: `0 ${token}`, network, error: "Account not found/funded" };
        }
        return { success: false, error: err.message };
      }
    }

    // ── EVM balance ──
    const privateKey = process.env.WALLET_PRIVATE_KEY || process.env.ETH_PRIVATE_KEY;
    const walletAddress = address || (privateKey ? privateKeyToAccount(privateKey as `0x${string}`).address : null);

    if (!walletAddress) {
      return { success: false, error: "No wallet address provided or configured" };
    }

    try {
      const chainMeta = getChainMetadata(network as NetworkId);

      const publicClient = createPublicClient({
        transport: http(chainMeta.rpcUrl),
      });

      // Native balance
      if (isNativeToken(token as TokenSymbol) || token === "NATIVE") {
        const balance = await publicClient.getBalance({
          address: walletAddress as `0x${string}`,
        });

        return {
          success: true,
          address: walletAddress,
          token: chainMeta.nativeToken.symbol,
          balance: balance.toString(),
          balanceFormatted: `${formatUnits(balance, 18)} ${chainMeta.nativeToken.symbol}`,
          network,
          chainId: chainMeta.chainId,
        };
      }

      // ERC20 balance
      const tokenAddress = getTokenAddress(network as NetworkId, token as TokenSymbol);
      if (!tokenAddress) {
        return {
          success: false,
          error: `Token ${token} not available on ${network}`,
          availableTokens: getAvailableTokens(network as NetworkId),
        };
      }

      const balance = await publicClient.readContract({
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [walletAddress as `0x${string}`],
      });

      const decimals = token === "USDC" || token === "USDT" ? 6 : 18;

      return {
        success: true,
        address: walletAddress,
        token,
        tokenAddress,
        balance: (balance as bigint).toString(),
        balanceFormatted: `${formatUnits(balance as bigint, decimals)} ${token}`,
        network,
        chainId: chainMeta.chainId,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
      };
    }
  },
});

const getConfigTool = defineTool({
  name: "get_config",
  description: "Get current chain and payment configuration including supported networks and tokens",
  inputSchema: z.object({}),
  handler: async () => {
    const chainConfig = getChainConfig();

    let chainMeta;
    try {
      chainMeta = getChainMetadata(chainConfig.network);
    } catch {
      chainMeta = null;
    }

    let walletAddress: string | null = null;
    if (isStellarNetwork(chainConfig.network)) {
      const stellarKey = process.env.STELLAR_SECRET_KEY;
      if (stellarKey) {
        const { Keypair } = await import("@stellar/stellar-sdk");
        walletAddress = Keypair.fromSecret(stellarKey).publicKey();
      }
    } else {
      const privateKey = process.env.WALLET_PRIVATE_KEY || process.env.ETH_PRIVATE_KEY;
      walletAddress = privateKey ? privateKeyToAccount(privateKey as `0x${string}`).address : null;
    }
    const recipientAddress = process.env.X402_RECIPIENT_ADDRESS || process.env.ETH_RECIPIENT_ADDRESS;

    return {
      success: true,
      config: {
        network: chainConfig.network,
        chainId: chainConfig.chainId,
        currency: chainConfig.currency,
        tokenDecimals: chainConfig.tokenDecimals,
        tokenAddress: chainConfig.tokenAddress,
        walletAddress,
        recipientAddress,
        rpcUrl: chainConfig.rpcUrl,
        explorerUrl: chainConfig.explorerUrl,
        availableTokens: chainMeta ? getAvailableTokens(chainConfig.network) : [],
        isTestnet: chainConfig.isTestnet,
      },
      supportedNetworks: getSupportedNetworks(),
    };
  },
});

const listNetworksTool = defineTool({
  name: "list_networks",
  description: "List all supported blockchain networks and their details",
  inputSchema: z.object({
    testnetsOnly: z.boolean().optional().describe("Only show testnets"),
    mainnetsOnly: z.boolean().optional().describe("Only show mainnets"),
  }),
  handler: async ({ testnetsOnly, mainnetsOnly }) => {
    const allNetworks = getSupportedNetworks();
    
    const networks = allNetworks
      .map(id => {
        try {
          const meta = getChainMetadata(id);
          return {
            id,
            name: meta.name,
            chainId: meta.chainId,
            isTestnet: meta.isTestnet,
            nativeToken: meta.nativeToken.symbol,
            availableTokens: getAvailableTokens(id),
            explorerUrl: meta.explorerUrl,
          };
        } catch {
          return null;
        }
      })
      .filter((n): n is NonNullable<typeof n> => n !== null)
      .filter(n => {
        if (testnetsOnly) return n.isTestnet;
        if (mainnetsOnly) return !n.isTestnet;
        return true;
      });

    return {
      success: true,
      networks,
      count: networks.length,
    };
  },
});

// ============================================================
// Register all payment tools
// ============================================================

export function registerPaymentTools(): void {
  toolRegistry.register(makePaymentTool, "payment");
  toolRegistry.register(getBalanceTool, "payment");
  toolRegistry.register(getConfigTool, "payment");
  toolRegistry.register(listNetworksTool, "payment");
  
  console.log("[Payment Tools] ✅ Registered 4 tools");
}
