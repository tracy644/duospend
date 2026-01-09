import React, { useState, useEffect, useMemo } from 'react';
import { HashRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Transaction, CategoryDefinition, UserRole, PartnerNames } from './types';
import { analyzeSpending, parseReceipt } from './services/geminiService';

const DEFAULT_CATEGORIES: CategoryDefinition[] = [
  { id: '1', name: 'Food & Dining', color: '#f97316', icon: '🍔' },
  { id: '2', name: 'Rent & Utilities', color: '#0ea5e9', icon: '🏠' },
  { id: '3', name: 'Entertainment', color: '#8b5cf6', icon: '🎉' },
  { id: '4', name: 'Shopping', color: '#ec4899', icon: '🛍️' },
  { id: '5', name: 'Transport', color: '#22c55e', icon: '🚗' },
];

const DEFAULT_PARTNER_NAMES: PartnerNames = {
  [UserRole.PARTNER_1]: 'Partner 1',
  [UserRole.PARTNER_2]: 'Partner 2',
};

const GOOGLE_APPS_SCRIPT = `function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Log') || ss.insertSheet('Log');
  var data = JSON.parse(e.postData.contents);
  sheet.appendRow([new Date(), JSON.stringify(data)]);
  return ContentService.createTextOutput("Success").setMimeType(ContentService.MimeType.TEXT);
}`;

const Card: React.FC<{ title: string; children: React.ReactNode; className?: string; accent?: string }> = ({ title, children, className = "", accent }) => (
  <div className={`bg-white rounded-[32px] shadow-sm border border-slate-100 p-6 relative overflow-hidden transition-all duration-300 hover:shadow-md ${className}`}>
    {accent && <div className={`absolute top-0 left-0 w-1.5 h-full ${accent}`} />}
    <div className="mb-4">
      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{title}</h3>
    </div>
    {children}
  </div>
);

const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
      <div className="bg-white rounded-t-[40px] sm:rounded-[40px] w-full max-w-lg shadow-2xl overflow-hidden animate-in">
        <div className="px-8 py-6 border-b border-slate-50 flex justify-between items-center bg-white/80 backdrop-blur-sm sticky top-0 z-10">
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-slate-50 p-2 rounded-full transition-all">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-8 max-h-[80vh] overflow-y-auto no-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
};

