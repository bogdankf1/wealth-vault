'use client';

/**
 * Floating "Ask AI" trigger + right-side slide-over panel containing the streaming agent.
 * Mounted in the dashboard layout so the assistant is available on every page without
 * navigating away (the recommended in-app-assistant pattern).
 */
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { AskYourFinances } from './ask-your-finances';

export function AgentSheet() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        {/* Inline position so it can't be overridden by class-ordering/containing-block quirks. */}
        <button
          aria-label="Ask your finances"
          style={{ position: 'fixed', right: '1.5rem', bottom: '1.5rem', zIndex: 40 }}
          className={cn(
            'flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-primary-foreground',
            'shadow-lg ring-1 ring-black/5 hover:opacity-90 transition-opacity',
          )}
        >
          <Sparkles className="h-5 w-5" />
          <span className="hidden sm:inline text-sm font-medium">Ask AI</span>
        </button>
      </SheetTrigger>
      <SheetContent>
        <SheetTitle className="sr-only">Ask your finances</SheetTitle>
        <div className="flex-1 min-h-0 p-4">
          <AskYourFinances />
        </div>
      </SheetContent>
    </Sheet>
  );
}
