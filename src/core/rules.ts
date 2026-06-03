import { runCompletion, loadLLMModel, unloadQVACModel, LLAMA_MODEL_ID } from "./qvac.js";

export interface Rule {
  id: string;
  condition: string;
  action: "alert" | "ignore";
}

export const activeRules: Rule[] = [
  { id: "1", condition: "A person is near the shed or approaching", action: "alert" },
  { id: "2", condition: "A dog or animal is present", action: "ignore" }
];

export async function evaluateRules(sceneDescription: string): Promise<{ matchedRule: Rule | null, shouldAlert: boolean }> {
  const modelId = await loadLLMModel(LLAMA_MODEL_ID);
  
  const prompt = `You are the Scarecrow AI rule engine.
SCENE DESCRIPTION: "${sceneDescription}"

RULES:
${activeRules.map(r => `- Rule ${r.id}: IF ${r.condition} THEN ${r.action}`).join("\n")}

Determine if any rule matches the scene.
Respond ONLY with JSON: {"matchedRuleId": "1", "action": "alert" | "ignore"}`;

  const response = await runCompletion({
    modelId,
    history: [{ role: "user", content: prompt }],
    stream: false
  });

  await unloadQVACModel(modelId); // Free RAM

  try {
    const result = JSON.parse(response.text);
    const rule = activeRules.find(r => r.id === result.matchedRuleId) || null;
    return { matchedRule: rule, shouldAlert: result.action === "alert" };
  } catch (err) {
    // Fallback: simple keyword matching if JSON parse fails
    const lowerScene = sceneDescription.toLowerCase();
    if (lowerScene.includes("person") || lowerScene.includes("human")) {
      return { matchedRule: activeRules[0], shouldAlert: true };
    }
    return { matchedRule: activeRules[1], shouldAlert: false };
  }
}
