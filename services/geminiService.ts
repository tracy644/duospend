declare var process: any;
import { GoogleGenAI, Type } from "@google/genai";
import { Transaction, CategoryDefinition } from "../types";

// Lazy initialize to prevent top-level crashes if key is missing
const getAIClient = () => {
  const apiKey = process.env.API_KEY;
  
  // Robust check for missing or 'undefined' string keys from Vite
  if (!apiKey || apiKey === 'undefined' || apiKey === '') {
    return null;
  }
  
  try {
    return new GoogleGenAI({ apiKey });
  } catch (e) {
    console.error("Failed to initialize GoogleGenAI:", e);
    return null;
  }
};

export const analyzeSpending = async (transactions: Transaction[], budgets: Record<string, number>, categories: CategoryDefinition[]) => {
  const ai = getAIClient();
  if (!ai) {
    return "AI Coaching is unavailable because the API_KEY is not set in environment variables.";
  }

  const summary = transactions.map(t => {
    return `${t.date}: ${t.description} - $${t.totalAmount} in ${t.splits[0]?.categoryName}`;
  }).join('\n');
  
  const budgetSummary = Object.entries(budgets).map(([cat, amt]) => `${cat}: $${amt}`).join('\n');
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Analyze this couple's shared finances:\n\nSPENDING:\n${summary}\n\nLIMITS:\n${budgetSummary}`,
      config: {
        systemInstruction: "You are 'DuoCoach', an empathetic and sharp financial advisor for couples. Your mission is to help them save for their goals without ruining their fun. Provide 3 actionable tips. One tip must focus on balancing their shared contributions. Be concise, warm, and use emojis.",
        thinkingConfig: { thinkingBudget: 500 }
      },
    });

    return response.text || "I couldn't crunch the numbers. Try adding more transactions!";
  } catch (err) {
    console.error("AI Generation Error:", err);
    return "The AI Coach is currently having trouble thinking. Please check your connection.";
  }
};

export const parseReceipt = async (base64Image: string, categories: CategoryDefinition[]): Promise<{amount: number, description: string, categoryName: string} | null> => {
  const ai = getAIClient();
  if (!ai) return null;

  const catList = categories.map(c => c.name).join(', ');
  
  try {
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