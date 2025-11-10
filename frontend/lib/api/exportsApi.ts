import { apiSlice } from './apiSlice';

export type ExportFormat = 'csv';
export type EntryType =
  | 'income'
  | 'expenses'
  | 'subscriptions'
  | 'installments'
  | 'budgets'
  | 'savings'
  | 'portfolio'
  | 'goals'
  | 'debts'
  | 'taxes';

export interface ExportRequest {
  entry_type: EntryType;
  format: ExportFormat;
  start_date?: string | null;
  end_date?: string | null;
}

export interface ExportResponse {
  success: boolean;
  message: string;
  filename: string;
  row_count: number;
}

export const exportsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    exportData: builder.mutation<ExportResponse, ExportRequest>({
      query: (data) => ({
        url: '/api/v1/exports/',
        method: 'POST',
        body: data,
      }),
    }),
    downloadExport: builder.mutation<Blob, ExportRequest>({
      query: (data) => ({
        url: '/api/v1/exports/download',
        method: 'POST',
        body: data,
        responseHandler: (response) => response.blob(),
        cache: 'no-cache',
      }),
      // Don't cache the result to avoid storing non-serializable Blob in Redux
      extraOptions: { maxRetries: 0 },
    }),
  }),
});

export const { useExportDataMutation, useDownloadExportMutation } = exportsApi;
