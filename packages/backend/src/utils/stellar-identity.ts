/**
 * Stellar Agent Identity
 *
 * A Stellar-native equivalent to ERC-8004 (on-chain agent identity & reputation).
 * Uses Stellar's built-in account data entries (key-value store on every account)
 * to store agent metadata, reputation scores, and identity claims.
 *
 * Why not a Soroban contract?
 * - Account data entries are native to Stellar (no contract deployment needed)
 * - Reads are free (just a Horizon API call)
 * - Writes cost ~0.00001 XLM (one tx fee)
 * - Any agent can verify any other agent's identity by reading their account data
 * - Works on testnet and mainnet immediately
 *
 * Schema (key → value on the Stellar account):
 *   superpage.agent.name       → agent display name
 *   superpage.agent.type       → "ai" | "human" | "service"
 *   superpage.agent.version    → agent software version
 *   superpage.agent.skills     → comma-separated skill tags
 *   superpage.agent.reputation → JSON: { score, totalRatings, lastUpdated }
 *   superpage.agent.url        → agent's homepage or API endpoint
 *   superpage.agent.registered → ISO timestamp of registration
 */

import {
  Keypair,
  Networks,
  TransactionBuilder,
  Operation,
  Horizon,
} from "@stellar/stellar-sdk";

const DATA_PREFIX = "superpage.agent.";

export interface AgentIdentity {
  publicKey: string;
  name?: string;
  type?: "ai" | "human" | "service";
  version?: string;
  skills?: string[];
  reputation?: {
    score: number;
    totalRatings: number;
    lastUpdated: string;
  };
  url?: string;
  registered?: string;
}

export interface ReputationUpdate {
  rating: number; // 1-5
  fromAgent: string; // rater's public key
  comment?: string;
}

/**
 * Register an agent identity on Stellar.
 * Writes metadata to the agent's account data entries.
 */
export async function registerAgentIdentity(
  secretKey: string,
  identity: Omit<AgentIdentity, "publicKey" | "registered">,
  horizonUrl: string = "https://horizon-testnet.stellar.org",
  networkPassphrase: string = Networks.TESTNET
): Promise<{ txHash: string; publicKey: string }> {
  const server = new Horizon.Server(horizonUrl);
  const keypair = Keypair.fromSecret(secretKey);
  const account = await server.loadAccount(keypair.publicKey());

  const builder = new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase,
  });

  // Set each identity field as a data entry
  if (identity.name) {
    builder.addOperation(
      Operation.manageData({
        name: `${DATA_PREFIX}name`,
        value: identity.name,
      })
    );
  }

  if (identity.type) {
    builder.addOperation(
      Operation.manageData({
        name: `${DATA_PREFIX}type`,
        value: identity.type,
      })
    );
  }

  if (identity.version) {
    builder.addOperation(
      Operation.manageData({
        name: `${DATA_PREFIX}version`,
        value: identity.version,
      })
    );
  }

  if (identity.skills?.length) {
    builder.addOperation(
      Operation.manageData({
        name: `${DATA_PREFIX}skills`,
        value: identity.skills.join(","),
      })
    );
  }

  if (identity.url) {
    builder.addOperation(
      Operation.manageData({
        name: `${DATA_PREFIX}url`,
        value: identity.url,
      })
    );
  }

  // Always set registration timestamp
  builder.addOperation(
    Operation.manageData({
      name: `${DATA_PREFIX}registered`,
      value: new Date().toISOString(),
    })
  );

  // Initialize reputation (compact format to fit 64-byte limit)
  // Format: "score|count|timestamp"
  builder.addOperation(
    Operation.manageData({
      name: `${DATA_PREFIX}reputation`,
      value: `0|0|${Math.floor(Date.now() / 1000)}`,
    })
  );

  const tx = builder.setTimeout(60).build();
  tx.sign(keypair);

  const result = await server.submitTransaction(tx);
  return { txHash: result.hash, publicKey: keypair.publicKey() };
}

/**
 * Look up an agent's identity from their Stellar account data.
 * This is a free read — no transaction needed.
 */
export async function lookupAgentIdentity(
  publicKey: string,
  horizonUrl: string = "https://horizon-testnet.stellar.org"
): Promise<AgentIdentity | null> {
  const server = new Horizon.Server(horizonUrl);

  try {
    const account = await server.loadAccount(publicKey);

    // Extract superpage.agent.* data entries
    const data: Record<string, string> = {};
    for (const [key, value] of Object.entries(account.data_attr || {})) {
      if (key.startsWith(DATA_PREFIX)) {
        const field = key.slice(DATA_PREFIX.length);
        // Stellar stores data as base64
        data[field] = Buffer.from(value as string, "base64").toString("utf-8");
      }
    }

    if (Object.keys(data).length === 0) {
      return null; // No agent identity registered
    }

    const identity: AgentIdentity = {
      publicKey,
      name: data.name,
      type: data.type as AgentIdentity["type"],
      version: data.version,
      skills: data.skills ? data.skills.split(",") : undefined,
      url: data.url,
      registered: data.registered,
    };

    // Parse compact reputation: "score|count|timestamp"
    if (data.reputation) {
      const parts = data.reputation.split("|");
      if (parts.length >= 2) {
        identity.reputation = {
          score: parseFloat(parts[0]),
          totalRatings: parseInt(parts[1]),
          lastUpdated: parts[2]
            ? new Date(parseInt(parts[2]) * 1000).toISOString()
            : "",
        };
      }
    }

    return identity;
  } catch (err: any) {
    if (err.response?.status === 404) {
      return null; // Account doesn't exist
    }
    throw err;
  }
}

/**
 * Update an agent's reputation score.
 * Reads current reputation, adds the new rating, writes back.
 */
export async function updateReputation(
  agentSecretKey: string,
  rating: number,
  horizonUrl: string = "https://horizon-testnet.stellar.org",
  networkPassphrase: string = Networks.TESTNET
): Promise<{ txHash: string; newScore: number }> {
  if (rating < 1 || rating > 5) {
    throw new Error("Rating must be between 1 and 5");
  }

  const server = new Horizon.Server(horizonUrl);
  const keypair = Keypair.fromSecret(agentSecretKey);
  const account = await server.loadAccount(keypair.publicKey());

  // Read current reputation (compact: "score|count|timestamp")
  let score = 0;
  let totalRatings = 0;
  const repData = account.data_attr?.[`${DATA_PREFIX}reputation`];
  if (repData) {
    const decoded = Buffer.from(repData as string, "base64").toString("utf-8");
    const parts = decoded.split("|");
    score = parseFloat(parts[0]) || 0;
    totalRatings = parseInt(parts[1]) || 0;
  }

  // Calculate new running average
  const totalScore = score * totalRatings + rating;
  totalRatings += 1;
  score = Number((totalScore / totalRatings).toFixed(2));

  const tx = new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase,
  })
    .addOperation(
      Operation.manageData({
        name: `${DATA_PREFIX}reputation`,
        value: `${score}|${totalRatings}|${Math.floor(Date.now() / 1000)}`,
      })
    )
    .setTimeout(60)
    .build();

  tx.sign(keypair);
  const result = await server.submitTransaction(tx);

  return { txHash: result.hash, newScore: score };
}
