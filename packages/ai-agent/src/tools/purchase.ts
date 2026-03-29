import { tool } from "ai";
import { z } from "zod";
import type { A2AClient } from "../a2a-client.js";
import type { A2ATask, Part } from "../types.js";

export function createPurchaseTool(client: A2AClient) {
  return tool({
    description:
      "Initiate a product purchase via the A2A protocol. Sends a purchase action to the merchant agent, which returns a task with payment requirements. You must then use make_onchain_payment to pay, followed by submit_payment_proof to complete the purchase.",
    parameters: z.object({
      storeId: z.string().describe("The store ID"),
      productId: z.string().describe("The product ID to purchase"),
      quantity: z
        .number()
        .optional()
        .describe("Quantity to buy (default 1)"),
    }),
    execute: async ({ storeId, productId, quantity }) => {
      let response;
      try {
        response = await client.sendMessage({
          action: "purchase",
          storeId,
          productId,
          quantity: quantity || 1,
        });
      } catch (err) {
        return { success: false, error: `Network error: ${err instanceof Error ? err.message : String(err)}` };
      }

      if (response.error) {
        return { success: false, error: response.error.message };
      }

      const task = response.result;
      if (!task || typeof task !== "object") {
        return { success: false, error: "Invalid response from server" };
      }
      const t = task as A2ATask;
      const parts: Part[] = t.status?.message?.parts || [];
      const dataPart = parts.find((p) => p.type === "data");
      const paymentReqs =
        dataPart?.type === "data"
          ? dataPart.data?.paymentRequirements
          : undefined;

      return {
        success: true,
        taskId: t.id,
        state: t.status.state,
        paymentRequirements: paymentReqs,
        message: parts.find((p) => p.type === "text")?.type === "text"
          ? (parts.find((p) => p.type === "text") as Extract<Part, { type: "text" }>).text
          : undefined,
      };
    },
  });
}
