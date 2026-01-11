import { Transaction } from '../types';

export const GOOGLE_APPS_SCRIPT_CODE = `/** DuoSpend Cloud Sync Script v1.8 (Multi-Year Summary Support) **/
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

  // 2. Generate/Update Monthly Summary with Year Awareness
  updateSummarySheet(ss, txs);
  
  return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
}

function updateSummarySheet(ss, txs) {
  let summarySheet = ss.getSheetByName("Monthly Summary") || ss.insertSheet("Monthly Summary");
  summarySheet.clear();
  
  // Headers now start with "Year" to separate different years
  const headers = ["Year", "Category", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Yearly Total"];
  summarySheet.appendRow(headers);
  
  // Data structure: { "2024": { "Food": [JanVal, FebVal, ...], "Rent": [...] } }
  const matrix = {}; 
  const allCategories = new Set();
  const allYears = new Set();

  txs.forEach(t => {
    const d = new Date(t.date);
    const year = d.getFullYear();
    const monthIdx = d.getMonth(); // 0-11
    
    if (isNaN(year) || isNaN(monthIdx)) return;
    
    allYears.add(year);
    if (!matrix[year]) matrix[year] = {};

    t.splits.forEach(s => {
      const cat = s.categoryName;
      allCategories.add(cat);
      if (!matrix[year][cat]) matrix[year][cat] = new Array(12).fill(0);
      matrix[year][cat][monthIdx] += Number(s.amount) || 0;
    });
  });
  
  // Convert sets to sorted arrays
  const yearsSorted = Array.from(allYears).sort((a, b) => b - a); // Newest year first
  const catsSorted = Array.from(allCategories).sort();

  yearsSorted.forEach(year => {
    catsSorted.forEach(cat => {
      const monthData = matrix[year][cat];
      if (monthData) {
        const row = [year, cat, ...monthData];
        const yearlyTotal = monthData.reduce((a, b) => a + b, 0);
        row.push(yearlyTotal);
        summarySheet.appendRow(row);
      }
    });

    // Add a Year Total sub-row
    const yearTotalRow = [year, "TOTAL FOR YEAR"];
    let yearSum = 0;
    for (let m = 0; m < 12; m++) {
      let monthTotal = 0;
      catsSorted.forEach(cat => {
        if (matrix[year][cat]) monthTotal += matrix[year][cat][m];
      });
      yearTotalRow.push(monthTotal);
      yearSum += monthTotal;
    }
    yearTotalRow.push(yearSum);
    summarySheet.appendRow(yearTotalRow);
    
    // Add empty spacer row between years
    summarySheet.appendRow([]);
  });

  // Formatting
  const lastRow = summarySheet.getLastRow();
  const lastCol = summarySheet.getLastColumn();
  summarySheet.getRange(1, 1, 1, lastCol).setFontWeight("bold").setBackground("#f1f5f9");
  
  // Highlight "TOTAL FOR YEAR" rows
  const dataRange = summarySheet.getDataRange().getValues();
  for(let i = 0; i < dataRange.length; i++) {
    if(dataRange[i][1] === "TOTAL FOR YEAR") {
      summarySheet.getRange(i + 1, 1, 1, lastCol).setFontWeight("bold").setBackground("#e2e8f0");
    }
  }

  summarySheet.setFrozenRows(1);
  summarySheet.setFrozenColumns(2); // Freeze Year and Category
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