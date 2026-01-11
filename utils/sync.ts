import { Transaction } from '../types';

export const GOOGLE_APPS_SCRIPT_CODE = `/** DuoSpend Cloud Sync Script v2.8 (Clean Labels) **/
function doPost(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const txSheet = ss.getSheetByName("Transactions") || ss.insertSheet("Transactions");
  const budgetSheet = ss.getSheetByName("Budgets") || ss.insertSheet("Budgets");
  
  try {
    const data = JSON.parse(e.postData.contents);
    const txs = data.transactions;
    const budgets = data.budgets;
    
    // 1. Update Transactions
    if (txs && Array.isArray(txs)) {
      txSheet.clear();
      txSheet.appendRow(["ID", "Date", "Description", "User", "Total Amount", "SplitsJSON"]);
      txs.forEach(t => {
        txSheet.appendRow([t.id, t.date, t.description, t.userId, t.totalAmount, JSON.stringify(t.splits)]);
      });
      updateYearlySummarySheets(ss, txs);
    }

    // 2. Update Budgets (Source of Truth)
    if (budgets && typeof budgets === 'object') {
      budgetSheet.clear();
      budgetSheet.appendRow(["Category", "Monthly Limit"]);
      Object.entries(budgets).forEach(([cat, amt]) => {
        budgetSheet.appendRow([cat, amt]);
      });
      budgetSheet.getRange(1,1,1,2).setFontWeight("bold").setBackground("#f8fafc");
      if (budgetSheet.getLastRow() > 1) {
        budgetSheet.getRange(2,2,budgetSheet.getLastRow()-1,1).setNumberFormat("$#,##0");
      }
    }

    // 3. Cleanup
    const sheet1 = ss.getSheetByName("Sheet1");
    if (sheet1 && sheet1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sheet1);
    
    return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function updateYearlySummarySheets(ss, txs) {
  const yearMap = {}; 
  const userMonthMap = {}; // Track monthly spending by user
  const allCategories = new Set();
  
  txs.forEach(t => {
    const d = new Date(t.date);
    if (isNaN(d.getTime())) return;
    const year = d.getFullYear();
    const monthIdx = d.getMonth(); 
    
    if (!yearMap[year]) yearMap[year] = {};
    if (!userMonthMap[year]) {
      userMonthMap[year] = {
        "PARTNER_1": new Array(12).fill(0),
        "PARTNER_2": new Array(12).fill(0)
      };
    }
    
    // Track how much Tracy (PARTNER_1) or Trish (PARTNER_2) paid
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
    ss.setActiveSheet(sheet);
    ss.moveActiveSheet(1);
    sheet.clear();
    
    const headers = ["Category", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Yearly Total"];
    sheet.appendRow(headers);
    
    const yearData = yearMap[year];
    catsSorted.forEach(cat => {
      const monthData = yearData[cat];
      if (monthData) {
        const row = [cat, ...monthData, monthData.reduce((a, b) => a + b, 0)];
        sheet.appendRow(row);
      }
    });

    // Monthly Totals
    const totalRow = ["GRAND TOTAL"];
    for (let m = 0; m < 12; m++) {
      let monthSum = 0;
      catsSorted.forEach(cat => {
        if (yearData[cat]) monthSum += yearData[cat][m];
      });
      totalRow.push(monthSum);
    }
    totalRow.push(totalRow.slice(1).reduce((a, b) => a + b, 0));
    sheet.appendRow(totalRow);

    // Tracy Owes Calculation: (Total - Tracy Paid) * 45%
    const tracyPaidRow = ["Tracy Paid (Actual)"];
    const tracyOwesRow = ["Tracy owes"];
    
    let yearTracyPaid = 0;
    let yearTracyOwes = 0;

    for (let m = 0; m < 12; m++) {
      const monthTotal = totalRow[m + 1];
      const tracyPaid = userMonthMap[year]["PARTNER_1"][m];
      const tracyOwes = (monthTotal - tracyPaid) * 0.45;
      
      tracyPaidRow.push(tracyPaid);
      tracyOwesRow.push(tracyOwes);
      
      yearTracyPaid += tracyPaid;
      yearTracyOwes += tracyOwes;
    }
    
    tracyPaidRow.push(yearTracyPaid);
    tracyOwesRow.push(yearTracyOwes);
    
    sheet.appendRow(tracyPaidRow);
    sheet.appendRow(tracyOwesRow);

    // Styling
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    sheet.getRange(1, 1, 1, lastCol).setFontWeight("bold").setBackground("#f8fafc");
    sheet.getRange(lastRow - 2, 1, 1, lastCol).setFontWeight("bold").setBackground("#f1f5f9"); // Grand Total
    sheet.getRange(lastRow - 1, 1, 1, lastCol).setFontStyle("italic").setFontColor("#64748b"); // Tracy Paid
    sheet.getRange(lastRow, 1, 1, lastCol).setFontWeight("bold").setBackground("#eef2ff").setFontColor("#4f46e5"); // Tracy Owes
    sheet.getRange(2, 2, lastRow, lastCol).setNumberFormat("$#,##0.00");
    sheet.setFrozenRows(1);
    sheet.setFrozenColumns(1);
    sheet.autoResizeColumns(1, lastCol);
  });
}

function doGet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const txSheet = ss.getSheetByName("Transactions");
  const budgetSheet = ss.getSheetByName("Budgets");
  
  const result = { transactions: [], budgets: {} };
  
  if (txSheet) {
    const rows = txSheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      let splits = [];
      try { splits = JSON.parse(rows[i][5]); } catch (e) { splits = [{ categoryName: 'Other', amount: Number(rows[i][4]) }]; }
      result.transactions.push({ id: String(rows[i][0]), date: rows[i][1], description: rows[i][2], userId: rows[i][3], totalAmount: Number(rows[i][4]), splits: splits });
    }
  }

  if (budgetSheet) {
    const bRows = budgetSheet.getDataRange().getValues();
    for (let j = 1; j < bRows.length; j++) {
      if (bRows[j][0]) result.budgets[bRows[j][0]] = Number(bRows[j][1]);
    }
  }

  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}`;

export const performSync = async (url: string, transactions: Transaction[], budgets: Record<string, number>) => {
  if (!url) throw new Error("Sync URL missing");
  const postResponse = await fetch(url, { 
    method: 'POST', 
    headers: { 'Content-Type': 'text/plain' }, 
    body: JSON.stringify({ transactions, budgets }) 
  });
  
  const postResult = await postResponse.json();
  if (postResult.status === 'error') {
    throw new Error("Script Error: " + postResult.message);
  }

  const res = await fetch(url);
  return await res.json();
};