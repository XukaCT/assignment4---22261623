import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import { PageTitle, SectionHead, ErrorState, humanise } from './ui';

export default function Setup({ runId, onSelectRun, onCompleted }) {
  const [runs, setRuns] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadRuns = useCallback(() => {
    api.listRuns().then((res) => setRuns(res.data)).catch((e) => {
      console.error(e);
      setError('Could not reach the server. Is the backend running on port 3000?');
    });
  }, []);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  const startNewRun = async () => {
    setBusy(true);
    setError('');
    try {
      setMessage('Creating run and freezing configuration...');
      const init = await api.initRun();
      setMessage(`Run ${init.data.runId} created. Simulating 60 days...`);
      await api.simulateRun(init.data.runId);
      setMessage(`Run ${init.data.runId} completed.`);
      loadRuns();
      onCompleted(init.data.runId);
    } catch (e) {
      console.error(e);
      setError(e.response?.data?.error || 'The run failed. Check the backend console.');
      setMessage('');
    }
    setBusy(false);
  };

  return (
    <div>
      <PageTitle
        title="Setup & runs"
        sub="Each run freezes its configuration, then simulates 60 days. Completed runs are read-only; to change the model, start a new run."
      >
        <button
          onClick={startNewRun}
          disabled={busy}
          className="bg-ink px-6 py-3 font-semibold text-paper hover:bg-loss disabled:opacity-50"
        >
          {busy ? 'Working...' : 'Start new 60-day run'}
        </button>
      </PageTitle>

      {message && <p className="mt-4 font-semibold text-gain">{message}</p>}
      {error && <div className="mt-4"><ErrorState message={error} /></div>}

      <SectionHead>Runs in the database</SectionHead>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left">
          <thead className="bg-ink text-paper">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Run ID</th>
              <th className="px-4 py-2.5 font-semibold">Name</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold">Seed</th>
              <th className="px-4 py-2.5 font-semibold">Created</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-b border-rule odd:bg-panel">
                <td className="px-4 py-3 font-semibold tabular-nums">
                  {r.id} {r.is_submitted && <span className="ml-2 bg-ticket px-2 text-sm">Submitted</span>}
                </td>
                <td className="px-4 py-3">{r.run_name}</td>
                <td className="px-4 py-3">{humanise(r.status)}</td>
                <td className="px-4 py-3 tabular-nums">{r.seed}</td>
                <td className="px-4 py-3 text-muted">{r.created_at}</td>
                <td className="px-4 py-3 text-right">
                  {r.status === 'completed' && (
                    <button
                      onClick={() => onSelectRun(r.id, r.is_submitted)}
                      disabled={runId === r.id}
                      className="font-semibold underline disabled:no-underline disabled:opacity-50"
                    >
                      {runId === r.id ? 'Viewing' : 'View'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-muted">No runs yet. Start one above.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
