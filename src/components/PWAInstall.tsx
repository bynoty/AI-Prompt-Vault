import React, { useState, useEffect } from 'react';
import { Download, Monitor, Smartphone, CheckCircle, Info, X, ExternalLink, ShieldCheck } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PWAInstallProps {
  isDark?: boolean;
}

export default function PWAInstall({ isDark = true }: PWAInstallProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [installedSuccessfully, setInstalledSuccessfully] = useState(false);

  useEffect(() => {
    // Check if app is already running in standalone display mode (PWA / Installed app)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    
    if (isStandalone) {
      setIsInstalled(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setInstalledSuccessfully(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      setShowModal(true);
      return;
    }

    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setIsInstalled(true);
      setInstalledSuccessfully(true);
    }
    setDeferredPrompt(null);
  };

  return (
    <>
      {/* Sidebar / Header Quick PWA Install Widget */}
      <div className={`p-3 rounded-2xl border transition-all ${
        isDark ? 'bg-gradient-to-br from-violet-950/40 to-zinc-950 border-violet-800/40 hover:border-violet-600/60' : 'bg-gradient-to-br from-violet-50 to-white border-violet-200 hover:border-violet-300'
      }`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`p-2 rounded-xl shrink-0 ${isDark ? 'bg-violet-500/10 text-violet-400' : 'bg-violet-100 text-violet-600'}`}>
              <Monitor className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-xs truncate">Desktop PWA App</span>
                {isInstalled && (
                  <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Installed
                  </span>
                )}
              </div>
              <p className="text-[10px] text-zinc-400 truncate">
                {isInstalled ? 'Running in Desktop App Mode' : 'Install for offline desktop workspace'}
              </p>
            </div>
          </div>

          <button
            onClick={isInstalled ? () => setShowModal(true) : handleInstallClick}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
              isInstalled
                ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                : 'bg-violet-600 hover:bg-violet-500 text-white shadow-md shadow-violet-600/20 active:scale-95'
            }`}
          >
            {isInstalled ? (
              <>
                <Info className="w-3.5 h-3.5" />
                <span>Info</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Install</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Installation Instruction Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className={`w-full max-w-md p-6 rounded-2xl border shadow-2xl space-y-5 ${
            isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-violet-500/10 text-violet-400">
                  <Monitor className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base">Desktop & Mobile PWA App</h3>
                  <p className="text-xs text-zinc-400">Install AI Prompt Vault locally on your device</p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {installedSuccessfully && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>Prompt Vault has been successfully installed as a native Desktop App!</span>
              </div>
            )}

            <div className="space-y-4 text-xs">
              {/* Desktop Chrome / Edge Instruction */}
              <div className={`p-3.5 rounded-xl border space-y-2 ${isDark ? 'bg-zinc-950/50 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
                <div className="flex items-center gap-2 font-bold text-violet-400">
                  <Monitor className="w-4 h-4" />
                  <span>Desktop (Chrome, Edge, Brave, Arc)</span>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-zinc-400 leading-relaxed">
                  <li>Look at the right side of the address bar at the top of your browser.</li>
                  <li>Click the <strong className="text-zinc-200">Install App</strong> icon <Download className="w-3 h-3 inline text-violet-400" /> or click the browser menu <strong className="text-zinc-200">(⋮)</strong>.</li>
                  <li>Select <strong className="text-zinc-200">&quot;Install AI Prompt Vault...&quot;</strong></li>
                </ol>
              </div>

              {/* Mobile iOS / Android Instruction */}
              <div className={`p-3.5 rounded-xl border space-y-2 ${isDark ? 'bg-zinc-950/50 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
                <div className="flex items-center gap-2 font-bold text-emerald-400">
                  <Smartphone className="w-4 h-4" />
                  <span>Mobile (iOS Safari & Android Chrome)</span>
                </div>
                <div className="space-y-2 text-zinc-400 leading-relaxed">
                  <p><strong className="text-zinc-200">iOS (Safari):</strong> Tap Share <ExternalLink className="w-3 h-3 inline text-emerald-400" /> &rarr; Select <strong className="text-zinc-200">&quot;Add to Home Screen&quot;</strong>.</p>
                  <p><strong className="text-zinc-200">Android (Chrome):</strong> Tap Menu <strong className="text-zinc-200">(⋮)</strong> &rarr; Select <strong className="text-zinc-200">&quot;Add to Home screen&quot;</strong> or <strong className="text-zinc-200">&quot;Install app&quot;</strong>.</p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-violet-500/5 border border-violet-500/10 text-zinc-400 text-[11px] flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
                <span>
                  Installing as a PWA grants dedicated window management, desktop shortcuts, and full offline synchronization.
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowModal(false)}
                className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs transition-all cursor-pointer shadow-lg shadow-violet-600/20"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
