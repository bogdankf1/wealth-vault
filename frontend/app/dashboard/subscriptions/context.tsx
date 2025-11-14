'use client';

import React from 'react';
import type { ModuleActionsContextType } from '@/types/module-layout';

export const SubscriptionsActionsContext = React.createContext<ModuleActionsContextType>({
  setActions: () => undefined,
});
