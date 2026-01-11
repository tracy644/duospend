import { Transaction } from '../types';

export const GOOGLE_APPS_SCRIPT_CODE = `/** DuoSpend Cloud Sync Script v2.2 (Multi-Year Engine) **/
function doPost(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const txSheet = ss.getSheetByName("Transactions") || ss.insertSheet("Transactions");
  
  try {
    const data = JSON.parse(e.postData.contents);
    const txs = data.transactions;
    
    if (!txs || !Array.isArray(txs)) {
       throw new Error("No transactions array found in payload");
    }

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

    // 2. Generate/Update Year-Specific Summary Tabs
    updateYearlySummarySheets(ss, txs);
    
    return ContentService.createTextOutput(JSON.stringify({ status: "success", count: txs.length })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function updateYearlySummarySheets(ss, txs) {
  const yearMap = {}; 
  const allCategories = new Set();

  txs.forEach(t => {
    // Ensure we parse the date correctly from ISO string
    const d = new Date(t.date);
    if (isNaN(d.getTime())) return; // Skip invalid dates
    
    const year = d.getFullYear();
    const monthIdx = d.getMonth(); 
    
    if (!yearMap[year]) yearMap[year] = {};

    t.splits.forEach(s => {
      const cat = s.categoryName;
      allCategories.add(cat);
      if (!yearMap[year][cat]) yearMap[year][cat] = new Array(12).fill(0);
      yearMap[year][cat][monthIdx] += Number(s.amount) || 0;
    });
  });

  const catsSorted = Array.from(allCategories).sort();
  const years = Object.keys(yearMap).sort().reverse();

  years.forEach(year => {
    const sheetName = "Summary " + year;
    let sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
    
    sheet.clear();
    const headers = ["Category", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Yearly Total"];
    sheet.appendRow(headers);
    
    const yearData = yearMap[year];
    catsSorted.forEach(cat => {
      const monthData = yearData[cat];
      if (monthData) {
        const row = [cat, ...monthData];
        const yearlyTotal = monthData.reduce((a, b) => a + b, 0);
        row.push(yearlyTotal);
        sheet.appendRow(row);
      }
    });

    // Add Year Grand Total row
    const totalRow = ["GRAND TOTAL"];
    let grandTotal = 0;
    for (let m = 0; m < 12; m++) {
      let monthSum = 0;
      catsSorted.forEach(cat => {
        if (yearData[cat]) monthSum += yearData[cat][m];
      });
      totalRow.push(monthSum);
      grandTotal += monthSum;
    }
    totalRow.push(grandTotal);
    sheet.appendRow(totalRow);

    // Styling
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    sheet.getRange(1, 1, 1, lastCol).setFontWeight("bold").setBackground("#f8fafc").setFontColor("#1e293b");
    sheet.getRange(lastRow, 1, 1, lastCol).setFontWeight("bold").setBackground("#f1f5f9");
    sheet.getRange(2, 2, lastRow, lastCol - 1).setNumberFormat("$#,##0.00");
    sheet.setFrozenRows(1);
    sheet.setFrozenColumns(1);
    sheet.autoResizeColumns(1, lastCol);
  });
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
  const postResponse = await fetch(url, { 
    method: 'POST', 
    headers: { 'Content-Type': 'text/plain' }, 
    body: JSON.stringify({ transactions }) 
  });
  
  const postResult = await postResponse.json();
  if (postResult.status === 'error') {
    throw new Error("Script Error: " + postResult.message);
  }

  const res = await fetch(url);
  return await res.json();
};