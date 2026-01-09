import { GoogleGenAI, Type } from "@google/genai";
import { Transaction, CategoryDefinition } from "../types";

// The API key is injected via Vite's define or environment variables
const getAI = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.warn("Gemini API Key missing. Please set it in your environment variables.");
  }
  return new GoogleGenAI({ apiKey: apiKey || '' });
};

export const analyzeSpending = async (transactions: Transaction[], budgets: Record<string, number>, categories: CategoryDefinition[]) => {
  const ai = getAI();
  const model = 'gemini-3-pro-preview';
  
  const summary = transactions.map(t => {
    const splitDetail = t.splits.map(s => `$${s.amount} in ${s.categoryName}`).join(', ');
    return `${t.date}: ${t.description} - Total $${t.totalAmount} (${splitDetail})`;
  }).join('\n');
  
  const budgetSummary = Object.entries(budgets).map(([cat, amt]) => `${cat}: $${amt}`).join('\n');
  const catNames = categories.map(c => c.name).join(', ');

  const prompt = `
    Analyze the following spending patterns for a couple:
    
    TRANSACTIONS:
    ${summary}
    
    BUDGET TARGETS:
    ${budgetSummary}

    AVAILABLE CATEGORIES:
    ${catNames}
    
    Provide:
    1. A summary of overall spending health (are they over or under total budget?).
    2. Specific categories that need attention.
    3. Three actionable, friendly tips for this specific couple to save money.
    
    Keep the tone friendly, encouraging, and helpful. Use markdown formatting.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });
    return response.text || "I couldn't generate a response. Please check your spending data.";
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return "The AI Coach is taking a break. Please check your API key or try again later.";
  }
};

export const parseReceipt = async (base64Image: string, categories: CategoryDefinition[]): Promise<{amount: number, description: string, categoryName: string} | null> => {
  const ai = getAI();
  const model = 'gemini-3-flash-preview';
  const catList = categories.map(c => c.name).join(', ');
  
  try {
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
          { text: `Extract data from this receipt. Return ONLY JSON. Total Amount (number), Merchant Name (string), and pick the best category from this list: [${catList}].` }
        ]
      },
      config: {
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
    console.error("Gemini Receipt Parsing Error:", error);
    return null;
  }
};