import React, { useState, useMemo, memo, useEffect, useRef } from 'react';
import { Transaction, CategoryDefinition, UserRole, PartnerNames, Goal, TransactionSplit } from '../types';
import { analyzeSpending, detectSubscriptions } from '../services/geminiService';
import { Card, ProgressBar } from './UI';
import { GOOGLE_APPS_SCRIPT_CODE, performSync } from '../utils/sync';

const generateId = () => Math.random().toString(36).substring(2, 15);

interface DashboardProps {
  transactions: Transaction[];
  budgets: Record<string, number>;
  categories: CategoryDefinition[];
  partnerNames: PartnerNames;
  goals: Goal[];
  isSynced: boolean;
  lastSync: string;
  syncUrl: string;
  setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
  setBudgets: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setLastSync: (time: string) => void;
}

export const Dashboard = memo(({ 
  transactions, budgets, categories, partnerNames, goals, isSynced, lastSync, syncUrl, setTransactions, setBudgets, setLastSync
}: DashboardProps) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const now = new Date();
  const currentMonth = now.getUTCMonth(); 
  const currentYear = now.getUTCFullYear();

  const handleSync = async () => {
    if (!syncUrl || !syncUrl.includes('exec')) {
      alert("Please set a valid Sync URL in Setup first!");
      return;
    }
    setIsSyncing(true);
    try {
      const d = await performSync(syncUrl, transactions, budgets);
      if (d.transactions) {
        setTransactions(d.transactions);
        if (d.budgets) setBudgets(d.budgets);
        setLastSync(new Date().toLocaleTimeString());
      }
    } catch (err) {
      alert("Cloud Sync failed. Your local data is safe.");
    } finally {
      setIsSyncing(false);
    }
  };

  const data = useMemo(() => {
    const totals: Record<string, number> = {};
    categories.forEach((c: CategoryDefinition) => totals[c.name] = 0);
    let totalCombined = 0;
    let tracyPaidThisMonth = 0;

    for (const t of transactions) {
      const d = new Date(t.date);
      if (d.getUTCMonth() === currentMonth && d.getUTCFullYear() === currentYear) {
        totalCombined += t.totalAmount;
        if (t.userId === UserRole.PARTNER_1) tracyPaidThisMonth += t.totalAmount;
        for (const split of t.splits) {
          if (totals[split.categoryName] !== undefined) totals[split.categoryName] += split.amount;
        }
      }
    }

    const totalBudget: number = Object.values(budgets).reduce((acc: number, val: number) => acc + (val || 0), 0);
    const tracyOwesThisMonth: number = (totalCombined - tracyPaidThisMonth) * 0.45;
    const remainingBudget: number = Math.max(0, totalBudget - totalCombined);
    
    return { totals, totalCombined, totalBudget, tracyPaidThisMonth, tracyOwesThisMonth, remainingBudget };
  }, [transactions, categories, budgets, currentMonth, currentYear]);

  return (
    <div className="space-y-8 animate-in pb-10">
      <header className="pt-4 flex justify-between items-start">
        <div>
          <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1">DuoSpend Live v4.5</p>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">Overview.</h1>
        </div>
        <div className="text-right">
          <div className={`p-2 rounded-full mb-1 inline-block ${isSynced ? 'bg-emerald-50 text-emerald-500' : 'bg-slate-100 text-slate-300'}`}>
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M5.5 16a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 1113.5 16h-8z" /></svg>
          </div>
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">{lastSync}</p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card title="Shared Equity Status" accent="bg-indigo-500">
            <div className="space-y-3">
              <div className="space-y-1">
                <span className="text-2xl font-black text-slate-900 tracking-tight leading-tight">
                  Tracy owes ${data.tracyOwesThisMonth.toFixed(2)}
                </span>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Monthly Settlement</p>
              </div>
              <div className="pt-3 border-t border-slate-50 space-y-1">
                <div className="flex justify-between text-[9px] font-black uppercase text-slate-400">
                  <span>Tracy Paid:</span>
                  <span>${data.tracyPaidThisMonth.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </Card>

          <button 
            onClick={handleSync}
            disabled={isSyncing}
            className={`w-full bg-slate-900 rounded-[32px] p-8 text-left text-white shadow-xl transition-all active:scale-95 flex flex-col justify-between group overflow-hidden relative ${isSyncing ? 'opacity-80' : ''}`}
          >
             {isSyncing && <div className="absolute top-0 left-0 h-1 bg-indigo-500 animate-pulse w-full" />}
             <div>
               <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Cloud Synchronization</h3>
               <p className="text-xl font-black tracking-tight mb-2">
                 {isSyncing ? 'Synchronizing...' : 'Sync with Sheet'}
               </p>
               <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest leading-relaxed">
                 {isSynced ? `Last update: ${lastSync}` : 'Cloud mirror offline'}
               </p>
             </div>
             <div className="mt-6 self-end">
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors">
                  <svg className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357-2H15" />
                  </svg>
                </div>
             </div>
          </button>
        </div>

        <Card title="Budget Health">
          <div className="space-y-5 py-2">
            <div className="mb-6 p-5 bg-slate-50 rounded-[24px] border border-slate-100">
              <div className="flex justify-between items-end mb-3">
                <div>
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Spent / Budget</p>
                  <p className="text-2xl font-black text-slate-900">
                    ${data.totalCombined.toFixed(0)} <span className="text-slate-300 font-normal text-lg">/ ${data.totalBudget.toFixed(0)}</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest mb-1">Rem.</p>
                  <p className="text-sm font-black text-emerald-600">${data.remainingBudget.toFixed(0)}</p>
                </div>
              </div>
              <ProgressBar progress={(data.totalCombined / (data.totalBudget || 1)) * 100} color={data.totalCombined > data.totalBudget ? '#f43f5e' : '#6366f1'} />
            </div>
            
            <div className="max-h-[300px] overflow-y-auto no-scrollbar space-y-5 pr-1">
              {categories.map((cat: CategoryDefinition) => {
                const spent = data.totals[cat.name] || 0;
                const budget = budgets[cat.name] || 0;
                return (
                  <div key={cat.id} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-black uppercase text-slate-500">{cat.icon} {cat.name}</span>
                      <span className="text-[10px] font-black text-slate-900">${spent.toFixed(0)} <span className="text-slate-300 font-normal">/ ${budget.toFixed(0)}</span></span>
                    </div>
                    <ProgressBar progress={(spent / (budget || 1)) * 100} color={spent > budget ? '#f43f5e' : cat.color} />
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
});

export const TransactionList = memo(({ transactions, categories, partnerNames, onAdd, onDelete, isAIEnabled }: { transactions: Transaction[], categories: CategoryDefinition[], partnerNames: PartnerNames, onAdd: (t: Transaction) => void, onDelete: (id: string) => void, isAIEnabled: boolean }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newDesc, setNewDesc] = useState('');
  const [newUser, setNewUser] = useState(UserRole.PARTNER_1);
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [newSplits, setNewSplits] = useState<TransactionSplit[]>([{ categoryName: categories[0]?.name || '', amount: 0 }]);
  
  const totalAmount = useMemo(() => newSplits.reduce((acc, s) => acc + (Number(s.amount) || 0), 0), [newSplits]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (totalAmount <= 0) return alert("Total must be greater than 0");
    onAdd({
      id: generateId(),
      description: newDesc || 'Expense',
      date: new Date(newDate).toISOString(),
      userId: newUser,
      splits: newSplits.map(s => ({ ...s, amount: Number(s.amount) })),
      totalAmount: totalAmount
    });
    setIsModalOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setNewDesc('');
    setNewSplits([{ categoryName: categories[0]?.name || '', amount: 0 }]);
    setNewDate(new Date().toISOString().split('T')[0]);
  };

  const groups = useMemo(() => {
    const sorted = [...transactions].sort((a,b) => b.date.localeCompare(a.date)).slice(0, 50);
    const g: Record<string, Transaction[]> = {};
    sorted.forEach(t => {
      const d = new Date(t.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
      if (!g[d]) g[d] = [];
      g[d].push(t);
    });
    return Object.entries(g);
  }, [transactions]);

  return (
    <div className="space-y-8 animate-in pb-10">
      <header className="flex flex-col gap-4 pt-4">
        <h1 className="text-4xl font-black text-slate-900 tracking-tight">Timeline</h1>
        <button 
          onClick={() => setIsModalOpen(true)} 
          className="w-full bg-slate-900 text-white px-6 py-6 rounded-3xl font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3"
        >
          <span className="text-xl">+</span> Add New Expense
        </button>
      </header>
      
      <div className="space-y-10">
        {groups.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-[40px] border border-dashed border-slate-200">
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No entries found</p>
          </div>
        ) : groups.map(([date, txs]) => (
          <div key={date} className="space-y-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">{date}</h3>
            {txs.map((t: Transaction) => (
              <div key={t.id} className="bg-white p-5 rounded-[24px] border border-slate-50 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-lg">{categories.find((c: CategoryDefinition) => c.name === t.splits[0]?.categoryName)?.icon || '💰'}</div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">{t.description}</h4>
                    <p className="text-[10px] font-black text-slate-400 uppercase">{partnerNames[t.userId]}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-lg font-black text-slate-900">${t.totalAmount.toFixed(2)}</span>
                  <button onClick={() => onDelete(t.id)} className="text-slate-100 hover:text-rose-400 p-1 font-bold text-xl">×</button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-[2px] p-4">
          <div className="bg-white rounded-[40px] w-full max-w-md p-8 shadow-2xl animate-in max-h-[90vh] overflow-y-auto no-scrollbar">
            <div className="flex justify-between items-start mb-6">
              <h2 className="text-2xl font-black tracking-tight">New Log</h2>
              <button onClick={() => { setIsModalOpen(false); resetForm(); }} className="text-slate-300 hover:text-slate-500 font-bold text-lg">×</button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-6">
              <input required value={newDesc} onChange={e => setNewDesc(e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 font-bold outline-none" placeholder="Description / Merchant" />
              <div className="grid grid-cols-2 gap-3">
                <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} required className="w-full px-6 py-4 rounded-2xl bg-slate-50 font-bold outline-none" />
                <select value={newUser} onChange={e => setNewUser(e.target.value as UserRole)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 font-bold outline-none">
                  <option value={UserRole.PARTNER_1}>{partnerNames[UserRole.PARTNER_1]}</option>
                  <option value={UserRole.PARTNER_2}>{partnerNames[UserRole.PARTNER_2]}</option>
                </select>
              </div>
              <div className="space-y-3">
                {newSplits.map((split, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <select value={split.categoryName} onChange={e => {
                      const updated = [...newSplits];
                      updated[index].categoryName = e.target.value;
                      setNewSplits(updated);
                    }} className="flex-1 px-4 py-4 rounded-2xl bg-slate-50 font-bold outline-none text-sm">
                      {categories.map((c: CategoryDefinition) => <option key={c.id} value={c.name}>{c.icon} {c.name}</option>)}
                    </select>
                    <input type="number" step="0.01" required value={split.amount || ''} onChange={e => {
                      const updated = [...newSplits];
                      updated[index].amount = Number(e.target.value);
                      setNewSplits(updated);
                    }} className="w-24 px-4 py-4 rounded-2xl bg-slate-50 font-black text-right outline-none" placeholder="0.00" />
                  </div>
                ))}
              </div>
              <div className="bg-slate-900 rounded-[32px] p-6 text-white flex justify-between items-center">
                <span className="text-[10px] font-black uppercase opacity-50">Total</span>
                <span className="text-3xl font-black">${totalAmount.toFixed(2)}</span>
              </div>
              <button type="submit" className="w-full bg-indigo-600 text-white py-5 rounded-[24px] font-black uppercase text-[12px] tracking-widest shadow-xl active:scale-[0.98] transition-all">Save Transaction</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
});

export const AIAdvisor = memo(({ transactions, budgets, categories, isEnabled }: { transactions: Transaction[], budgets: Record<string, number>, categories: CategoryDefinition[], isEnabled: boolean }) => {
  const [advice, setAdvice] = useState<string | null>(null);
  const [subs, setSubs] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingSubs, setLoadingSubs] = useState(false);

  const handleRunAudit = async () => {
    setLoadingSubs(true);
    const result = await detectSubscriptions(transactions);
    setSubs(result ?? "No subscriptions found.");
    setLoadingSubs(false);
  };

  const handleRunAdvice = async () => {
    setLoading(true);
    const result = await analyzeSpending(transactions, budgets, categories);
    setAdvice(result);
    setLoading(false);
  };

  return (
    <div className="space-y-8 animate-in pb-10">
      <header><h1 className="text-4xl font-black text-slate-900 tracking-tight text-center">DuoCoach</h1></header>
      
      <div className="grid grid-cols-1 gap-6">
        <div className="bg-slate-900 rounded-[40px] p-10 text-white shadow-2xl text-center space-y-6">
          <h2 className="text-2xl font-black">Monthly Insight</h2>
          <button 
            onClick={handleRunAdvice} 
            disabled={loading || !isEnabled} 
            className="bg-white text-slate-900 px-10 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest w-full"
          >
            {loading ? 'Thinking...' : 'Analyze My Spending'}
          </button>
          {advice && <div className="bg-white/10 rounded-3xl p-6 text-left text-sm text-white/90 whitespace-pre-wrap leading-relaxed border border-white/5">{advice}</div>}
        </div>

        <div className="bg-white rounded-[40px] p-10 border border-slate-100 shadow-xl space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">👻</span>
              <h2 className="text-xl font-black text-slate-900">Ghost Detector</h2>
            </div>
            <span className="bg-indigo-500 text-white text-[8px] font-black px-2 py-1 rounded-full uppercase tracking-tighter">History Audit</span>
          </div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">Gemini will audit your history to find hidden recurring subscriptions.</p>
          <button 
            onClick={handleRunAudit} 
            disabled={loadingSubs || !isEnabled} 
            className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest w-full"
          >
            {loadingSubs ? 'Scanning History...' : 'Run Subscription Audit'}
          </button>
          {subs && <div className="bg-slate-50 rounded-3xl p-6 text-left text-sm text-slate-600 whitespace-pre-wrap leading-relaxed border border-slate-100 prose prose-sm">{subs}</div>}
        </div>
      </div>
    </div>
  );
});

export const SettingsView = memo(({ 
  partnerNames, budgets, setBudgets, categories, syncUrl, setSyncUrl, lastSync, setLastSync, transactions, setTransactions 
}: { partnerNames: PartnerNames, budgets: Record<string, number>, setBudgets: React.Dispatch<React.SetStateAction<Record<string, number>>>, categories: CategoryDefinition[], syncUrl: string, setSyncUrl: (url: string) => void, lastSync: string, setLastSync: (time: string) => void, transactions: Transaction[], setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>> }) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleBudgetChange = (catName: string, amount: number) => {
    setBudgets((prev: Record<string, number>) => ({ ...prev, [catName]: amount }));
  };

  const handleClearTransactions = () => {
    if (confirm("Delete all local transactions?")) {
      setTransactions([]);
    }
  };

  const handleForceRefresh = async () => {
    if (confirm("This will force the app to refresh and pull the latest code. Your data is safe in the cloud. Continue?")) {
      // 1. Unregister all service workers
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      }
      // 2. Clear all browser caches
      if (window.caches) {
        const cacheNames = await caches.keys();
        for (const name of cacheNames) {
          await caches.delete(name);
        }
      }
      // 3. Clear storage but keep the important stuff (transactions/sync URL)
      localStorage.removeItem('ds_app_version');
      sessionStorage.clear();
      
      // 4. Force hard reload with cache buster
      window.location.replace(window.location.href.split('?')[0] + '?r=' + Date.now());
    }
  };

  return (
    <div className="space-y-10 animate-in pt-10 pb-10">
      <header><h1 className="text-4xl font-black text-slate-900 tracking-tight">Setup</h1></header>
      
      <section className="space-y-4">
        <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Profiles</h2>
        <div className="grid grid-cols-2 gap-4">
          <Card title="TRACY" accent="bg-indigo-500"><div className="w-full text-lg font-black text-slate-900 tracking-tight">Tracy</div></Card>
          <Card title="TRISH" accent="bg-rose-500"><div className="w-full text-lg font-black text-slate-900 tracking-tight">Trish</div></Card>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Monthly Budgets</h2>
        <Card title="Adjust Limits">
          <div className="space-y-4 max-h-[300px] overflow-y-auto no-scrollbar py-2">
            {categories.map((cat: CategoryDefinition) => (
              <div key={cat.id} className="flex items-center gap-3">
                <span className="w-8 text-center">{cat.icon}</span>
                <span className="flex-1 text-[10px] font-black uppercase text-slate-500 tracking-tight">{cat.name}</span>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 font-bold">$</span>
                  <input type="number" value={budgets[cat.name] || 0} onChange={e => handleBudgetChange(cat.name, Number(e.target.value))} className="w-24 pl-6 pr-3 py-2 bg-slate-50 rounded-xl font-black text-right outline-none text-sm" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Cloud Connection</h2>
        <Card title="Script Engine v4.5">
          <button onClick={handleCopy} className={`w-full py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all ${copied ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-900'}`}>{copied ? '✅ Code Copied!' : '📋 Copy Script Code'}</button>
          <div className="space-y-2 mt-6">
            <input value={syncUrl} onChange={e => setSyncUrl(e.target.value)} className={`w-full px-4 py-4 rounded-xl outline-none font-bold text-sm ${syncUrl.includes('exec') ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`} placeholder="Paste the NEW Web App URL here..." />
          </div>
          <button onClick={async () => { 
            if (!syncUrl || !syncUrl.includes('exec')) return alert("Enter valid URL.");
            setIsSyncing(true); 
            try {
              const d = await performSync(syncUrl, transactions, budgets); 
              if (d.transactions) {
                setTransactions(d.transactions); 
                if (d.budgets) setBudgets(d.budgets); 
                setLastSync(new Date().toLocaleTimeString());
                alert("Cloud Sync Successful!");
              }
            } catch (err) { alert("Sync failed."); }
            setIsSyncing(false); 
          }} className="w-full mt-4 bg-slate-900 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest">
            {isSyncing ? 'Syncing...' : 'Sync All Data Now'}
          </button>
        </Card>
      </section>

      <section className="space-y-6 pt-4 text-center">
        <button onClick={handleForceRefresh} className="w-full bg-slate-50 text-slate-400 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest border border-slate-100">🚀 Force App Update (v4.5)</button>
        <button onClick={handleClearTransactions} className="text-[10px] font-black text-rose-500 uppercase tracking-widest mt-4">🗑️ Wipe Local Data</button>
      </section>
    </div>
  );
});