'use client';

import React from 'react';
import type { ModuleActionsContextType } from '@/types/module-layout';

export const BudgetsActionsContext = React.createContext<ModuleActionsContextType>({
  setActions: () => undefined,
});
