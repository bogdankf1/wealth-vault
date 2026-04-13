'use client';

import { Share, MoreVertical, Plus, Download } from 'lucide-react';

function Step({ num, icon, text }: { num: number; icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px] font-bold flex-shrink-0">
        {num}
      </span>
      <div className="flex items-center gap-1.5 text-[13px] text-foreground">
        {icon}
        <span>{text}</span>
      </div>
    </div>
  );
}

function PlatformLabel({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
      {label}
    </p>
  );
}

const iconClass = 'w-3.5 h-3.5 text-blue-600';

export function IOSSteps() {
  return (
    <>
      <PlatformLabel label="Safari" />
      <Step num={1} icon={<MoreVertical className={iconClass} />} text='Tap the Settings button at the bottom' />
      <Step num={2} icon={<Share className={iconClass} />} text='Tap "Share"' />
      <Step num={3} icon={null} text='Scroll down in the share sheet' />
      <Step num={4} icon={<Plus className={iconClass} />} text='Tap "Add to Home Screen"' />
      <Step num={5} icon={null} text='Tap "Add" to confirm' />
    </>
  );
}

export function IOSChromeSteps() {
  return (
    <>
      <PlatformLabel label="Chrome" />
      <Step num={1} icon={<Share className={iconClass} />} text='Tap the Share button' />
      <Step num={2} icon={null} text='Scroll down in the share sheet' />
      <Step num={3} icon={<Plus className={iconClass} />} text='Tap "Add to Home Screen"' />
      <Step num={4} icon={null} text='Tap "Add" to confirm' />
    </>
  );
}

export function IPadSteps({ label }: { label: string }) {
  return (
    <>
      <PlatformLabel label={label} />
      <Step num={1} icon={<Share className={iconClass} />} text='Tap the Share icon at the top' />
      <Step num={2} icon={null} text='Tap "View More"' />
      <Step num={3} icon={<Plus className={iconClass} />} text='Tap "Add to Home Screen"' />
      <Step num={4} icon={null} text='Tap "Add" to confirm' />
    </>
  );
}

export function AndroidSteps() {
  return (
    <>
      <PlatformLabel label="Chrome" />
      <Step num={1} icon={<MoreVertical className={iconClass} />} text='Tap the menu (three dots)' />
      <Step num={2} icon={<Plus className={iconClass} />} text='Tap "Add to Home Screen"' />
      <Step num={3} icon={null} text='Tap "Install" to confirm' />
    </>
  );
}

export function DesktopSteps() {
  return (
    <>
      <PlatformLabel label="Chrome or Edge" />
      <Step num={1} icon={<Download className={iconClass} />} text='Click the install icon in the address bar' />
      <Step num={2} icon={null} text='Click "Install" to confirm' />
    </>
  );
}