const Dashboard: React.FC<{ 
  transactions: Transaction[], 
  budgets: Record<string, number>, 
  categories: CategoryDefinition[],
  partnerNames: PartnerNames,
  onSync: () => Promise<void>,
  isSyncing: boolean
}> = ({ transactions, budgets, categories, partnerNames, onSync, isSyncing }) => {
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  const monthlyTransactions = useMemo(() => transactions.filter(t => {
    const d = new Date(t.date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  }), [transactions, currentMonth, currentYear]);

  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    categories.forEach(c => totals[c.name] = 0);
    monthlyTransactions.forEach(t => {
      t.splits.forEach(split => {
        if (totals[split.categoryName] !== undefined) totals[split.categoryName] += split.amount;
      });
    });
    return Object.entries(totals).map(([name, value]) => ({ name, value }));
  }, [monthlyTransactions, categories]);

  const totalSpent = monthlyTransactions.reduce((acc, curr) => acc + curr.totalAmount, 0);
  const p1Total = monthlyTransactions.filter(t => t.userId === UserRole.PARTNER_1).reduce((acc, curr) => acc + curr.totalAmount, 0);
  const p2Total = monthlyTransactions.filter(t => t.userId === UserRole.PARTNER_2).reduce((acc, curr) => acc + curr.totalAmount, 0);
  
  const diff = p1Total - p2Total;
  const settlementAmount = Math.abs(diff) / 2;
  const settlementMsg = diff > 0 
    ? `${partnerNames[UserRole.PARTNER_2]} owes ${partnerNames[UserRole.PARTNER_1]} $${settlementAmount.toFixed(2)}`
    : diff < 0 
      ? `${partnerNames[UserRole.PARTNER_1]} owes ${partnerNames[UserRole.PARTNER_2]} $${settlementAmount.toFixed(2)}`
      : "Balanced Spending ✨";

  const chartData = categoryTotals.filter(t => t.value > 0);

  return (
    <div className="space-y-8 animate-in pb-10">
      <header className="flex justify-between items-start pt-4">
        <div>
          <p className="text-xs font-black text-indigo-600 uppercase tracking-widest mb-1">Our Dashboard</p>
          <h1 className="text-5xl font-black text-slate-900 tracking-tighter italic">DuoSpend</h1>
        </div>
        <button 
          onClick={onSync} 
          disabled={isSyncing}
          className={`px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${isSyncing ? 'bg-slate-100 text-slate-400' : 'bg-white text-slate-900 shadow-sm border border-slate-200 hover:bg-slate-50 active:scale-95'}`}
        >
          {isSyncing ? 'Syncing...' : 'Sync Cloud'}
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card title="Settlement Status" accent="bg-indigo-500" className="bg-gradient-to-br from-indigo-50/50 to-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-black text-slate-900 tracking-tight leading-tight">{settlementMsg}</p>
                <p className="text-[10px] font-bold text-slate-500 uppercase mt-2 tracking-wider italic">50/50 SPLIT TARGET</p>
              </div>
            </div>
          </Card>

          <Card title="Monthly Combined" accent="bg-slate-900" className="bg-slate-900 text-white border-none shadow-2xl">
            <div className="text-5xl font-black text-white tracking-tighter">${totalSpent.toFixed(2)}</div>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mt-3">TOTAL SPENT THIS PERIOD</p>
          </Card>

          <Card title="Spending Mix" className="h-[240px] flex flex-col items-center justify-center">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={65}
                    paddingAngle={8}
                    dataKey="value"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={categories.find(c => c.name === entry.name)?.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '10px', fontWeight: '900', textTransform: 'uppercase' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-[10px] font-black text-slate-300 uppercase">No data for chart</p>
            )}
          </Card>
        </div>

        <Card title="Budget Health">
          <div className="space-y-5 py-2">
            {categories.map(cat => {
              const spent = categoryTotals.find(t => t.name === cat.name)?.value || 0;
              const budget = budgets[cat.name] || 0;
              const percent = Math.min((spent / (budget || 1)) * 100, 100) || 0;
              const isOver = spent > budget && budget > 0;
              
              return (
                <div key={cat.id} className="space-y-1.5">
                  <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider">
                    <span className="text-slate-500">{cat.icon} {cat.name}</span>
                    <span className={isOver ? 'text-rose-500' : 'text-slate-900'}>${spent.toFixed(0)} / ${budget.toFixed(0)}</span>
                  </div>
                  <div className="h-2.5 w-full bg-slate-50 rounded-full overflow-hidden">
                    <div 
                      className="h-full transition-all duration-1000 rounded-full"
                      style={{ width: `${percent}%`, backgroundColor: isOver ? '#ef4444' : cat.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
};

const TransactionList: React.FC<{ 
  transactions: Transaction[], 
  categories: CategoryDefinition[],
  partnerNames: PartnerNames,
  onAdd: (t: Transaction) => void,
  onDelete: (id: string) => void
}> = ({ transactions, categories, partnerNames, onAdd, onDelete }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [newDesc, setNewDesc] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [newUser, setNewUser] = useState<UserRole>(UserRole.PARTNER_1);
  const [newAmount, setNewAmount] = useState<string>('');
  const [newCat, setNewCat] = useState(categories[0]?.name || '');

  const handleManualAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(newAmount);
    if (isNaN(amountNum) || amountNum <= 0) return alert("Enter a valid amount");
    
    onAdd({
      id: crypto.randomUUID(),
      description: newDesc || 'Expense',
      date: new Date(newDate).toISOString(),
      userId: newUser,
      splits: [{ categoryName: newCat, amount: amountNum }],
      totalAmount: amountNum
    });
    setIsModalOpen(false);
    setNewAmount('');
    setNewDesc('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsScanning(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      const parsed = await parseReceipt(base64, categories);
      if (parsed) {
        onAdd({
          id: crypto.randomUUID(),
          totalAmount: parsed.amount,
          description: parsed.description,
          splits: [{ categoryName: parsed.categoryName, amount: parsed.amount }],
          date: new Date().toISOString(),
          userId: newUser
        });
      } else {
        alert("Couldn't read receipt. Try a clearer photo.");
      }
      setIsScanning(false);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-8 animate-in pb-10">
      <header className="flex justify-between items-center pt-4">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">Timeline</h1>
          <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">Our History</p>
        </div>
        <div className="flex gap-3">
          <label className="cursor-pointer bg-white border border-slate-200 w-14 h-14 rounded-[22px] text-slate-600 hover:bg-slate-50 transition-all flex items-center justify-center shadow-sm active:scale-95">
            <svg className={`w-6 h-6 ${isScanning ? 'animate-bounce text-indigo-500' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            </svg>
            <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
          </label>
          <button onClick={() => setIsModalOpen(true)} className="bg-slate-900 text-white px-8 rounded-[22px] font-black uppercase text-[10px] tracking-widest shadow-xl hover:bg-indigo-600 transition-all active:scale-95">
            Log New
          </button>
        </div>
      </header>

      <div className="space-y-4">
        {transactions.length === 0 ? (
          <div className="py-20 text-center text-slate-300 uppercase font-black text-[10px] tracking-widest">No entries found</div>
        ) : [...transactions].sort((a,b) => b.date.localeCompare(a.date)).map((t) => (
          <div key={t.id} className="bg-white p-5 rounded-[32px] border border-slate-100 flex items-center justify-between group transition-all hover:translate-x-1">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-xl grayscale group-hover:grayscale-0 transition-all">
                {categories.find(c => c.name === t.splits[0]?.categoryName)?.icon || '💰'}
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">{t.description}</h4>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                  {new Date(t.date).toLocaleDateString()} • {partnerNames[t.userId]}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-lg font-black text-slate-900">${t.totalAmount.toFixed(2)}</span>
              <button onClick={() => onDelete(t.id)} className="text-slate-200 hover:text-rose-500 transition-colors p-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Log Entry">
        <form className="space-y-6" onSubmit={handleManualAdd}>
          <div className="space-y-4">
            <input required value={newDesc} onChange={e => setNewDesc(e.target.value)} className="w-full px-6 py-4 rounded-[20px] bg-slate-50 border-none outline-none font-bold placeholder-slate-300" placeholder="Where did you spend?" />
            <div className="grid grid-cols-2 gap-4">
              <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} required className="w-full px-6 py-4 rounded-[20px] bg-slate-50 border-none outline-none font-bold" />
              <select value={newUser} onChange={e => setNewUser(e.target.value as UserRole)} className="w-full px-6 py-4 rounded-[20px] bg-slate-50 border-none outline-none font-bold appearance-none">
                <option value={UserRole.PARTNER_1}>{partnerNames[UserRole.PARTNER_1]}</option>
                <option value={UserRole.PARTNER_2}>{partnerNames[UserRole.PARTNER_2]}</option>
              </select>
            </div>
            <div className="flex gap-4">
              <select value={newCat} onChange={e => setNewCat(e.target.value)} className="flex-1 px-6 py-4 rounded-[20px] bg-slate-50 border-none outline-none font-bold appearance-none">
                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
              <input type="number" step="0.01" value={newAmount} onChange={e => setNewAmount(e.target.value)} required className="w-32 px-6 py-4 rounded-[20px] bg-slate-50 border-none outline-none font-black text-slate-900" placeholder="$0.00" />
            </div>
          </div>
          <button type="submit" className="w-full bg-slate-900 text-white py-5 rounded-[24px] font-black uppercase tracking-widest shadow-2xl active:scale-95 transition-transform">Confirm Log</button>
        </form>
      </Modal>
    </div>
  );
};

const Navigation: React.FC = () => {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;
  const navItems = [
    { path: '/', label: 'HOME', icon: '🏠' },
    { path: '/transactions', label: 'FEED', icon: '📜' },
    { path: '/ai', label: 'COACH', icon: '✨' },
    { path: '/settings', label: 'SETUP', icon: '⚙️' },
  ];
  return (
    <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white/80 backdrop-blur-2xl border border-white/50 shadow-2xl rounded-[32px] p-2 flex gap-1 z-40 w-[94%] max-w-sm">
      {navItems.map(item => (
        <Link key={item.path} to={item.path} className={`flex-1 flex flex-col items-center gap-1.5 py-4 rounded-[24px] transition-all duration-300 ${isActive(item.path) ? 'bg-slate-900 text-white shadow-xl scale-105' : 'text-slate-400 hover:text-slate-600'}`}>
          <span className="text-xl leading-none">{item.icon}</span>
          <span className="text-[8px] font-black uppercase tracking-[0.2em]">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
};

const AIAdvisor: React.FC<{ transactions: Transaction[], budgets: Record<string, number>, categories: CategoryDefinition[] }> = ({ transactions, budgets, categories }) => {
  const [advice, setAdvice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const getAdvice = async () => {
    if (transactions.length === 0) return alert("Add some transactions first!");
    setIsLoading(true);
    try {
      const result = await analyzeSpending(transactions, budgets, categories);
      setAdvice(result);
    } catch (err) {
      alert("AI failed. Check your API key.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in pt-4 pb-10">
      <header className="text-center">
        <h1 className="text-4xl font-black text-slate-900 tracking-tight">AI Coach</h1>
        <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">Smart Insights</p>
      </header>
      <div className="bg-slate-900 rounded-[48px] p-12 text-white shadow-2xl text-center relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/30 rounded-full blur-3xl -mr-32 -mt-32" />
        <div className="w-20 h-20 bg-white/10 backdrop-blur-md rounded-3xl flex items-center justify-center text-4xl mx-auto mb-8 border border-white/10">✨</div>
        <h2 className="text-3xl font-black mb-6 tracking-tight">Financial Health Check</h2>
        <button onClick={getAdvice} disabled={isLoading} className="bg-white text-slate-900 px-12 py-5 rounded-[24px] font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 disabled:opacity-50 transition-all active:scale-95">
          {isLoading ? 'Thinking...' : 'Analyze Spending'}
        </button>
      </div>
      {advice && (
        <div className="bg-white rounded-[48px] p-10 border border-slate-100 shadow-xl animate-in prose prose-slate max-w-none">
          <div className="whitespace-pre-wrap text-slate-600 leading-relaxed font-medium text-sm">{advice}</div>
        </div>
      )}
    </div>
  );
};

const App: React.FC = () => {
  const [categories] = useState<CategoryDefinition[]>(DEFAULT_CATEGORIES);
  const [partnerNames, setPartnerNames] = useState<PartnerNames>(() => {
    const saved = localStorage.getItem('duospend_partners');
    return saved ? JSON.parse(saved) : DEFAULT_PARTNER_NAMES;
  });
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem('duospend_tx');
    return saved ? JSON.parse(saved) : [];
  });
  const [budgets, setBudgets] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('duospend_budgets');
    return saved ? JSON.parse(saved) : { 'Food & Dining': 600, 'Rent & Utilities': 1500, 'Entertainment': 200, 'Shopping': 300, 'Transport': 150 };
  });
  const [syncUrl, setSyncUrl] = useState<string | undefined>(() => localStorage.getItem('duospend_sync_url') || undefined);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => localStorage.setItem('duospend_tx', JSON.stringify(transactions)), [transactions]);
  useEffect(() => localStorage.setItem('duospend_budgets', JSON.stringify(budgets)), [budgets]);
  useEffect(() => localStorage.setItem('duospend_partners', JSON.stringify(partnerNames)), [partnerNames]);
  useEffect(() => { if (syncUrl) localStorage.setItem('duospend_sync_url', syncUrl) }, [syncUrl]);

  const addTransaction = (t: Transaction) => setTransactions(p => [...p, t]);
  const deleteTransaction = (id: string) => {
    if (confirm("Permanently delete this entry?")) {
      setTransactions(p => p.filter(t => t.id !== id));
    }
  };

  const performSync = async () => {
    if (!syncUrl) return alert("Configure your Sync URL in Setup!");
    setIsSyncing(true);
    try {
      await fetch(syncUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ transactions, partners: partnerNames, budgets })
      });
      alert("Sync completed successfully!");
    } catch (e) {
      alert("Sync failed. Check your network or Apps Script URL.");
    } finally {
      setIsSyncing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Script copied to clipboard!");
  };

  return (
    <HashRouter>
      <div className="min-h-screen pb-40">
        <div className="max-w-4xl mx-auto px-6 pt-10">
          <Routes>
            <Route path="/" element={<Dashboard transactions={transactions} budgets={budgets} categories={categories} partnerNames={partnerNames} onSync={performSync} isSyncing={isSyncing} />} />
            <Route path="/transactions" element={<TransactionList transactions={transactions} categories={categories} partnerNames={partnerNames} onAdd={addTransaction} onDelete={deleteTransaction} />} />
            <Route path="/ai" element={<AIAdvisor transactions={transactions} budgets={budgets} categories={categories} />} />
            <Route path="/settings" element={
              <div className="space-y-10 animate-in pt-4 pb-10">
                <header>
                  <h1 className="text-4xl font-black text-slate-900 tracking-tight">Setup</h1>
                  <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">Config & Sync</p>
                </header>
                
                <section className="space-y-6">
                  <h2 className="text-xl font-black text-slate-900">Partners</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <Card title="Partner 1 Name" accent="bg-indigo-500">
                      <input type="text" value={partnerNames[UserRole.PARTNER_1]} onChange={(e) => setPartnerNames({ ...partnerNames, [UserRole.PARTNER_1]: e.target.value })} className="w-full text-xl font-black text-indigo-600 bg-transparent border-none focus:ring-0 p-0" />
                    </Card>
                    <Card title="Partner 2 Name" accent="bg-pink-500">
                      <input type="text" value={partnerNames[UserRole.PARTNER_2]} onChange={(e) => setPartnerNames({ ...partnerNames, [UserRole.PARTNER_2]: e.target.value })} className="w-full text-xl font-black text-pink-500 bg-transparent border-none focus:ring-0 p-0" />
                    </Card>
                  </div>
                </section>

                <section className="space-y-6">
                  <h2 className="text-xl font-black text-slate-900">Monthly Targets</h2>
                  <div className="space-y-3">
                    {categories.map(cat => (
                      <div key={cat.id} className="bg-white p-4 rounded-[24px] border border-slate-100 flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase text-slate-400">{cat.icon} {cat.name}</span>
                        <input 
                          type="number" 
                          value={budgets[cat.name] || 0} 
                          onChange={(e) => setBudgets({ ...budgets, [cat.name]: parseFloat(e.target.value) || 0 })}
                          className="w-24 bg-slate-50 px-3 py-2 rounded-xl text-right font-black text-slate-900 border-none outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </section>

                <section className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h2 className="text-xl font-black text-slate-900">Cloud Sync (Optional)</h2>
                    <button onClick={() => copyToClipboard(GOOGLE_APPS_SCRIPT)} className="text-[10px] font-black text-indigo-500 uppercase tracking-widest hover:text-indigo-700">Copy Script</button>
                  </div>
                  <Card title="Apps Script Webhook URL">
                    <input type="url" value={syncUrl || ''} onChange={(e) => setSyncUrl(e.target.value)} placeholder="https://script.google.com/..." className="w-full px-6 py-4 rounded-[20px] bg-slate-50 border-none outline-none font-bold text-sm" />
                  </Card>
                  <div className="bg-indigo-50 rounded-[32px] p-8 border border-indigo-100">
                    <h3 className="text-indigo-900 font-black text-sm mb-2">Google Sheets Script</h3>
                    <p className="text-[10px] font-bold text-indigo-400 uppercase mb-4 tracking-wider">Paste this in Extensions > Apps Script</p>
                    <pre className="bg-slate-900 text-indigo-200 p-4 rounded-2xl text-[10px] overflow-x-auto no-scrollbar font-mono leading-relaxed select-all">
                      {GOOGLE_APPS_SCRIPT}
                    </pre>
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

export default App;