'use client';

import React from 'react';
import type { ModuleActionsContextType } from '@/types/module-layout';

export const SavingsActionsContext = React.createContext<ModuleActionsContextType>({
  setActions: () => undefined,
});
