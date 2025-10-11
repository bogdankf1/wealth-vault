/**
 * AI Module API
 * RTK Query integration for AI-powered features
 */
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { getSession } from 'next-auth/react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface FileUploadResponse {
  id: string;
  filename: string;
  file_url: string;
  file_type: string;
  file_size: number;
  status: string;
  created_at: string;
}

export interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  balance?: number;
  category?: string;
}

export interface ParseStatementRequest {
  file_id: string;
}

export interface ParseStatementResponse {
  file_id: string;
  transactions: ParsedTransaction[];
  total_count: number;
}

export interface CategorizationRequest {
  description: string;
  amount: number;
  transaction_type: 'expense' | 'income';
}

export interface CategorizationResponse {
  description: string;
  category: string;
  confidence?: string;
}

export interface BatchCategorizationRequest {
  transactions: Array<{ description: string; amount: number }>;
  transaction_type: 'expense' | 'income';
}

export interface BatchCategorizationResponse {
  categories: string[];
}

export interface CategorizationCorrectionRequest {
  description: string;
  correct_category: string;
  original_category?: string;
}

export interface FinancialInsights {
  spending: string[];
  savings: string[];
  anomalies: string[];
}

export const aiApi = createApi({
  reducerPath: 'aiApi',
  baseQuery: fetchBaseQuery({
    baseUrl: `${API_URL}/api/v1/ai`,
    prepareHeaders: async (headers) => {
      // Get session token from NextAuth (same as main apiSlice)
      const session = await getSession();
      if (session?.accessToken) {
        headers.set('Authorization', `Bearer ${session.accessToken}`);
      }
      return headers;
    },
  }),
  tagTypes: ['UploadedFiles', 'AIInsights'],
  endpoints: (builder) => ({
    // Upload a bank statement file
    uploadFile: builder.mutation<FileUploadResponse, FormData>({
      query: (formData) => ({
        url: '/upload',
        method: 'POST',
        body: formData,
      }),
      invalidatesTags: ['UploadedFiles'],
    }),

    // Parse an uploaded statement
    parseStatement: builder.mutation<ParseStatementResponse, ParseStatementRequest>({
      query: (body) => ({
        url: '/parse-statement',
        method: 'POST',
        body,
      }),
    }),

    // Categorize a single transaction
    categorizeTransaction: builder.mutation<CategorizationResponse, CategorizationRequest>({
      query: (body) => ({
        url: '/categorize',
        method: 'POST',
        body,
      }),
    }),

    // Batch categorize multiple transactions
    batchCategorizeTransactions: builder.mutation<BatchCategorizationResponse, BatchCategorizationRequest>({
      query: (body) => ({
        url: '/batch-categorize',
        method: 'POST',
        body,
      }),
    }),

    // Save a categorization correction
    saveCategorizationCorrection: builder.mutation<{ message: string }, CategorizationCorrectionRequest>({
      query: (body) => ({
        url: '/save-correction',
        method: 'POST',
        body,
      }),
    }),

    // Get financial insights
    getFinancialInsights: builder.query<FinancialInsights, void>({
      query: () => '/insights',
      providesTags: ['AIInsights'],
    }),
  }),
});

export const {
  useUploadFileMutation,
  useParseStatementMutation,
  useCategorizeTransactionMutation,
  useBatchCategorizeTransactionsMutation,
  useSaveCategorizationCorrectionMutation,
  useGetFinancialInsightsQuery,
} = aiApi;
