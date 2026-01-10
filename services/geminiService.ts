declare var process: any;
import { GoogleGenAI, Type } from "@google/genai";
import { Transaction, CategoryDefinition } from "../types";

// Lazy initialize to prevent top-level crashes
const getAIClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey === 'undefined') {
    throw new Error("API Key is missing. Please set API_KEY in your environment variables.");
  }
  return new GoogleGenAI({ apiKey });
};

export const analyzeSpending = async (transactions: Transaction[], budgets: Record<string, number>, categories: CategoryDefinition[]) => {
  const summary = transactions.map(t => {
    return `${t.date}: ${t.description} - $${t.totalAmount} in ${t.splits[0]?.categoryName}`;
  }).join('\n');
  
  const budgetSummary = Object.entries(budgets).map(([cat, amt]) => `${cat}: $${amt}`).join('\n');
  
  const ai = getAIClient();
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Analyze this couple's shared finances:\n\nSPENDING:\n${summary}\n\nLIMITS:\n${budgetSummary}`,
    config: {
      systemInstruction: "You are 'DuoCoach', an empathetic and sharp financial advisor for couples. Your mission is to help them save for their goals without ruining their fun. Provide 3 actionable tips. One tip must focus on balancing their shared contributions. Be concise, warm, and use emojis.",
      thinkingConfig: { thinkingBudget: 500 }
    },
  });

  return response.text || "I couldn't crunch the numbers. Try adding more transactions!";
};

export const parseReceipt = async (base64Image: string, categories: CategoryDefinition[]): Promise<{amount: number, description: string, categoryName: string} | null> => {
  const catList = categories.map(c => c.name).join(', ');
  
  try {
    const ai = getAIClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
          { text: "Extract receipt details." }
        ]
      },
      config: {
        systemInstruction: `Return JSON: { "amount": number, "description": string, "categoryName": string }. Categories: [${catList}].`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            amount: { type: Type.NUMBER },
            description: { type: Type.STRING },
            categoryName: { type: Type.STRING }
          },
          required: ["amount", "description", "categoryName"]
        }
      }
    });

    if (!response.text) return null;
    return JSON.parse(response.text.trim());
  } catch (error) {
    console.error("Scanning Error:", error);
    return null;
  }
};