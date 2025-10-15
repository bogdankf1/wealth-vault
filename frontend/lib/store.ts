/**
 * Redux store configuration with RTK Query
 */
import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { apiSlice } from './api/apiSlice';
import { aiApi } from './api/aiApi';
import { budgetsApi } from './api/budgetsApi';
import { currenciesApi } from './api/currenciesApi';

export const store = configureStore({
  reducer: {
    [apiSlice.reducerPath]: apiSlice.reducer,
    [aiApi.reducerPath]: aiApi.reducer,
    [budgetsApi.reducerPath]: budgetsApi.reducer,
    [currenciesApi.reducerPath]: currenciesApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(
      apiSlice.middleware,
      aiApi.middleware,
      budgetsApi.middleware,
      currenciesApi.middleware
    ),
});

// Enable refetchOnFocus and refetchOnReconnect
setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
