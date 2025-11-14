'use client';

import React from 'react';
import type { ModuleActionsContextType } from '@/types/module-layout';

export const DebtsActionsContext = React.createContext<ModuleActionsContextType>({
  setActions: () => undefined,
});
