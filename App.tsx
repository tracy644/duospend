import React, { useState, useEffect, useMemo } from 'react';
import { HashRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip
} from 'recharts';
import { Transaction, CategoryDefinition, UserRole, PartnerNames, TransactionSplit } from './types';
import { analyzeSpending, parseReceipt } from './services/geminiService';

const DEFAULT_CATEGORIES: CategoryDefinition[] = [
  { id: '1', name: 'Food & Dining', color: '#f97316', icon: '🍔' },
  { id: '2', name: 'Rent & Utilities', color: '#0ea5e9', icon: '🏠' },
  { id: '3', name: 'Entertainment', color: '#8b5cf6', icon: '🎉' },
  { id: '4', name: 'Shopping', color: '#ec4899', icon: '🛍️' },
  { id: '5', name: 'Transport', color: '#22c55e', icon: '🚗' },
];

const DEFAULT_PARTNER_NAMES: PartnerNames = {
  [UserRole.PARTNER_1]: 'Tracy',
  [UserRole.PARTNER_2]: 'Trish',
};

const GOOGLE_APPS_SCRIPT = `function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Log') || ss.insertSheet('Log');
  var data = JSON.parse(e.postData.contents);
  
  // Basic logging
  sheet.appendRow([new Date(), JSON.stringify(data)]);
  
  return ContentService.createTextOutput("Success").setMimeType(ContentService.MimeType.TEXT);
}`;

const Card: React.FC<{ title: string; children: React.ReactNode; className?: string; subtitle?: string; accent?: string }> = ({ title, children, className = "", subtitle, accent }) => (
  <div className={`bg-white rounded-[32px] shadow-sm border border-slate-100 p-6 relative overflow-hidden transition-all duration-300 hover:shadow-md ${className}`}>
    {accent && <div className={`absolute top-0 left-0 w-1.5 h-full ${accent}`} />}
    <div className="mb-4">
      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{title}</h3>
      {subtitle && <p className="text-xs text-slate-400 mt-1 font-medium">{subtitle}</p>}
    </div>
    {children}
  </div>
);

