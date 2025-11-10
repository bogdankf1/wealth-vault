/**
 * Redux store configuration with RTK Query
 */
import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { apiSlice } from './api/apiSlice';
import { aiApi } from './api/aiApi';
import { currenciesApi } from './api/currenciesApi';

export const store = configureStore({
  reducer: {
    [apiSlice.reducerPath]: apiSlice.reducer,
    [aiApi.reducerPath]: aiApi.reducer,
    [currenciesApi.reducerPath]: currenciesApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types for non-serializable check
        ignoredActions: ['api/executeMutation/fulfilled'],
        // Ignore these paths in the state for non-serializable check
        ignoredPaths: ['api.mutations'],
      },
    }).concat(
      apiSlice.middleware,
      aiApi.middleware,
      currenciesApi.middleware
    ),
});

// Enable refetchOnFocus and refetchOnReconnect
setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
