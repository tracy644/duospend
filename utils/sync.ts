
import { Transaction } from '../types';

/**
 * Atomic Synchronization: Sends local data and gets the full cloud state back in ONE request.
 * This prevents race conditions where a GET might return empty data before the POST finishes.
 */
export const performSync = async (url: string, transactions: Transaction[], budgets: Record<string, number>) => {
  try {
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ transactions, budgets, action: 'sync' }),
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
    });

    if (!response.ok) {
      throw new Error(`Cloud sync failed: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.status === "error") {
      throw new Error(data.message || "Server error during sync");
    }

    // Safety check: If cloud is empty but we have local data, ask before overwriting
    if (transactions.length > 0 && (!data.transactions || data.transactions.length === 0)) {
      const confirmWipe = confirm("Cloud storage is empty. Do you want to WIPE your local data to match the cloud? Click 'Cancel' to keep your local data and try syncing again later.");
      if (!confirmWipe) {
        return { transactions, budgets }; // Keep local
      }
    }

    return data;
  } catch (error) {
    console.error("DuoSpend Sync Error:", error);
    throw error;
  }
};

export const GOOGLE_APPS_SCRIPT_CODE = `/** DuoSpend Cloud Sync Script v4.0 (Atomic & Safe) **/
function doPost(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const txSheet = ss.getSheetByName("Transactions") || ss.insertSheet("Transactions");
  const budgetSheet = ss.getSheetByName("Budgets") || ss.insertSheet("Budgets");
  
  try {
    const data = JSON.parse(e.postData.contents);
    const txs = data.transactions;
    const budgets = data.budgets;
    
    // 1. Update Transactions (Only if provided and not empty)
    if (txs && Array.isArray(txs) && txs.length > 0) {
      txSheet.clear();
      txSheet.appendRow(["ID", "Date", "Description", "User", "Total Amount", "SplitsJSON"]);
      txs.forEach(t => {
        txSheet.appendRow([t.id, t.date, t.description, t.userId, t.totalAmount, JSON.stringify(t.splits)]);
      });
      updateYearlySummarySheets(ss, txs);
    }

    // 2. Update Budgets
    if (budgets && typeof budgets === 'object' && Object.keys(budgets).length > 0) {
      budgetSheet.clear();
      budgetSheet.appendRow(["Category", "Monthly Limit"]);
      Object.entries(budgets).forEach(([cat, amt]) => {
        budgetSheet.appendRow([cat, amt]);
      });
    }

    // 3. Return the FULL updated state immediately (Atomic Response)
    const result = { 
      status: "success",
      transactions: [], 
      budgets: {} 
    };
    
    const txRange = txSheet.getDataRange();
    if (txRange.getLastRow() > 1) {
      const txRows = txRange.getValues();
      for (let i = 1; i < txRows.length; i++) {
        if (!txRows[i][0]) continue;
        let splits = [];
        try { splits = JSON.parse(txRows[i][5]); } catch (e) { splits = [{ categoryName: 'Other', amount: Number(txRows[i][4]) }]; }
        result.transactions.push({ 
          id: String(txRows[i][0]), 
          date: txRows[i][1], 
          description: txRows[i][2], 
          userId: txRows[i][3], 
          totalAmount: Number(txRows[i][4]), 
          splits: splits 
        });
      }
    }

    const bRange = budgetSheet.getDataRange();
    if (bRange.getLastRow() > 1) {
      const bRows = bRange.getValues();
      for (let j = 1; j < bRows.length; j++) {
        if (bRows[j][0]) result.budgets[bRows[j][0]] = Number(bRows[j][1]);
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return doPost({ postData: { contents: JSON.stringify({ transactions: [], budgets: {} }) } });
}

function updateYearlySummarySheets(ss, txs) {
  const yearMap = {}; 
  const userMonthMap = {}; 
  const allCategories = new Set();
  
  txs.forEach(t => {
    const d = new Date(t.date);
    if (isNaN(d.getTime())) return;
    const year = d.getUTCFullYear();
    const monthIdx = d.getUTCMonth(); 
    
    if (!yearMap[year]) yearMap[year] = {};
    if (!userMonthMap[year]) {
      userMonthMap[year] = { "PARTNER_1": new Array(12).fill(0), "PARTNER_2": new Array(12).fill(0) };
    }
    
    userMonthMap[year][t.userId][monthIdx] += Number(t.totalAmount) || 0;

    t.splits.forEach(s => {
      const cat = s.categoryName;
      allCategories.add(cat);
      if (!yearMap[year][cat]) yearMap[year][cat] = new Array(12).fill(0);
      yearMap[year][cat][monthIdx] += Number(s.amount) || 0;
    });
  });

  const catsSorted = Array.from(allCategories).sort();
  Object.keys(yearMap).sort().reverse().forEach(year => {
    const sheetName = "Summary " + year;
    let sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
    sheet.clear();
    const headers = ["Category", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Yearly Total"];
    sheet.appendRow(headers);
    
    catsSorted.forEach(cat => {
      const monthData = yearMap[year][cat];
      if (monthData) sheet.appendRow([cat, ...monthData, monthData.reduce((a, b) => a + b, 0)]);
    });

    const totalRow = ["GRAND TOTAL"];
    for (let m = 0; m < 12; m++) {
      let monthSum = 0;
      catsSorted.forEach(cat => { if (yearMap[year][cat]) monthSum += yearMap[year][cat][m]; });
      totalRow.push(monthSum);
    }
    totalRow.push(totalRow.slice(1).reduce((a, b) => a + b, 0));
    sheet.appendRow(totalRow);

    const tracyPaidRow = ["Tracy Paid (Actual)"];
    const tracyOwesRow = ["Tracy owes"];
    for (let m = 0; m < 12; m++) {
      const monthTotal = totalRow[m + 1];
      const tracyPaid = userMonthMap[year]["PARTNER_1"][m];
      tracyPaidRow.push(tracyPaid);
      tracyOwesRow.push((monthTotal - tracyPaid) * 0.45);
    }
    sheet.appendRow(tracyPaidRow);
    sheet.appendRow(tracyOwesRow);
    sheet.getRange(2, 2, sheet.getLastRow(), sheet.getLastColumn()).setNumberFormat("$#,##0.00");
  });
}
`;
