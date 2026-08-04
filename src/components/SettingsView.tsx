import React, { useState } from 'react';
import { db } from '../db';
import { parseAndImportFitNotesCSV, exportFitNotesCSV, CSVImportResult } from '../utils/csvHandler';
import { Upload, Download, Settings, Smartphone, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

interface SettingsViewProps {
  weightUnit: 'lbs' | 'kg';
  setWeightUnit: (unit: 'lbs' | 'kg') => void;
  defaultTimerSec: number;
  setDefaultTimerSec: (sec: number) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  weightUnit,
  setWeightUnit,
  defaultTimerSec,
  setDefaultTimerSec
}) => {
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<CSVImportResult | null>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const csvText = e.target?.result as string;
      if (csvText) {
        const result = await parseAndImportFitNotesCSV(csvText);
        setImportResult(result);
      }
      setIsImporting(false);
    };
    reader.readAsText(file);
  };

  const handleExport = async () => {
    const csvContent = await exportFitNotesCSV();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `FitNotes_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const updateUnitSetting = async (unit: 'lbs' | 'kg') => {
    setWeightUnit(unit);
    await db.userSettings.update('default', { weightUnit: unit });
  };

  const updateTimerSetting = async (sec: number) => {
    setDefaultTimerSec(sec);
    await db.userSettings.update('default', { defaultRestTimerSeconds: sec });
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 pb-32 space-y-6">
      <div className="bg-surface border border-surfaceBorder rounded-3xl p-5 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-brand-500/20 text-brand-400 flex items-center justify-center border border-brand-500/30">
            <Upload className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">FitNotes Backup Import & Export</h3>
            <p className="text-xs text-slate-400">Import your FitNotes Google Drive CSV backups</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <label className="relative flex flex-col items-center justify-center p-4 rounded-2xl bg-card border-2 border-dashed border-brand-500/40 hover:border-brand-500/80 cursor-pointer transition text-center group">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="absolute inset-0 opacity-0 cursor-pointer"
              disabled={isImporting}
            />
            {isImporting ? (
              <RefreshCw className="w-6 h-6 text-brand-400 animate-spin mb-2" />
            ) : (
              <Upload className="w-6 h-6 text-brand-400 group-hover:scale-110 transition mb-2" />
            )}
            <span className="font-bold text-white text-sm">
              {isImporting ? 'Importing FitNotes CSV...' : 'Import FitNotes CSV Backup'}
            </span>
            <span className="text-xs text-slate-400 mt-0.5">Select .csv from Google Drive or Storage</span>
          </label>

          <button
            onClick={handleExport}
            className="flex flex-col items-center justify-center p-4 rounded-2xl bg-card border border-surfaceBorder hover:border-brand-500/40 transition text-center group"
          >
            <Download className="w-6 h-6 text-emerald-400 group-hover:scale-110 transition mb-2" />
            <span className="font-bold text-white text-sm">Export Data to CSV</span>
            <span className="text-xs text-slate-400 mt-0.5">Download full workout backup</span>
          </button>
        </div>

        {importResult && (
          <div>
            {importResult.errors.length > 0 ? (
              <div className="bg-rose-950/40 border border-rose-500/40 rounded-2xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-rose-200 text-sm">Import Failed</h4>
                  <p className="text-xs text-rose-300/80 mt-1">{importResult.errors.join(', ')}</p>
                </div>
              </div>
            ) : (
              <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-2xl p-4 flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-emerald-200 text-sm">FitNotes CSV Import Successful!</h4>
                  <p className="text-xs text-emerald-300/80 mt-1">
                    Restored <span className="font-bold text-white">{importResult.workoutsImported} workout days</span>,{' '}
                    <span className="font-bold text-white">{importResult.setsImported} total sets</span>, and created{' '}
                    <span className="font-bold text-white">{importResult.exercisesCreated} custom exercises</span>.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-surface border border-surfaceBorder rounded-3xl p-5 shadow-xl space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">App Preferences</h3>
            <p className="text-xs text-slate-400">Configure units & rest timer defaults</p>
          </div>
        </div>

        <div className="flex items-center justify-between p-3.5 bg-card rounded-2xl border border-surfaceBorder">
          <div>
            <div className="font-bold text-white text-sm">Weight Unit</div>
            <div className="text-xs text-slate-400">Default unit for set weight logging</div>
          </div>

          <div className="flex bg-[#090a0f] p-1 rounded-xl border border-surfaceBorder">
            <button
              onClick={() => updateUnitSetting('lbs')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                weightUnit === 'lbs' ? 'bg-brand-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              lbs
            </button>
            <button
              onClick={() => updateUnitSetting('kg')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                weightUnit === 'kg' ? 'bg-brand-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              kg
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between p-3.5 bg-card rounded-2xl border border-surfaceBorder">
          <div>
            <div className="font-bold text-white text-sm">Default Rest Timer</div>
            <div className="text-xs text-slate-400">Auto-starts upon set completion</div>
          </div>

          <select
            value={defaultTimerSec}
            onChange={(e) => updateTimerSetting(Number(e.target.value))}
            className="bg-[#090a0f] border border-surfaceBorder focus:border-brand-500 text-white font-bold px-3 py-2 rounded-xl text-xs outline-none cursor-pointer"
          >
            <option value={60}>60 Seconds (1 min)</option>
            <option value={90}>90 Seconds (1.5 min)</option>
            <option value={120}>120 Seconds (2 min)</option>
            <option value={180}>180 Seconds (3 min)</option>
          </select>
        </div>
      </div>

      <div className="bg-surface border border-surfaceBorder rounded-3xl p-5 shadow-xl">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Install on Android Home Screen</h3>
            <p className="text-xs text-slate-400">Use kfit 100% offline like a native Android app</p>
          </div>
        </div>

        <ol className="list-decimal list-inside space-y-2 text-xs font-semibold text-slate-300 pl-1">
          <li>
            Open this web app URL in Chrome or Brave on your Android phone.
          </li>
          <li>
            Tap the browser menu icon (<span className="font-bold text-white">⋮</span> 3 dots top right).
          </li>
          <li>
            Select <span className="font-bold text-brand-400">"Add to Home Screen"</span> or{' '}
            <span className="font-bold text-brand-400">"Install App"</span>.
          </li>
          <li>Launch `kfit` directly from your phone's home screen anytime!</li>
        </ol>
      </div>
    </div>
  );
};
