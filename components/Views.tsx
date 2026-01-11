import React, { useState, useMemo, memo, useEffect } from 'react';
import { Transaction, CategoryDefinition, UserRole, PartnerNames, Goal, TransactionSplit } from '../types';
import { analyzeSpending } from '../services/geminiService';
import { Card, ProgressBar } from './UI';
import { GOOGLE_APPS_SCRIPT_CODE, performSync } from '../utils/sync';

const generateId = () => Math.random().toString(36).substring(2, 15);

export const Dashboard = memo(({ 
  transactions, budgets, categories, partnerNames, goals, isSynced, lastSync 
}: any) => {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const data = useMemo(() => {
    const totals: Record<string, number> = {};
    categories.forEach((c: any) => totals[c.name] = 0);
    let totalCombined = 0, p1 = 0, p2 = 0;

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

  const diff = data.p1 - data.p2;
  const settlementMsg = diff === 0 ? "Balanced ✨" : `${partnerNames[diff > 0 ? UserRole.PARTNER_2 : UserRole.PARTNER_1]} owes $${(Math.abs(diff)/2).toFixed(2)}`;

  return (
    <div className="space-y-8 animate-in pb-10">
      <header className="pt-4 flex justify-between items-start">
        <div>
          <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1">DuoSpend Live v1.6</p>
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
          <Card title="Shared Equity" accent="bg-indigo-500">
            <span className="text-2xl font-black text-slate-900 tracking-tight leading-tight">{settlementMsg}</span>
          </Card>
          <Card title="Monthly Combined" accent="bg-slate-900" className="bg-slate-900 text-white border-none shadow-xl">
            <div className="text-5xl font-black tracking-tighter">${data.totalCombined.toFixed(2)}</div>
          </Card>
        </div>
        <Card title="Budget Health">
          <div className="space-y-5 py-2 max-h-[400px] overflow-y-auto no-scrollbar">
            {categories.map((cat: any) => {
              const spent = data.totals[cat.name] || 0;
              const budget = budgets[cat.name] || 0;
              return (
                <div key={cat.id} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-black uppercase text-slate-500">{cat.icon} {cat.name}</span>
                    <span className="text-[10px] font-black">${spent.toFixed(0)} / ${budget.toFixed(0)}</span>
                  </div>
                  <ProgressBar progress={(spent / (budget || 1)) * 100} color={spent > budget ? '#f43f5e' : cat.color} />
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
});

export const TransactionList = memo(({ transactions, categories, partnerNames, onAdd, onDelete, isAIEnabled }: any) => {
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
    setNewDesc('');
    setNewSplits([{ categoryName: categories[0]?.name || '', amount: 0 }]);
  };

  const groups = useMemo(() => {
    const sorted = [...transactions].sort((a,b) => b.date.localeCompare(a.date)).slice(0, 30);
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
      <header className="flex justify-between items-center pt-4">
        <h1 className="text-4xl font-black text-slate-900 tracking-tight">Timeline</h1>
        <button onClick={() => setIsModalOpen(true)} className="bg-slate-900 text-white px-6 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95 transition-all">
          Log Entry
        </button>
      </header>
      
      <div className="space-y-10">
        {groups.map(([date, txs]) => (
          <div key={date} className="space-y-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">{date}</h3>
            {txs.map((t: any) => (
              <div key={t.id} className="bg-white p-5 rounded-[24px] border border-slate-50 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-lg">
                    {categories.find((c: any) => c.name === t.splits[0]?.categoryName)?.icon || '💰'}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">{t.description}</h4>
                    <p className="text-[10px] font-black text-slate-400 uppercase">
                      {partnerNames[t.userId]} • {t.splits.length} {t.splits.length === 1 ? 'category' : 'categories'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-lg font-black text-slate-900">${t.totalAmount.toFixed(2)}</span>
                  <button onClick={() => onDelete(t.id)} className="text-slate-100 hover:text-rose-400 p-1">×</button>
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
              <button onClick={() => setIsModalOpen(false)} className="text-slate-300 hover:text-slate-500 font-bold">Close</button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <input required value={newDesc} onChange={e => setNewDesc(e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 font-bold outline-none" placeholder="Store Name" />
              <div className="grid grid-cols-2 gap-3">
                <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} required className="w-full px-6 py-4 rounded-2xl bg-slate-50 font-bold outline-none" />
                <select value={newUser} onChange={e => setNewUser(e.target.value as UserRole)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 font-bold outline-none">
                  <option value={UserRole.PARTNER_1}>{partnerNames[UserRole.PARTNER_1]}</option>
                  <option value={UserRole.PARTNER_2}>{partnerNames[UserRole.PARTNER_2]}</option>
                </select>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center px-1">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Splits / Categories</h3>
                  <button type="button" onClick={() => setNewSplits([...newSplits, { categoryName: categories[0].name, amount: 0 }])} className="text-[10px] font-black text-indigo-500 uppercase">+ Add Category Split</button>
                </div>
                {newSplits.map((split, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <select value={split.categoryName} onChange={e => {
                      const updated = [...newSplits];
                      updated[index].categoryName = e.target.value;
                      setNewSplits(updated);
                    }} className="flex-1 px-4 py-4 rounded-2xl bg-slate-50 font-bold outline-none text-sm">
                      {categories.map((c: any) => <option key={c.id} value={c.name}>{c.icon} {c.name}</option>)}
                    </select>
                    <input type="number" step="0.01" required value={split.amount || ''} onChange={e => {
                      const updated = [...newSplits];
                      updated[index].amount = Number(e.target.value);
                      setNewSplits(updated);
                    }} className="w-24 px-4 py-4 rounded-2xl bg-slate-50 font-black text-right outline-none" placeholder="0.00" />
                    {newSplits.length > 1 && (
                      <button type="button" onClick={() => setNewSplits(newSplits.filter((_, i) => i !== index))} className="text-slate-200 hover:text-rose-400 p-1 text-xl">×</button>
                    )}
                  </div>
                ))}
              </div>

              <div className="bg-slate-900 rounded-[32px] p-6 text-white flex justify-between items-center">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50">Combined Total</span>
                <span className="text-3xl font-black">${totalAmount.toFixed(2)}</span>
              </div>

              <button type="submit" className="w-full bg-slate-900 text-white py-5 rounded-[24px] font-black uppercase text-[12px] tracking-widest shadow-xl active:scale-95 transition-all">
                Save Transaction
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
});

export const AIAdvisor = memo(({ transactions, budgets, categories, isEnabled }: any) => {
  const [advice, setAdvice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <div className="space-y-8 animate-in pb-10">
      <header><h1 className="text-4xl font-black text-slate-900 tracking-tight text-center">DuoCoach</h1></header>
      <div className="bg-slate-900 rounded-[40px] p-10 text-white shadow-2xl text-center">
        <h2 className="text-2xl font-black mb-6">Ask DuoCoach</h2>
        <button onClick={async () => { setLoading(true); setAdvice(await analyzeSpending(transactions, budgets, categories)); setLoading(false); }} disabled={loading || !isEnabled} className="bg-white text-slate-900 px-10 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest">{loading ? 'Thinking...' : 'Analyze My Spending'}</button>
      </div>
      {advice && <div className="bg-white rounded-[40px] p-8 border border-slate-100 shadow-xl animate-in text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{advice}</div>}
    </div>
  );
});

export const SettingsView = memo(({ partnerNames, syncUrl, setSyncUrl, lastSync, setLastSync, transactions, setTransactions }: any) => {
  const [isSyncing, setIsSyncing] = useState(false);
  return (
    <div className="space-y-10 animate-in pt-10 pb-10">
      <header><h1 className="text-4xl font-black text-slate-900 tracking-tight">Setup</h1></header>
      <section className="space-y-4">
        <h2 className="text-xl font-black tracking-tight text-slate-400 uppercase text-[10px] tracking-[0.2em]">Profiles</h2>
        <div className="grid grid-cols-2 gap-4">
          <Card title="TRACY" accent="bg-indigo-500"><div className="w-full text-lg font-black text-slate-900">Tracy</div></Card>
          <Card title="TRISH" accent="bg-rose-500"><div className="w-full text-lg font-black text-slate-900">Trish</div></Card>
        </div>
      </section>
      <section className="space-y-4">
        <h2 className="text-xl font-black tracking-tight text-slate-400 uppercase text-[10px] tracking-[0.2em]">Data Sync</h2>
        <Card title="Google Sheets">
          <input value={syncUrl} onChange={e => setSyncUrl(e.target.value)} className="w-full px-4 py-4 rounded-xl bg-slate-50 mb-4 outline-none font-bold text-sm" placeholder="Paste Apps Script URL here..." />
          <button onClick={async () => { 
            if (!syncUrl) return alert("Please enter a Sync URL first.");
            setIsSyncing(true); 
            try {
              const d = await performSync(syncUrl, transactions); 
              setTransactions(d.transactions); 
              setLastSync(new Date().toLocaleTimeString()); 
            } catch (err) {
              alert("Sync failed. Ensure your Apps Script is deployed as 'Anyone'.");
            }
            setIsSyncing(false); 
          }} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all">{isSyncing ? 'Syncing...' : 'Sync Now'}</button>
        </Card>
      </section>
      <section className="pt-10 border-t border-slate-100">
        <button onClick={() => { if(confirm("This will delete everything stored on this device. Are you sure?")) { localStorage.clear(); window.location.reload(); } }} className="w-full text-[10px] font-black text-slate-300 uppercase tracking-[0.3em] hover:text-rose-400 transition-colors py-4">
          Dangerous: Reset All Local Storage
        </button>
      </section>
    </div>
  );
});