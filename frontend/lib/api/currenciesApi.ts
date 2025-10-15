/**
 * RTK Query API for currencies module
 */
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { getSession } from 'next-auth/react';
import type {
  Currency,
  ExchangeRate,
  ConversionRequest,
  ConversionResponse,
  CurrencyCreateRequest,
  CurrencyUpdateRequest,
  RefreshRatesResponse,
} from '@/types/currency';

const baseQuery = fetchBaseQuery({
  baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  prepareHeaders: async (headers) => {
    const session = await getSession();
    if (session?.accessToken) {
      headers.set('Authorization', `Bearer ${session.accessToken}`);
    }
    return headers;
  },
});

export const currenciesApi = createApi({
  reducerPath: 'currenciesApi',
  baseQuery,
  tagTypes: ['Currency', 'ExchangeRate'],
  endpoints: (builder) => ({
    // Get all currencies
    getCurrencies: builder.query<Currency[], { active_only?: boolean } | void>({
      query: (params) => ({
        url: '/api/v1/currencies',
        params: params || {},
      }),
      providesTags: (result: Currency[] | undefined) =>
        result
          ? [
              ...result.map(({ code }: Currency) => ({ type: 'Currency' as const, id: code })),
              { type: 'Currency', id: 'LIST' },
            ]
          : [{ type: 'Currency', id: 'LIST' }],
    }),

    // Get single currency
    getCurrency: builder.query<Currency, string>({
      query: (code: string) => `/api/v1/currencies/${code}`,
      providesTags: (_result: Currency | undefined, _error, code: string) => [{ type: 'Currency', id: code }],
    }),

    // Create currency (admin only)
    createCurrency: builder.mutation<Currency, CurrencyCreateRequest>({
      query: (currency) => ({
        url: '/api/v1/currencies',
        method: 'POST',
        body: currency,
      }),
      invalidatesTags: [{ type: 'Currency', id: 'LIST' }],
    }),

    // Update currency (admin only)
    updateCurrency: builder.mutation<Currency, { code: string; data: CurrencyUpdateRequest }>({
      query: ({ code, data }: { code: string; data: CurrencyUpdateRequest }) => ({
        url: `/api/v1/currencies/${code}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: (_result: Currency | undefined, _error, { code }: { code: string; data: CurrencyUpdateRequest }) => [
        { type: 'Currency', id: code },
        { type: 'Currency', id: 'LIST' },
      ],
    }),

    // Delete/deactivate currency (admin only)
    deleteCurrency: builder.mutation<void, string>({
      query: (code: string) => ({
        url: `/api/v1/currencies/${code}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result: void | undefined, _error, code: string) => [
        { type: 'Currency', id: code },
        { type: 'Currency', id: 'LIST' },
      ],
    }),

    // Convert currency
    convertCurrency: builder.mutation<ConversionResponse, ConversionRequest>({
      query: (conversion) => ({
        url: '/api/v1/currencies/convert',
        method: 'POST',
        body: conversion,
      }),
    }),

    // Get exchange rate
    getExchangeRate: builder.query<ExchangeRate, { from: string; to: string; force_refresh?: boolean }>({
      query: ({ from, to, force_refresh }: { from: string; to: string; force_refresh?: boolean }) => ({
        url: `/api/v1/currencies/rates/${from}/${to}`,
        params: { force_refresh: force_refresh || false },
      }),
      providesTags: (_result: ExchangeRate | undefined, _error, { from, to }: { from: string; to: string; force_refresh?: boolean }) => [
        { type: 'ExchangeRate', id: `${from}-${to}` },
      ],
    }),

    // Refresh all exchange rates (admin only)
    refreshExchangeRates: builder.mutation<RefreshRatesResponse, void>({
      query: () => ({
        url: '/api/v1/currencies/rates/refresh',
        method: 'POST',
      }),
      invalidatesTags: [{ type: 'ExchangeRate', id: 'LIST' }],
    }),

    // Set manual exchange rate (admin only)
    setManualRate: builder.mutation<ExchangeRate, { from_currency: string; to_currency: string; rate: number }>({
      query: (rateData) => ({
        url: '/api/v1/currencies/rates/manual',
        method: 'POST',
        body: rateData,
      }),
      invalidatesTags: (_result: ExchangeRate | undefined, _error, { from_currency, to_currency }: { from_currency: string; to_currency: string; rate: number }) => [
        { type: 'ExchangeRate', id: `${from_currency}-${to_currency}` },
        { type: 'ExchangeRate', id: 'LIST' },
      ],
    }),
  }),
});

export const {
  useGetCurrenciesQuery,
  useGetCurrencyQuery,
  useCreateCurrencyMutation,
  useUpdateCurrencyMutation,
  useDeleteCurrencyMutation,
  useConvertCurrencyMutation,
  useGetExchangeRateQuery,
  useRefreshExchangeRatesMutation,
  useSetManualRateMutation,
} = currenciesApi;
