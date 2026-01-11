import { Transaction } from '../types';

export const GOOGLE_APPS_SCRIPT_CODE = `/** DuoSpend Cloud Sync Script (Supports Multi-Category Splits) **/
function doPost(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheets()[0] || ss.insertSheet("Transactions");
  const data = JSON.parse(e.postData.contents);
  const txs = data.transactions;
  sheet.clear();
  sheet.appendRow(["ID", "Date", "Description", "User", "Total Amount", "SplitsJSON"]);
  txs.forEach(t => {
    sheet.appendRow([
      t.id, 
      t.date, 
      t.description, 
      t.userId, 
      t.totalAmount, 
      JSON.stringify(t.splits)
    ]);
  });
  return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheets()[0];
  if (!sheet) return ContentService.createTextOutput(JSON.stringify({ transactions: [] })).setMimeType(ContentService.MimeType.JSON);
  const rows = sheet.getDataRange().getValues();
  const transactions = [];
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    let splits = [];
    try {
      // Try to parse splits from JSON column, fallback to single split if it's old data
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