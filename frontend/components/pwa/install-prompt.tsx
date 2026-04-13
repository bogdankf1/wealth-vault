'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download } from 'lucide-react';
import { IOSSteps, IOSChromeSteps, IPadSteps, AndroidSteps, DesktopSteps } from './install-steps';

type Platform = 'ios-safari' | 'ios-chrome' | 'ipad-safari' | 'ipad-chrome' | 'android' | 'desktop';

function getPlatform(): Platform | null {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent;
  const isChrome = /CriOS/.test(ua);
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) {
    return isChrome ? 'ipad-chrome' : 'ipad-safari';
  }
  if (/iPhone|iPod/.test(ua)) return isChrome ? 'ios-chrome' : 'ios-safari';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /FBAN|FBAV|Instagram|Twitter|Line|Snapchat/.test(navigator.userAgent);
}

declare global {
  interface Window {
    __deferredInstallPrompt: BeforeInstallPromptEvent | null;
  }
  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  }
}

export function InstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [hasNativePrompt, setHasNativePrompt] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (isInAppBrowser()) return;
    if (localStorage.getItem('wealth-vault:install-dismissed')) return;
    if (sessionStorage.getItem('wealth-vault:install-closed')) return;

    const detected = getPlatform();
    setPlatform(detected);

    if (window.__deferredInstallPrompt) setHasNativePrompt(true);

    const handler = (e: Event) => {
      e.preventDefault();
      window.__deferredInstallPrompt = e as BeforeInstallPromptEvent;
      setHasNativePrompt(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const show = () => setVisible(true);

  const handleClose = () => {
    setVisible(false);
    sessionStorage.setItem('wealth-vault:install-closed', 'true');
  };

  const handleDismiss = () => {
    setVisible(false);
    localStorage.setItem('wealth-vault:install-dismissed', 'true');
  };

  const handleNativeInstall = async () => {
    const prompt = window.__deferredInstallPrompt;
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') {
      setVisible(false);
      localStorage.setItem('wealth-vault:install-dismissed', 'true');
    }
    window.__deferredInstallPrompt = null;
    setHasNativePrompt(false);
  };

  // Don't show if standalone, dismissed, or in-app browser
  if (isStandalone() || !platform) return null;
  if (typeof window !== 'undefined' && localStorage.getItem('wealth-vault:install-dismissed')) return null;

  return (
    <>
      {/* Install button for the header */}
      <button
        onClick={show}
        title="Install Wealth Vault"
        className="p-1.5 rounded-md text-gray-500 hover:text-gray-600 hover:bg-gray-100 active:bg-gray-200 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-700 transition-colors touch-manipulation"
      >
        <Download className="h-5 w-5" />
      </button>

      {/* Modal */}
      {visible && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
          onClick={handleClose}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-[380px] rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6 shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <img src="/favicon.svg" alt="Wealth Vault" className="w-12 h-12 rounded-xl" />
                <div>
                  <h3 className="text-base font-bold text-foreground">
                    Install Wealth Vault
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Add to your home screen
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="text-muted-foreground hover:text-foreground p-1"
              >
                <X className="w-[18px] h-[18px]" />
              </button>
            </div>

            {/* Benefits */}
            <div className="mb-5 p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Get the full app experience — faster loading, no browser UI, and quick access from your home screen.
              </p>
            </div>

            {/* Native install or manual steps */}
            {hasNativePrompt ? (
              <button
                onClick={handleNativeInstall}
                className="w-full py-3 px-5 rounded-xl bg-blue-600 text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors mb-4"
              >
                <Download className="w-4 h-4" />
                Install App
              </button>
            ) : (
              <div className="flex flex-col gap-3 mb-4">
                {platform === 'ios-safari' && <IOSSteps />}
                {platform === 'ios-chrome' && <IOSChromeSteps />}
                {platform === 'ipad-safari' && <IPadSteps label="Safari" />}
                {platform === 'ipad-chrome' && <IPadSteps label="Chrome" />}
                {platform === 'android' && <AndroidSteps />}
                {platform === 'desktop' && <DesktopSteps />}
              </div>
            )}

            {/* Dismiss */}
            <button
              onClick={handleDismiss}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Don&apos;t show again
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
