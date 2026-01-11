import { Transaction } from '../types';

export const GOOGLE_APPS_SCRIPT_CODE = `/** DuoSpend Cloud Sync Script v1.7 (Monthly Summary Support) **/
function doPost(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const txSheet = ss.getSheetByName("Transactions") || ss.insertSheet("Transactions");
  const data = JSON.parse(e.postData.contents);
  const txs = data.transactions;
  
  // 1. Update Raw Transactions
  txSheet.clear();
  txSheet.appendRow(["ID", "Date", "Description", "User", "Total Amount", "SplitsJSON"]);
  txs.forEach(t => {
    txSheet.appendRow([
      t.id, 
      t.date, 
      t.description, 
      t.userId, 
      t.totalAmount, 
      JSON.stringify(t.splits)
    ]);
  });

  // 2. Generate/Update Monthly Summary
  updateSummarySheet(ss, txs);
  
  return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
}

function updateSummarySheet(ss, txs) {
  let summarySheet = ss.getSheetByName("Monthly Summary") || ss.insertSheet("Monthly Summary");
  summarySheet.clear();
  
  const headers = ["Category", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Yearly Total"];
  summarySheet.appendRow(headers);
  
  // Extract all unique categories
  const allCategories = [...new Set(txs.flatMap(t => t.splits.map(s => s.categoryName)))].sort();
  const matrix = {}; // { category: [jan, feb, ...] }
  
  allCategories.forEach(cat => {
    matrix[cat] = new Array(12).fill(0);
  });
  
  txs.forEach(t => {
    const d = new Date(t.date);
    const monthIdx = d.getMonth(); // 0-11
    if (!isNaN(monthIdx)) {
      t.splits.forEach(s => {
        if (matrix[s.categoryName]) {
          matrix[s.categoryName][monthIdx] += Number(s.amount) || 0;
        }
      });
    }
  });
  
  allCategories.forEach(cat => {
    const row = [cat, ...matrix[cat]];
    const yearlyTotal = matrix[cat].reduce((a, b) => a + b, 0);
    row.push(yearlyTotal);
    summarySheet.appendRow(row);
  });
  
  // Add a Grand Total row
  const grandTotalRow = ["GRAND TOTAL"];
  for (let m = 0; m < 13; m++) {
    let colTotal = 0;
    allCategories.forEach(cat => {
      colTotal += (m < 12 ? matrix[cat][m] : matrix[cat].reduce((a,b) => a+b, 0));
    });
    grandTotalRow.push(colTotal);
  }
  summarySheet.appendRow(grandTotalRow);

  // Formatting
  const lastRow = summarySheet.getLastRow();
  const lastCol = summarySheet.getLastColumn();
  summarySheet.getRange(1, 1, 1, lastCol).setFontWeight("bold").setBackground("#f1f5f9");
  summarySheet.getRange(lastRow, 1, 1, lastCol).setFontWeight("bold").setBackground("#e2e8f0");
  summarySheet.setFrozenRows(1);
  summarySheet.setFrozenColumns(1);
}

function doGet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Transactions");
  if (!sheet) return ContentService.createTextOutput(JSON.stringify({ transactions: [] })).setMimeType(ContentService.MimeType.JSON);
  const rows = sheet.getDataRange().getValues();
  const transactions = [];
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    let splits = [];
    try {
      splits = JSON.parse(rows[i][5]);
    } catch (e) {
      splits = [{ categoryName: 'Other', amount: Number(rows[i][4]) }];
    }
    
    transactions.push({
      id: String(rows[i][0]),
      date: rows[i][1],
      description: rows[i][2],
      userId: rows[i][3],
      totalAmount: Number(rows[i][4]),
      splits: splits
    });
  }
  return ContentService.createTextOutput(JSON.stringify({ transactions: transactions })).setMimeType(ContentService.MimeType.JSON);
}`;

export const performSync = async (url: string, transactions: Transaction[]) => {
  if (!url) throw new Error("Sync URL missing");
  await fetch(url, { 
    method: 'POST', 
    headers: { 'Content-Type': 'text/plain' }, 
    body: JSON.stringify({ transactions }) 
  });
  const res = await fetch(url);
  return await res.json();
};