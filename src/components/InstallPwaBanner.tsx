import React, { useEffect, useState } from 'react';
import { Smartphone, Download, X } from 'lucide-react';

export const InstallPwaBanner: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsVisible(false);
    }
    setDeferredPrompt(null);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed top-16 left-4 right-4 z-50 max-w-md mx-auto bg-gradient-to-r from-brand-600 to-indigo-600 text-white rounded-2xl p-4 shadow-2xl border border-brand-400/40 flex items-center justify-between animate-bounce-short">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
          <Smartphone className="w-6 h-6 text-white" />
        </div>
        <div>
          <div className="font-bold text-sm">Install kfit Native App</div>
          <div className="text-xs text-brand-100">Add to home screen for offline use</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleInstallClick}
          className="px-3.5 py-2 bg-white text-brand-700 hover:bg-brand-50 font-bold text-xs rounded-xl shadow-md flex items-center gap-1.5 transition"
        >
          <Download className="w-4 h-4" />
          <span>Install</span>
        </button>
        <button
          onClick={() => setIsVisible(false)}
          className="p-1.5 text-brand-200 hover:text-white transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
