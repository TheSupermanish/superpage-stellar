import { tool } from "ai";
import { z } from "zod";
import type { A2AClient } from "../a2a-client.js";
import type { A2ATask, Part } from "../types.js";

export function createCheckTaskTool(client: A2AClient) {
  return tool({
    description:
      "Check the current status of an A2A task. Use this to verify if a payment was accepted or to see task progress.",
    parameters: z.object({
      taskId: z.string().describe("The A2A task ID"),
    }),
    execute: async ({ taskId }) => {
      let response;
      try {
        response = await client.getTask(taskId);
      } catch (err) {
        return { success: false, error: `Network error: ${err instanceof Error ? err.message : String(err)}` };
      }

      if (response.error) {
        return { success: false, error: response.error.message };
      }

      const result = response.result;
      if (!result || typeof result !== "object") {
        return { success: false, error: "Invalid response from server" };
      }
      const task = result as A2ATask;
      const parts: Part[] = task.status?.message?.parts || [];
      const textPart = parts.find((p) => p.type === "text");

      return {
        success: true,
        taskId: task.id,
        state: task.status.state,
        message: textPart?.type === "text" ? textPart.text : undefined,
        artifacts: task.artifacts,
        metadata: task.metadata,
      };
    },
  });
}
