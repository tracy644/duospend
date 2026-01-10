import { Transaction } from '../types';

export const GOOGLE_APPS_SCRIPT_CODE = `/** DuoSpend Cloud Sync Script **/
function doPost(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheets()[0] || ss.insertSheet("Transactions");
  const data = JSON.parse(e.postData.contents);
  const txs = data.transactions;
  sheet.clear();
  sheet.appendRow(["ID", "Date", "Description", "User", "Amount", "Category"]);
  txs.forEach(t => {
    sheet.appendRow([t.id, t.date, t.description, t.userId, t.totalAmount, t.splits[0]?.categoryName || 'Other']);
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
    transactions.push({
      id: String(rows[i][0]),
      date: rows[i][1],
      description: rows[i][2],
      userId: rows[i][3],
      totalAmount: Number(rows[i][4]),
      splits: [{ categoryName: rows[i][5], amount: Number(rows[i][4]) }]
    });
  }
  return ContentService.createTextOutput(JSON.stringify({ transactions: transactions })).setMimeType(ContentService.MimeType.JSON);
}`;

export const performSync = async (url: string, transactions: Transaction[]) => {
  await fetch(url, { 
    method: 'POST', 
    headers: { 'Content-Type': 'text/plain' }, 
    body: JSON.stringify({ transactions }) 
  });
  const res = await fetch(url);
  return await res.json();
};