import React, { useState, useEffect, useMemo, memo } from 'react';
import { HashRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Transaction, CategoryDefinition, UserRole, PartnerNames, Goal, Category } from './types';
import { analyzeSpending, parseReceipt } from './services/geminiService';
import { CATEGORY_COLORS, CATEGORY_ICONS } from './constants';

const generateId = () => {
  try {
    return crypto.randomUUID();
  } catch (e) {
    return Math.random().toString(36).substring(2, 15);
  }
};

const DEFAULT_CATEGORIES: CategoryDefinition[] = Object.values(Category).map((catName, index) => ({
  id: String(index + 1),
  name: catName,
  color: CATEGORY_COLORS[catName] || '#94a3b8',
  icon: CATEGORY_ICONS[catName] || '💰'
}));

const DEFAULT_PARTNER_NAMES: PartnerNames = {
  [UserRole.PARTNER_1]: 'Partner 1',
  [UserRole.PARTNER_2]: 'Partner 2',
};

const GOOGLE_APPS_SCRIPT_CODE = `/**
 * DuoSpend Cloud Sync Script
 */
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

const Card = memo(({ title, children, className = "", accent, onClick }: { title: string; children: React.ReactNode; className?: string; accent?: string; onClick?: () => void }) => (
  <div 
    onClick={onClick}
    className={`bg-white rounded-[32px] shadow-sm border border-slate-100 p-6 relative overflow-hidden transition-all duration-300 hover:shadow-md ${onClick ? 'cursor-pointer active:scale-[0.98]' : ''} ${className}`}
  >
    {accent && <div className={`absolute top-0 left-0 w-1.5 h-full ${accent}`} />}
    <div className="mb-4">
      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{title}</h3>
    </div>
    {children}
  </div>
));

const ProgressBar = memo(({ progress, color }: { progress: number; color: string }) => (
  <div className="h-2 w-full bg-slate-50 rounded-full overflow-hidden">
    <div 
      className="h-full transition-all duration-700 ease-out rounded-full"
      style={{ width: `${Math.min(progress, 100)}%`, backgroundColor: color }}
    />
  </div>
));

const Dashboard = memo(({ 
  transactions, budgets, categories, partnerNames, goals, onUpdateGoal, onSettleUp, isSynced, lastSync 
}: { 
  transactions: Transaction[], budgets: Record<string, number>, categories: CategoryDefinition[],
  partnerNames: PartnerNames, goals: Goal[], onUpdateGoal: (id: string, amount: number) => void,
  onSettleUp: () => void, isSynced: boolean, lastSync: string
}) => {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const monthlyTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    categories.forEach(c => totals[c.name] = 0);
    let totalCombined = 0;
    let p1 = 0;
    let p2 = 0;

    for (const t of transactions) {
      if (t.userId === UserRole.PARTNER_1) p1 += t.totalAmount;
      else p2 += t.totalAmount;

      const d = new Date(t.date);
      if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
        totalCombined += t.totalAmount;
        for (const split of t.splits) {
          if (totals[split.categoryName] !== undefined) totals[split.categoryName] += split.amount;
        }
      }
    }
    return { totals, totalCombined, p1, p2 };
  }, [transactions, categories, currentMonth, currentYear]);

  const diff = monthlyTotals.p1 - monthlyTotals.p2;
  const settlementAmount = Math.abs(diff) / 2;
  const settlementMsg = diff === 0 
    ? "Perfectly Balanced ✨" 
    : diff > 0 
      ? `${partnerNames[UserRole.PARTNER_2]} owes $${settlementAmount.toFixed(2)}`
      : `${partnerNames[UserRole.PARTNER_1]} owes $${settlementAmount.toFixed(2)}`;

  return (
    <div className="space-y-8 animate-in pb-10">
      <header className="pt-4 flex justify-between items-start">
        <div>
          <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1">DuoSpend Live</p>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">Overview.</h1>
        </div>
        <div className="flex flex-col items-end">
          <div className={`p-2 rounded-full mb-1 ${isSynced ? 'bg-emerald-50 text-emerald-500' : 'bg-slate-100 text-slate-300'}`}>
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M5.5 16a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 1113.5 16h-8z" /></svg>
          </div>
          <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">{isSynced ? `Synced ${lastSync}` : 'Offline'}</span>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card title="Shared Equity" accent="bg-indigo-500" className="bg-gradient-to-br from-indigo-50/50 to-white">
            <div className="flex flex-col mb-4">
              <span className="text-2xl font-black text-slate-900 tracking-tight leading-tight">{settlementMsg}</span>
              <div className="flex gap-4 mt-3">
                <div className="text-[10px] font-bold text-slate-400 uppercase">{partnerNames[UserRole.PARTNER_1]}: <span className="text-slate-900 font-black">${monthlyTotals.p1.toFixed(0)}</span></div>
                <div className="text-[10px] font-bold text-slate-400 uppercase">{partnerNames[UserRole.PARTNER_2]}: <span className="text-slate-900 font-black">${monthlyTotals.p2.toFixed(0)}</span></div>
              </div>
            </div>
            {diff !== 0 && (
              <button onClick={onSettleUp} className="text-[10px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-100/50 px-4 py-2.5 rounded-xl hover:bg-indigo-100 transition-all active:scale-95">Reset Balance</button>
            )}
          </Card>
          <Card title="Monthly Combined" accent="bg-slate-900" className="bg-slate-900 text-white border-none shadow-xl">
            <div className="text-5xl font-black tracking-tighter">${monthlyTotals.totalCombined.toFixed(2)}</div>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-2">Current Spending Period</p>
          </Card>
        </div>
        <Card title="Budget Health">
          <div className="space-y-5 py-2 max-h-[500px] overflow-y-auto no-scrollbar">
            {categories.map(cat => {
              const spent = monthlyTotals.totals[cat.name] || 0;
              const budget = budgets[cat.name] || 0;
              const percent = Math.min((spent / (budget || 1)) * 100, 100);
              const isOver = spent > budget && budget > 0;
              return (
                <div key={cat.id} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-base grayscale-0">{cat.icon}</span>
                      <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider truncate max-w-[100px]">{cat.name}</span>
                    </div>
                    <span className={`text-[10px] font-black ${isOver ? 'text-rose-500' : 'text-slate-900'}`}>${spent.toFixed(0)} / ${budget.toFixed(0)}</span>
                  </div>
                  <ProgressBar progress={percent} color={isOver ? '#f43f5e' : cat.color} />
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
});

const TransactionList = memo(({ 
  transactions, categories, partnerNames, onAdd, onDelete, isAIEnabled 
}: { 
  transactions: Transaction[], categories: CategoryDefinition[], partnerNames: PartnerNames,
  onAdd: (t: Transaction) => void, onDelete: (id: string) => void, isAIEnabled: boolean
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(20);
  const [newDesc, setNewDesc] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [newUser, setNewUser] = useState<UserRole>(UserRole.PARTNER_1);
  const [newAmount, setNewAmount] = useState<string>('');
  const [newCat, setNewCat] = useState(categories[0]?.name || '');

  const groupedTransactions = useMemo(() => {
    const sorted = [...transactions].sort((a,b) => b.date.localeCompare(a.date)).slice(0, displayLimit);
    const groups: Record<string, Transaction[]> = {};
    sorted.forEach(t => {
      const d = new Date(t.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      if (!groups[d]) groups[d] = [];
      groups[d].push(t);
    });
    return Object.entries(groups);
  }, [transactions, displayLimit]);

  const handleManualAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(newAmount);
    if (isNaN(amountNum) || amountNum <= 0) return alert("Enter valid amount");
    onAdd({
      id: generateId(), description: newDesc || 'Expense', date: new Date(newDate).toISOString(),
      userId: newUser, splits: [{ categoryName: newCat, amount: amountNum }], totalAmount: amountNum
    });
    setIsModalOpen(false); setNewAmount(''); setNewDesc('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !isAIEnabled) return;
    setIsScanning(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      const parsed = await parseReceipt(base64, categories);
      if (parsed) {
        onAdd({
          id: generateId(), totalAmount: parsed.amount, description: parsed.description,
          splits: [{ categoryName: parsed.categoryName, amount: parsed.amount }],
          date: new Date().toISOString(), userId: newUser
        });
      }
      setIsScanning(false);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-8 animate-in pb-10">
      <header className="flex justify-between items-center pt-4">
        <h1 className="text-4xl font-black text-slate-900 tracking-tight">Timeline</h1>
        <div className="flex gap-2">
          <label className={`cursor-pointer bg-white border border-slate-200 p-4 rounded-2xl shadow-sm hover:bg-slate-50 transition-all active:scale-95 ${!isAIEnabled ? 'opacity-50' : ''}`}>
            <svg className={`w-5 h-5 ${isScanning ? 'animate-spin text-indigo-500' : 'text-slate-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /></svg>
            <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} disabled={!isAIEnabled} />
          </label>
          <button onClick={() => setIsModalOpen(true)} className="bg-slate-900 text-white px-6 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl hover:bg-indigo-600 transition-all active:scale-95">Log Entry</button>
        </div>
      </header>

      <div className="space-y-10">
        {groupedTransactions.map(([date, txs]) => (
          <div key={date} className="space-y-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">{date}</h3>
            <div className="space-y-3">
              {txs.map(t => (
                <div key={t.id} className="bg-white p-5 rounded-[24px] border border-slate-50 flex items-center justify-between group shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-lg">{categories.find(c => c.name === t.splits[0]?.categoryName)?.icon || '💰'}</div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-slate-900 text-sm truncate max-w-[140px] md:max-w-none">{t.description}</h4>
                      <p className="text-[10px] font-black text-slate-400 uppercase">{partnerNames[t.userId]}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-lg font-black text-slate-900">${t.totalAmount.toFixed(2)}</span>
                    <button onClick={() => onDelete(t.id)} className="text-slate-100 group-hover:text-rose-400 transition-colors p-1"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {transactions.length > displayLimit && <button onClick={() => setDisplayLimit(p => p + 30)} className="w-full py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 border-2 border-dashed border-slate-100 rounded-3xl hover:bg-slate-50 transition-colors">Show Older History</button>}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-[2px] p-4">
          <div className="bg-white rounded-[40px] w-full max-w-md p-8 shadow-2xl animate-in">
            <h2 className="text-2xl font-black mb-6 tracking-tight">New Log</h2>
            <form className="space-y-4" onSubmit={handleManualAdd}>
              <input required value={newDesc} onChange={e => setNewDesc(e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-none outline-none font-bold" placeholder="Store Name" />
              <div className="grid grid-cols-2 gap-4">
                <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} required className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-none outline-none font-bold" />
                <select value={newUser} onChange={e => setNewUser(e.target.value as UserRole)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-none outline-none font-bold">
                  <option value={UserRole.PARTNER_1}>{partnerNames[UserRole.PARTNER_1]}</option>
                  <option value={UserRole.PARTNER_2}>{partnerNames[UserRole.PARTNER_2]}</option>
                </select>
              </div>
              <div className="flex gap-4">
                <select value={newCat} onChange={e => setNewCat(e.target.value)} className="flex-1 px-6 py-4 rounded-2xl bg-slate-50 border-none outline-none font-bold">
                  {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
                <input type="number" step="0.01" value={newAmount} onChange={e => setNewAmount(e.target.value)} required className="w-24 px-6 py-4 rounded-2xl bg-slate-50 border-none outline-none font-black text-right" placeholder="0.00" />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 font-black uppercase text-[10px] text-slate-400">Cancel</button>
                <button type="submit" className="flex-[2] bg-slate-900 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest">Add</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
});

const Navigation: React.FC = () => {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;
  return (
    <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-xl border border-white/50 shadow-2xl rounded-[32px] p-2 flex gap-1 z-40 w-[90%] max-w-sm safe-bottom">
      {[
        { path: '/', label: 'HOME', icon: '🏠' },
        { path: '/transactions', label: 'FEED', icon: '📜' },
        { path: '/ai', label: 'COACH', icon: '✨' },
        { path: '/settings', label: 'SETUP', icon: '⚙️' },
      ].map(item => (
        <Link key={item.path} to={item.path} className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-[24px] transition-all duration-300 ${isActive(item.path) ? 'bg-slate-900 text-white shadow-xl scale-105' : 'text-slate-400 hover:text-slate-600'}`}>
          <span className="text-xl">{item.icon}</span>
          <span className="text-[8px] font-black tracking-widest">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
};

const App: React.FC = () => {
  const [partnerNames, setPartnerNames] = useState<PartnerNames>(() => {
    const saved = localStorage.getItem('ds_partners');
    return saved ? JSON.parse(saved) : DEFAULT_PARTNER_NAMES;
  });
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem('ds_tx');
    return saved ? JSON.parse(saved) : [];
  });
  const [budgets] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('ds_budgets');
    if (saved) return JSON.parse(saved);
    const initial: Record<string, number> = {};
    DEFAULT_CATEGORIES.forEach(c => initial[c.name] = 100);
    return initial;
  });
  const [goals, setGoals] = useState<Goal[]>(() => {
    const saved = localStorage.getItem('ds_goals');
    return saved ? JSON.parse(saved) : [{ id: '1', name: 'Emergency Fund', target: 5000, current: 0, icon: '🛡️' }];
  });
  const [syncUrl, setSyncUrl] = useState(() => localStorage.getItem('ds_sync_url') || '');
  const [lastSync, setLastSync] = useState(() => localStorage.getItem('ds_last_sync') || 'Never');
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => localStorage.setItem('ds_partners', JSON.stringify(partnerNames)), [partnerNames]);
  useEffect(() => localStorage.setItem('ds_tx', JSON.stringify(transactions)), [transactions]);
  useEffect(() => localStorage.setItem('ds_goals', JSON.stringify(goals)), [goals]);
  useEffect(() => localStorage.setItem('ds_sync_url', syncUrl), [syncUrl]);
  useEffect(() => localStorage.setItem('ds_last_sync', lastSync), [lastSync]);

  const isAIEnabled = useMemo(() => {
    const key = process.env.API_KEY;
    return !!(key && key !== 'undefined' && key.trim().length > 5);
  }, []);

  const syncData = async () => {
    if (!syncUrl) return alert("Enter Sync URL first.");
    setIsSyncing(true);
    try {
      await fetch(syncUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ transactions }) });
      const res = await fetch(syncUrl);
      const data = await res.json();
      if (data.transactions) { setTransactions(data.transactions); setLastSync(new Date().toLocaleTimeString()); }
    } catch (err) { alert("Sync failed."); } finally { setIsSyncing(false); }
  };

  return (
    <HashRouter>
      <div className="min-h-screen pb-40 px-6">
        <div className="max-w-xl mx-auto">
          <Routes>
            <Route path="/" element={<Dashboard transactions={transactions} budgets={budgets} categories={DEFAULT_CATEGORIES} partnerNames={partnerNames} goals={goals} onUpdateGoal={(id, amt) => setGoals(g => g.map(x => x.id === id ? {...x, current: amt} : x))} onSettleUp={() => {}} isSynced={lastSync !== 'Never'} lastSync={lastSync} />} />
            <Route path="/transactions" element={<TransactionList transactions={transactions} categories={DEFAULT_CATEGORIES} partnerNames={partnerNames} onAdd={t => setTransactions(p => [...p, t])} onDelete={id => setTransactions(p => p.filter(t => t.id !== id))} isAIEnabled={isAIEnabled} />} />
            <Route path="/ai" element={<div className="pt-10"><AIAdvisor transactions={transactions} budgets={budgets} categories={DEFAULT_CATEGORIES} isEnabled={isAIEnabled} /></div>} />
            <Route path="/settings" element={
              <div className="space-y-10 animate-in pt-10 pb-10">
                <header><h1 className="text-4xl font-black text-slate-900 tracking-tight">Launch Pad</h1></header>
                
                <section className="space-y-4">
                  <h2 className="text-xl font-black tracking-tight">📱 Install as App</h2>
                  <Card title="Add to Home Screen">
                    <div className="space-y-4">
                      <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-2xl">
                        <div className="bg-white p-3 rounded-xl shadow-sm text-xl"></div>
                        <div>
                          <p className="text-xs font-black uppercase text-slate-900 mb-1">iPhone / iOS</p>
                          <p className="text-[11px] font-medium text-slate-500 leading-relaxed">Tap the <span className="text-indigo-500 font-bold">Share</span> icon (square with arrow) and select <span className="text-indigo-500 font-bold">"Add to Home Screen"</span>.</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-2xl">
                        <div className="bg-white p-3 rounded-xl shadow-sm text-xl">🤖</div>
                        <div>
                          <p className="text-xs font-black uppercase text-slate-900 mb-1">Android / Chrome</p>
                          <p className="text-[11px] font-medium text-slate-500 leading-relaxed">Tap the <span className="text-indigo-500 font-bold">3 dots</span> menu and select <span className="text-indigo-500 font-bold">"Install App"</span> or "Add to Home Screen".</p>
                        </div>
                      </div>
                    </div>
                  </Card>
                </section>

                <section className="space-y-4">
                  <h2 className="text-xl font-black tracking-tight">Cloud Database</h2>
                  <Card title="Sync Control">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Web App URL</p>
                        <input value={syncUrl} onChange={e => setSyncUrl(e.target.value)} className="w-full px-4 py-4 rounded-xl bg-slate-50 border-none text-sm font-bold outline-none" placeholder="https://script.google.com/..." />
                      </div>
                      <div className="flex justify-between items-center pt-2">
                        <div className="flex flex-col"><span className="text-[8px] font-black text-slate-400 uppercase">Last Sync</span><span className="text-[10px] font-black text-slate-900 uppercase">{lastSync}</span></div>
                        <button onClick={syncData} disabled={isSyncing || !syncUrl} className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-indigo-600 shadow-lg disabled:opacity-30">{isSyncing ? '...' : 'Sync Now'}</button>
                      </div>
                    </div>
                  </Card>
                </section>

                <section className="space-y-4">
                  <h2 className="text-xl font-black tracking-tight">Partner Profiles</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <Card title="Partner 1"><input value={partnerNames[UserRole.PARTNER_1]} onChange={e => setPartnerNames({...partnerNames, [UserRole.PARTNER_1]: e.target.value})} className="w-full text-lg font-black text-indigo-500 bg-transparent outline-none" /></Card>
                    <Card title="Partner 2"><input value={partnerNames[UserRole.PARTNER_2]} onChange={e => setPartnerNames({...partnerNames, [UserRole.PARTNER_2]: e.target.value})} className="w-full text-lg font-black text-rose-500 bg-transparent outline-none" /></Card>
                  </div>
                </section>
              </div>
            } />
          </Routes>
        </div>
        <Navigation />
      </div>
    </HashRouter>
  );
};

const AIAdvisor = memo(({ transactions, budgets, categories, isEnabled }: { transactions: Transaction[], budgets: Record<string, number>, categories: CategoryDefinition[], isEnabled: boolean }) => {
  const [advice, setAdvice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const getAdvice = async () => {
    setIsLoading(true);
    try { const result = await analyzeSpending(transactions, budgets, categories); setAdvice(result); } 
    catch (err) { alert("AI unreachable."); } finally { setIsLoading(false); }
  };
  return (
    <div className="space-y-8 animate-in pb-10">
      <header><h1 className="text-4xl font-black text-slate-900 tracking-tight text-center">DuoCoach</h1></header>
      <div className="bg-slate-900 rounded-[40px] p-10 text-white shadow-2xl relative overflow-hidden text-center">
        <h2 className="text-2xl font-black mb-6 tracking-tight leading-tight">Ready for a spending review?</h2>
        <button onClick={getAdvice} disabled={isLoading || !isEnabled} className="bg-white text-slate-900 px-10 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 transition-all disabled:opacity-50">{isLoading ? 'Crunching...' : 'Ask AI Coach'}</button>
      </div>
      {advice && <div className="bg-white rounded-[40px] p-8 border border-slate-100 shadow-xl animate-in"><div className="prose prose-slate max-w-none whitespace-pre-wrap text-slate-600 font-medium text-sm leading-relaxed">{advice}</div></div>}
    </div>
  );
});

export default App;