const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 transition-all duration-300">
      <div className="bg-white rounded-t-[40px] sm:rounded-[40px] w-full max-w-lg shadow-2xl overflow-hidden animate-in">
        <div className="px-8 py-6 border-b border-slate-50 flex justify-between items-center bg-white/80 backdrop-blur-sm sticky top-0 z-10">
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-slate-50 p-2 rounded-full transition-all hover:rotate-90">
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
  isSyncing: boolean,
  lastSync?: string
}> = ({ transactions, budgets, categories, partnerNames, onSync, isSyncing, lastSync }) => {
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
  const partner1Total = monthlyTransactions.filter(t => t.userId === UserRole.PARTNER_1).reduce((acc, curr) => acc + curr.totalAmount, 0);
  const partner2Total = monthlyTransactions.filter(t => t.userId === UserRole.PARTNER_2).reduce((acc, curr) => acc + curr.totalAmount, 0);
  
  const gap = Math.abs(partner1Total - partner2Total);
  const leadingPartner = partner1Total >= partner2Total ? UserRole.PARTNER_1 : UserRole.PARTNER_2;

  return (
    <div className="space-y-8 animate-in">
      <header className="flex justify-between items-start pt-4">
        <div>
          <p className="text-xs font-black text-indigo-600 uppercase tracking-widest mb-1">Our Treasury</p>
          <h1 className="text-5xl font-black text-slate-900 tracking-tighter italic">DuoSpend</h1>
          {lastSync && (
             <p className="text-[9px] font-black text-slate-400 uppercase mt-2">Last Sync: {new Date(lastSync).toLocaleTimeString()}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <button 
            onClick={onSync} 
            disabled={isSyncing}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${isSyncing ? 'bg-slate-100 text-slate-400' : 'bg-white text-slate-900 shadow-sm border border-slate-200 hover:bg-slate-50 active:scale-95'}`}
          >
            {isSyncing ? <div className="w-3 h-3 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin" /> : 'Sync Data'}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card title="The Balance" accent="bg-indigo-500" className="bg-gradient-to-br from-indigo-50/50 to-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-4xl font-black text-slate-900 tracking-tight">${gap.toFixed(2)}</p>
                <p className="text-[10px] font-bold text-slate-500 uppercase mt-2 tracking-wider leading-tight">
                  {partner1Total === partner2Total ? "Perfect Balance" : `${partnerNames[leadingPartner]} is ahead`}
                </p>
              </div>
              <div className="flex -space-x-4">
                <div title={partnerNames[UserRole.PARTNER_1]} className={`w-14 h-14 rounded-2xl flex items-center justify-center border-4 border-white transition-all ${partner1Total >= partner2Total ? 'bg-indigo-600 text-white shadow-xl scale-110 z-10' : 'bg-slate-200 text-slate-400'}`}>
                  <span className="font-black text-sm">{partnerNames[UserRole.PARTNER_1][0]}</span>
                </div>
                <div title={partnerNames[UserRole.PARTNER_2]} className={`w-14 h-14 rounded-2xl flex items-center justify-center border-4 border-white transition-all ${partner2Total > partner1Total ? 'bg-pink-500 text-white shadow-xl scale-110 z-10' : 'bg-slate-200 text-slate-400'}`}>
                  <span className="font-black text-sm">{partnerNames[UserRole.PARTNER_2][0]}</span>
                </div>
              </div>
            </div>
          </Card>

          <Card title="Monthly Spending" accent="bg-slate-900" className="bg-slate-900 text-white border-none shadow-2xl">
            <div className="text-5xl font-black text-white tracking-tighter">${totalSpent.toFixed(2)}</div>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mt-3">{new Date().toLocaleString('default', { month: 'long' })} Total</p>
          </Card>
        </div>

        <Card title="Budget Health">
          <div className="space-y-4 py-2">
            {categories.map(cat => {
              const spent = categoryTotals.find(t => t.name === cat.name)?.value || 0;
              const budget = budgets[cat.name] || 0;
              const percent = Math.min((spent / budget) * 100, 100) || 0;
              const isOver = spent > budget;
              
              return (
                <div key={cat.id} className="space-y-1.5">
                  <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider">
                    <span className="text-slate-500">{cat.icon} {cat.name}</span>
                    <span className={isOver ? 'text-rose-500' : 'text-slate-900'}>${spent.toFixed(0)} / ${budget.toFixed(0)}</span>
                  </div>
                  <div className="h-2 w-full bg-slate-50 rounded-full overflow-hidden">
                    <div 
                      className="h-full transition-all duration-1000 rounded-full"
                      style={{ 
                        width: `${percent}%`, 
                        backgroundColor: isOver ? '#ef4444' : cat.color 
                      }}
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
  const [newSplits, setNewSplits] = useState<TransactionSplit[]>([{ categoryName: categories[0]?.name || '', amount: 0 }]);

  const handleManualAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const totalAmount = newSplits.reduce((sum, s) => sum + s.amount, 0);
    if (totalAmount <= 0) return alert("Please enter an amount!");
    
    onAdd({
      id: crypto.randomUUID(),
      description: newDesc || 'Expense',
      date: new Date(newDate).toISOString(),
      userId: newUser,
      splits: newSplits.filter(s => s.amount > 0),
      totalAmount
    });
    setIsModalOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setNewDesc('');
    setNewSplits([{ categoryName: categories[0]?.name || '', amount: 0 }]);
    setNewDate(new Date().toISOString().split('T')[0]);
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
      }
      setIsScanning(false);
    };
    reader.readAsDataURL(file);
  };

  const sortedTransactions = useMemo(() => 
    [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  , [transactions]);

  return (
    <div className="space-y-8 animate-in">
      <header className="flex justify-between items-center pt-4">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">Timeline</h1>
          <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">Spending History</p>
        </div>
        <div className="flex gap-3">
          <label className="cursor-pointer bg-white border border-slate-200 w-14 h-14 rounded-[22px] text-slate-600 hover:bg-slate-50 transition-all flex items-center justify-center shadow-sm active:scale-90">
            <svg className={`w-6 h-6 ${isScanning ? 'animate-bounce text-indigo-500' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
          </label>
          <button onClick={() => setIsModalOpen(true)} className="bg-slate-900 text-white px-8 rounded-[22px] font-black uppercase text-[10px] tracking-widest shadow-xl hover:bg-indigo-600 transition-all active:scale-95">
            Log New
          </button>
        </div>
      </header>

      <div className="space-y-4">
        {sortedTransactions.length === 0 ? (
          <div className="py-20 text-center text-slate-300">
             <div className="text-6xl mb-4 opacity-20">📜</div>
             <p className="text-[10px] font-black uppercase tracking-[0.2em]">No entries yet</p>
          </div>
        ) : sortedTransactions.map((t) => (
          <div key={t.id} className="bg-white p-5 rounded-[32px] border border-slate-100 flex items-center justify-between group animate-in">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-xl grayscale group-hover:grayscale-0 transition-all">
                {categories.find(c => c.name === t.splits[0]?.categoryName)?.icon || '💸'}
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">{t.description}</h4>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] font-black text-slate-400 uppercase">{new Date(t.date).toLocaleDateString('en-US', {month:'short', day:'numeric'})}</span>
                  <span className="w-1 h-1 rounded-full bg-slate-200" />
                  <span className={`text-[10px] font-black uppercase ${t.userId === UserRole.PARTNER_1 ? 'text-indigo-500' : 'text-pink-500'}`}>{partnerNames[t.userId]}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-lg font-black text-slate-900">${t.totalAmount.toFixed(2)}</span>
              <button onClick={() => onDelete(t.id)} className="text-slate-200 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100 p-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); resetForm(); }} title="Track Expense">
        <form className="space-y-6" onSubmit={handleManualAdd}>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-4">Merchant</label>
              <input required value={newDesc} onChange={e => setNewDesc(e.target.value)} className="w-full px-6 py-4 rounded-[20px] bg-slate-50 border-none outline-none font-bold text-slate-800 placeholder-slate-300 focus:ring-2 ring-indigo-100 transition-all" placeholder="e.g. Starbucks" />
            </div>
            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-4">Date</label>
                  <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} required className="w-full px-6 py-4 rounded-[20px] bg-slate-50 border-none outline-none font-bold text-sm" />
               </div>
               <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-4">Who Paid?</label>
                  <select value={newUser} onChange={e => setNewUser(e.target.value as UserRole)} className="w-full px-6 py-4 rounded-[20px] bg-slate-50 border-none outline-none font-bold text-sm appearance-none">
                    <option value={UserRole.PARTNER_1}>{partnerNames[UserRole.PARTNER_1]}</option>
                    <option value={UserRole.PARTNER_2}>{partnerNames[UserRole.PARTNER_2]}</option>
                  </select>
               </div>
            </div>
          </div>

          <div className="space-y-3">
             <label className="text-[10px] font-black text-slate-400 uppercase ml-4">Category & Amount</label>
             {newSplits.map((split, index) => (
                <div key={index} className="flex gap-2 items-center">
                   <select value={split.categoryName} onChange={e => {
                     const updated = [...newSplits];
                     updated[index].categoryName = e.target.value;
                     setNewSplits(updated);
                   }} className="flex-1 px-5 py-4 rounded-[20px] bg-slate-50 border-none outline-none font-bold text-xs appearance-none">
                     {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                   </select>
                   <div className="relative">
                     <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">$</span>
                     <input type="number" step="0.01" value={split.amount || ''} onChange={e => {
                       const updated = [...newSplits];
                       updated[index].amount = parseFloat(e.target.value) || 0;
                       setNewSplits(updated);
                     }} required className="w-24 pl-8 pr-4 py-4 rounded-[20px] bg-slate-50 border-none outline-none font-black text-slate-900 text-sm" placeholder="0.00" />
                   </div>
                </div>
             ))}
          </div>

          <button type="submit" className="w-full bg-slate-900 text-white py-5 rounded-[24px] font-black uppercase tracking-widest mt-6 shadow-2xl hover:bg-indigo-600 transition-all active:scale-95">Save Transaction</button>
        </form>
      </Modal>
    </div>
  );
};

const Navigation: React.FC = () => {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;
  const navItems = [
    { path: '/', label: 'DASH', icon: '🏠' },
    { path: '/transactions', label: 'LOG', icon: '📜' },
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
  const [error, setError] = useState<string | null>(null);

  const getAdvice = async () => {
    if (transactions.length === 0) {
      setError("Add some data first!");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await analyzeSpending(transactions, budgets, categories);
      setAdvice(result);
    } catch (err) {
      setError("AI service unavailable. Check your API key.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in pt-4">
      <header className="text-center">
        <h1 className="text-4xl font-black text-slate-900 tracking-tight">AI Coach</h1>
        <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">Smarter choices together</p>
      </header>
      <div className="bg-slate-900 rounded-[48px] p-12 text-white shadow-2xl text-center relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/30 rounded-full blur-3xl -mr-32 -mt-32" />
        <div className="w-24 h-24 bg-white/10 backdrop-blur-md rounded-3xl flex items-center justify-center text-4xl mx-auto mb-8 border border-white/10 group-hover:scale-110 transition-transform duration-500">✨</div>
        <h2 className="text-3xl font-black mb-6 tracking-tight leading-tight">Ready for analysis?</h2>
        <button onClick={getAdvice} disabled={isLoading} className="bg-white text-slate-900 px-12 py-5 rounded-[24px] font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 disabled:opacity-50 shadow-xl transition-all active:scale-95">
          {isLoading ? 'Thinking...' : 'Ask Gemini'}
        </button>
        {error && <p className="mt-6 text-rose-400 text-[10px] font-black uppercase tracking-widest">{error}</p>}
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
  const [lastSync, setLastSync] = useState<string | undefined>(() => localStorage.getItem('duospend_last_sync') || undefined);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => localStorage.setItem('duospend_tx', JSON.stringify(transactions)), [transactions]);
  useEffect(() => localStorage.setItem('duospend_budgets', JSON.stringify(budgets)), [budgets]);
  useEffect(() => localStorage.setItem('duospend_partners', JSON.stringify(partnerNames)), [partnerNames]);
  useEffect(() => { if (syncUrl) localStorage.setItem('duospend_sync_url', syncUrl) }, [syncUrl]);
  useEffect(() => { if (lastSync) localStorage.setItem('duospend_last_sync', lastSync) }, [lastSync]);

  const addTransaction = (t: Transaction) => setTransactions(p => [...p, t]);
  const deleteTransaction = (id: string) => {
    if (confirm("Delete this entry?")) {
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
      setLastSync(new Date().toISOString());
    } catch (e) {
      alert("Sync failed. Check your Script URL.");
    } finally {
      setIsSyncing(false);
    }
  };

  const copyScript = () => {
    navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT);
    alert("Script copied! Paste this into Google Apps Script.");
  };

  const resetData = () => {
    if (confirm("This will erase all local transactions and budgets. Are you sure?")) {
      setTransactions([]);
      setBudgets({ 'Food & Dining': 600, 'Rent & Utilities': 1500, 'Entertainment': 200, 'Shopping': 300, 'Transport': 150 });
      localStorage.removeItem('duospend_tx');
      localStorage.removeItem('duospend_budgets');
      alert("Data reset.");
    }
  };

  return (
    <HashRouter>
      <div className="min-h-screen pb-40">
        <div className="max-w-4xl mx-auto px-6 pt-10">
          <Routes>
            <Route path="/" element={<Dashboard transactions={transactions} budgets={budgets} categories={categories} partnerNames={partnerNames} onSync={performSync} isSyncing={isSyncing} lastSync={lastSync} />} />
            <Route path="/transactions" element={<TransactionList transactions={transactions} categories={categories} partnerNames={partnerNames} onAdd={addTransaction} onDelete={deleteTransaction} />} />
            <Route path="/ai" element={<AIAdvisor transactions={transactions} budgets={budgets} categories={categories} />} />
            <Route path="/settings" element={
              <div className="space-y-10 animate-in pt-4">
                <header>
                  <h1 className="text-4xl font-black text-slate-900 tracking-tight">Setup</h1>
                  <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">Configure your experience</p>
                </header>
                
                <section className="space-y-6">
                  <h2 className="text-xl font-black text-slate-900">Partners</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <Card title="Partner 1" accent="bg-indigo-500">
                      <input type="text" value={partnerNames[UserRole.PARTNER_1]} onChange={(e) => setPartnerNames({ ...partnerNames, [UserRole.PARTNER_1]: e.target.value })} className="w-full text-xl font-black text-indigo-600 bg-transparent border-none focus:ring-0 p-0" />
                    </Card>
                    <Card title="Partner 2" accent="bg-pink-500">
                      <input type="text" value={partnerNames[UserRole.PARTNER_2]} onChange={(e) => setPartnerNames({ ...partnerNames, [UserRole.PARTNER_2]: e.target.value })} className="w-full text-xl font-black text-pink-500 bg-transparent border-none focus:ring-0 p-0" />
                    </Card>
                  </div>
                </section>

                <section className="space-y-6">
                  <h2 className="text-xl font-black text-slate-900">Monthly Targets</h2>
                  <div className="space-y-3">
                    {categories.map(cat => (
                      <div key={cat.id} className="bg-white p-4 rounded-[24px] border border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{cat.icon}</span>
                          <span className="text-[10px] font-black uppercase text-slate-400">{cat.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 font-bold">$</span>
                          <input 
                            type="number" 
                            value={budgets[cat.name] || 0} 
                            onChange={(e) => setBudgets({ ...budgets, [cat.name]: parseFloat(e.target.value) || 0 })}
                            className="w-20 bg-slate-50 px-3 py-2 rounded-xl text-right font-black text-slate-900 border-none outline-none focus:ring-2 ring-indigo-50"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="space-y-6">
                  <h2 className="text-xl font-black text-slate-900">Cloud Backup</h2>
                  <div className="space-y-4">
                    <Card title="Google Script URL">
                      <input type="url" value={syncUrl || ''} onChange={(e) => setSyncUrl(e.target.value)} placeholder="https://script.google.com/..." className="w-full px-6 py-4 rounded-[20px] bg-slate-50 border-none outline-none font-bold text-slate-800 placeholder-slate-300 text-sm" />
                    </Card>
                    
                    <div className="bg-indigo-50 rounded-[32px] p-8 border border-indigo-100">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-indigo-900 font-black text-sm">Sync Code Helper</h3>
                          <p className="text-indigo-600/60 text-[10px] font-bold uppercase tracking-wider mt-1">Copy this into your Google Apps Script</p>
                        </div>
                        <button onClick={copyScript} className="bg-white text-indigo-600 px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest border border-indigo-100 shadow-sm hover:bg-indigo-100 transition-colors">Copy Script</button>
                      </div>
                      <pre className="bg-slate-900 text-indigo-200 p-4 rounded-2xl text-[8px] overflow-x-auto no-scrollbar font-mono leading-relaxed">
                        {GOOGLE_APPS_SCRIPT}
                      </pre>
                    </div>
                  </div>
                </section>

                <section className="pt-10 border-t border-slate-100">
                  <button onClick={resetData} className="text-rose-400 text-[10px] font-black uppercase tracking-widest hover:text-rose-600 transition-colors">
                    Reset Local App Data
                  </button>
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