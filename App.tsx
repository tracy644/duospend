import React, { useState, useEffect, useMemo, memo } from 'react';
import { HashRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Transaction, CategoryDefinition, UserRole, PartnerNames, Goal, Category } from './types';
import { CATEGORY_COLORS, CATEGORY_ICONS } from './constants';
import { Dashboard, TransactionList, AIAdvisor, SettingsView } from './components/Views';

const DEFAULT_CATEGORIES: CategoryDefinition[] = Object.values(Category).map((catName, index) => ({
  id: String(index + 1),
  name: catName,
  color: CATEGORY_COLORS[catName] || '#94a3b8',
  icon: CATEGORY_ICONS[catName] || '💰'
}));

// Strictly Hardcoded Names
const PARTNER_NAMES: PartnerNames = {
  [UserRole.PARTNER_1]: 'Tracy',
  [UserRole.PARTNER_2]: 'Trish',
};

const Navigation = memo(() => {
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
});

const App: React.FC = () => {
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

  useEffect(() => localStorage.setItem('ds_tx', JSON.stringify(transactions)), [transactions]);
  useEffect(() => localStorage.setItem('ds_goals', JSON.stringify(goals)), [goals]);
  useEffect(() => localStorage.setItem('ds_sync_url', syncUrl), [syncUrl]);
  useEffect(() => localStorage.setItem('ds_last_sync', lastSync), [lastSync]);

  const isAIEnabled = useMemo(() => {
    const key = process.env.API_KEY;
    return !!(key && key !== 'undefined' && key.trim().length > 5);
  }, []);

  return (
    <HashRouter>
      <div className="min-h-screen pb-40 px-6">
        <div className="max-w-xl mx-auto">
          <Routes>
            <Route path="/" element={<Dashboard transactions={transactions} budgets={budgets} categories={DEFAULT_CATEGORIES} partnerNames={PARTNER_NAMES} goals={goals} onUpdateGoal={(id: string, amt: number) => setGoals(g => g.map(x => x.id === id ? {...x, current: amt} : x))} isSynced={lastSync !== 'Never'} lastSync={lastSync} />} />
            <Route path="/transactions" element={<TransactionList transactions={transactions} categories={DEFAULT_CATEGORIES} partnerNames={PARTNER_NAMES} onAdd={(t: Transaction) => setTransactions(p => [...p, t])} onDelete={(id: string) => setTransactions(p => p.filter(t => t.id !== id))} isAIEnabled={isAIEnabled} />} />
            <Route path="/ai" element={<div className="pt-10"><AIAdvisor transactions={transactions} budgets={budgets} categories={DEFAULT_CATEGORIES} isEnabled={isAIEnabled} /></div>} />
            <Route path="/settings" element={<SettingsView partnerNames={PARTNER_NAMES} syncUrl={syncUrl} setSyncUrl={setSyncUrl} lastSync={lastSync} setLastSync={setLastSync} transactions={transactions} setTransactions={setTransactions} />} />
          </Routes>
        </div>
        <Navigation />
      </div>
    </HashRouter>
  );
};

export default App;