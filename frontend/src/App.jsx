import React, { useState, useEffect, useCallback } from 'react';
import { api } from './api';
import Setup from './components/Setup';
import Declaration from './components/Declaration';
import Report from './components/Report';
import Daily from './components/Daily';
import Assurance from './components/Assurance';
import { LoadingState } from './components/ui';

const TABS = [
  { id: 'setup', label: 'Setup & Runs', needsRun: false },
  { id: 'declaration', label: 'Model Declaration', needsRun: true },
  { id: 'report', label: '60-Day Report', needsRun: true },
  { id: 'daily', label: 'Daily Reports', needsRun: true },
  { id: 'assurance', label: 'Commercial Assurance', needsRun: true },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('report');
  const [runId, setRunId] = useState(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [dailyDay, setDailyDay] = useState(1);
  const [bootstrapping, setBootstrapping] = useState(true);

  const selectRun = useCallback((id, submitted = false) => {
    setRunId(id);
    setIsSubmitted(submitted);
  }, []);

  useEffect(() => {
    api
      .getLatestRun()
      .then((res) => {
        if (res.data.id) selectRun(res.data.id, !!res.data.is_submitted);
        else setActiveTab('setup');
      })
      .catch((err) => {
        console.error(err);
        setActiveTab('setup');
      })
      .finally(() => setBootstrapping(false));
  }, [selectRun]);

  // Drill-down from any report straight into a Daily Report
  const openDay = (day) => {
    setDailyDay(day);
    setActiveTab('daily');
  };

  if (bootstrapping) return <LoadingState message="Starting up..." />;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 md:px-8">
      <nav className="mb-8 flex flex-wrap items-center gap-2 border-b-2 border-ink pb-3" aria-label="Sections">
        {TABS.map((tab) => {
          const disabled = tab.needsRun && !runId;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              disabled={disabled}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 font-semibold ${active ? 'bg-ink text-paper' : 'hover:bg-ticket'} ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
            >
              {tab.label}
            </button>
          );
        })}
        <span className="ml-auto text-sm text-muted">
          {runId ? (
            <>
              Run <span className="bg-ticket px-2 tabular-nums">{runId}</span>
              {isSubmitted ? ' (Submitted Run)' : ''}
            </>
          ) : (
            'No run selected'
          )}
        </span>
      </nav>

      {activeTab === 'setup' && (
        <Setup
          runId={runId}
          onSelectRun={selectRun}
          onCompleted={(id) => {
            selectRun(id, false);
            setActiveTab('report');
          }}
        />
      )}
      {activeTab === 'declaration' && runId && <Declaration runId={runId} />}
      {activeTab === 'report' && runId && <Report runId={runId} onOpenDay={openDay} />}
      {activeTab === 'daily' && runId && <Daily runId={runId} day={dailyDay} onDayChange={setDailyDay} />}
      {activeTab === 'assurance' && runId && <Assurance runId={runId} />}
    </div>
  );
}
