import { GoogleGenAI } from "@google/genai";
import { Transaction, CategoryDefinition } from "../types";

const getAIClient = () => {
  const apiKey = process.env.API_KEY;
  // Handle various falsy states from build-time environment variable injection
  if (!apiKey || apiKey === 'undefined' || apiKey === '' || apiKey === 'null') return null;
  
  try {
    return new GoogleGenAI({ apiKey: apiKey });
  } catch (e) {
    console.error("DuoCoach: Failed to initialize GoogleGenAI SDK:", e);
    return null;
  }
};

export const analyzeSpending = async (transactions: Transaction[], budgets: Record<string, number>, categories: CategoryDefinition[]): Promise<string> => {
  const ai = getAIClient();
  if (!ai) {
    console.warn("DuoCoach: API Key not found. Please check your environment variables.");
    return "AI Coach is currently offline. Ensure your API Key is set in Vercel.";
  }

  const summary = transactions
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 30) // Only analyze recent transactions to avoid context bloat
    .map(t => `${t.date}: ${t.description} - $${t.totalAmount} (${t.splits[0]?.categoryName})`)
    .join('\n');
    
  const budgetSummary = Object.entries(budgets)
    .filter(([_, amt]) => amt > 0)
    .map(([cat, amt]) => `${cat}: $${amt}`)
    .join('\n');
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Analyze this couple's shared finances:\n\nRECENT SPENDING:\n${summary}\n\nMONTHLY LIMITS:\n${budgetSummary}`,
      config: {
        systemInstruction: "You are 'DuoCoach', a sharp financial advisor for couples. Provide exactly 3 concise, actionable tips based on their spending. Focus on shared savings and equity. Be warm but professional. Use emojis.",
      },
    });
    return response.text || "No specific insights found for your data yet.";
  } catch (err: any) {
    console.error("DuoCoach Error:", err);
    return `AI Connection Issue: ${err?.message || "Please check your API key and connection."}`;
  }
};

export const detectSubscriptions = async (transactions: Transaction[]): Promise<string | null> => {
  const ai = getAIClient();
  if (!ai) return null;

  const history = transactions
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 50)
    .map(t => `${t.description} ($${t.totalAmount}) on ${t.date}`)
    .join('\n');

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Audit this history for recurring subscription charges:\n\n${history}`,
      config: {
        systemInstruction: "Identify potential hidden or ghost subscriptions (Netflix, Apps, Gym, etc.). Provide a list with merchant name and estimated monthly cost. If none are found, state 'No recurring subscriptions detected.'",
      },
    });
    return response.text ?? "No recurring subscriptions detected.";
  } catch (err: any) {
    console.error("DuoCoach Audit Error:", err);
    return `Unable to run audit: ${err?.message || "Check your API configuration."}`;
  }
};