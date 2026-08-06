import React, { useState, useEffect } from 'react';
import { db } from '../db';
import { parseAndImportFitNotesCSV, exportFitNotesCSV, CSVImportResult } from '../utils/csvHandler';
import {
  Upload,
  Download,
  Settings,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Cloud,
  CloudUpload,
  Unlink,
  Check,
  Link as LinkIcon
} from 'lucide-react';
import {
  getStoredGDriveStatus,
  initiateGoogleDriveAuth,
  disconnectGoogleDrive,
  setAutoBackupEnabled,
  uploadBackupToGoogleDrive,
  GDRIVE_STATUS_EVENT,
  GoogleDriveStatus
} from '../utils/googleDriveBackup';

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

  // Google Drive State
  const [gdriveStatus, setGdriveStatus] = useState<GoogleDriveStatus>(getStoredGDriveStatus());
  const [isDriveBackingUp, setIsDriveBackingUp] = useState(false);
  const [driveBackupSuccess, setDriveBackupSuccess] = useState<string | null>(null);
  const [driveBackupError, setDriveBackupError] = useState<string | null>(null);

  // Background syncs can flip the connection into a needs-reconnect state, so
  // mirror those changes here instead of only reading status on mount.
  useEffect(() => {
    const refresh = () => setGdriveStatus(getStoredGDriveStatus());
    refresh();
    window.addEventListener(GDRIVE_STATUS_EVENT, refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener(GDRIVE_STATUS_EVENT, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

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

  // Google Drive API Handlers
  const handleConnectDrive = async () => {
    setDriveBackupError(null);
    try {
      await initiateGoogleDriveAuth();
      setGdriveStatus(getStoredGDriveStatus());
      setDriveBackupError(null);
    } catch (err: any) {
      setDriveBackupError(err.message || 'Failed to connect Google Drive.');
    }
  };

  const handleDisconnectDrive = () => {
    disconnectGoogleDrive();
    setGdriveStatus(getStoredGDriveStatus());
    setDriveBackupSuccess(null);
  };

  const handleToggleAutoBackup = (enabled: boolean) => {
    setAutoBackupEnabled(enabled);
    setGdriveStatus(getStoredGDriveStatus());
  };

  const handleBackupToDriveNow = async () => {
    setIsDriveBackingUp(true);
    setDriveBackupError(null);
    setDriveBackupSuccess(null);

    try {
      const res = await uploadBackupToGoogleDrive();
      setDriveBackupSuccess(`Uploaded ${res.filename} to kfit_backups folder!`);
      setGdriveStatus(getStoredGDriveStatus());
    } catch (err: any) {
      setDriveBackupError(err.message || 'Google Drive backup failed.');
    } finally {
      setIsDriveBackingUp(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 pb-32 space-y-6 animate-fade-in">
      {/* Google Drive Integration Card */}
      <div className="bg-gradient-to-br from-[#12141d] via-[#161a29] to-[#12141d] border border-brand-500/30 rounded-3xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-brand-500/20 text-brand-400 border border-brand-500/30 flex items-center justify-center shadow-lg shadow-brand-500/10">
              <Cloud className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-white">Google Drive Backup</h3>
                {gdriveStatus.isConnected && gdriveStatus.needsReauth ? (
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    Reconnect
                  </span>
                ) : gdriveStatus.isConnected ? (
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Linked
                  </span>
                ) : (
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                    Not Linked
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Auto-sync CSV backups every 24h to your Google Drive
              </p>
            </div>
          </div>
        </div>

        {/* Connect Google Drive Button (When not connected) */}
        {!gdriveStatus.isConnected ? (
          <div className="p-4 bg-card border border-surfaceBorder rounded-2xl text-center space-y-3">
            <p className="text-xs text-slate-300 max-w-md mx-auto">
              Link your Google Drive account to automatically sync CSV backups into your dedicated <span className="font-bold text-brand-400">kfit_backups</span> folder.
            </p>
            <button
              onClick={handleConnectDrive}
              className="py-3.5 px-6 bg-brand-600 hover:bg-brand-500 text-white font-extrabold text-xs rounded-2xl inline-flex items-center justify-center gap-2 shadow-xl shadow-brand-600/30 transition"
            >
              <LinkIcon className="w-4 h-4" />
              <span>Connect Google Drive Account</span>
            </button>
          </div>
        ) : (
          /* Google Drive Status & Controls (When connected) */
          <div className="space-y-3 pt-1">
            {gdriveStatus.needsReauth && (
              <div className="p-4 bg-amber-950/40 border border-amber-500/40 rounded-2xl space-y-3">
                <div className="flex items-start gap-2 text-xs font-semibold text-amber-100">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    {gdriveStatus.lastError ||
                      'Google Drive access needs to be renewed. Backups are paused until you reconnect.'}
                  </span>
                </div>
                <button
                  onClick={handleConnectDrive}
                  className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 transition"
                >
                  <LinkIcon className="w-4 h-4" />
                  <span>Reconnect Google Drive</span>
                </button>
              </div>
            )}

            {gdriveStatus.userEmail && (
              <div className="text-[11px] text-slate-400 text-center font-medium">
                Signed in as <span className="text-slate-200 font-bold">{gdriveStatus.userEmail}</span>
              </div>
            )}

            <div className="p-4 bg-card border border-surfaceBorder rounded-2xl flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-300">Automatic 24h CSV Auto-Backup</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Syncs your workout backup once every 24 hours
                </div>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={gdriveStatus.autoBackupEnabled}
                  onChange={(e) => handleToggleAutoBackup(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={handleBackupToDriveNow}
                disabled={isDriveBackingUp}
                className="py-3 px-4 bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-brand-600/30 transition disabled:opacity-50"
              >
                {isDriveBackingUp ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <CloudUpload className="w-4 h-4" />
                )}
                <span>{isDriveBackingUp ? 'Uploading to Drive...' : 'Backup to Drive Now'}</span>
              </button>

              <button
                onClick={handleDisconnectDrive}
                className="py-3 px-4 bg-surface border border-surfaceBorder hover:border-rose-500/40 text-slate-300 hover:text-rose-400 font-bold text-xs rounded-2xl flex items-center justify-center gap-2 transition"
              >
                <Unlink className="w-4 h-4" />
                <span>Disconnect Google Drive</span>
              </button>
            </div>

            {gdriveStatus.lastBackupTime && (
              <div className="text-[11px] text-slate-400 text-center font-medium">
                Last API backup to Drive: <span className="text-emerald-400 font-bold">{gdriveStatus.lastBackupTime}</span>
              </div>
            )}
          </div>
        )}

        {/* Feedback Messages */}
        {driveBackupSuccess && (
          <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-2xl p-3 flex items-center gap-2 text-xs font-semibold text-emerald-200">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{driveBackupSuccess}</span>
          </div>
        )}
        {driveBackupError && (
          <div className="bg-rose-950/40 border border-rose-500/40 rounded-2xl p-3 flex items-center gap-2 text-xs font-semibold text-rose-200">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{driveBackupError}</span>
          </div>
        )}
      </div>

      {/* Standard FitNotes Import / Export Section */}
      <div className="bg-surface border border-surfaceBorder rounded-3xl p-5 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-brand-500/20 text-brand-400 flex items-center justify-center border border-brand-500/30">
            <Upload className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Manual CSV Import & Export</h3>
            <p className="text-xs text-slate-400">Import or download FitNotes-compatible CSV files</p>
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
            <span className="text-xs text-slate-400 mt-0.5">Select .csv file to restore</span>
          </label>

          <button
            onClick={handleExport}
            className="flex flex-col items-center justify-center p-4 rounded-2xl bg-card border border-surfaceBorder hover:border-brand-500/40 transition text-center group"
          >
            <Download className="w-6 h-6 text-emerald-400 group-hover:scale-110 transition mb-2" />
            <span className="font-bold text-white text-sm">Download Local CSV</span>
            <span className="text-xs text-slate-400 mt-0.5">Save backup to your device</span>
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

      {/* Preferences Section */}
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

    </div>
  );
};
