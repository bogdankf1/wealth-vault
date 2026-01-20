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
  currency?: string;
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

// Income Screenshot Parsing Types
export interface ParsedIncomeTransaction {
  date: string;
  description: string;
  amount: number;
  currency: string;
  category?: string;
  suggested_frequency?: string;
  is_recurring_hint: boolean;
  confidence: string;
}

export interface MultipleFileUploadResponse {
  files: FileUploadResponse[];
  total_count: number;
}

export interface ParseIncomeScreenshotsRequest {
  file_ids: string[];
}

export interface ParseIncomeScreenshotsResponse {
  transactions: ParsedIncomeTransaction[];
  total_count: number;
  recurring_count: number;
}

// Account Screenshot Parsing Types
export interface ParsedAccount {
  name: string;
  account_type: 'card' | 'deposit' | 'cash' | 'savings' | 'other';
  balance: number;
  currency: string;
  institution?: string;
  card_last4?: string;
  card_expiry?: string;
  card_network?: string;
  interest_rate?: number;
  maturity_date?: string;
  is_virtual: boolean;
  confidence: string;
}

export interface ParseAccountScreenshotsRequest {
  file_ids: string[];
}

export interface ParseAccountScreenshotsResponse {
  accounts: ParsedAccount[];
  total_count: number;
  total_balance_by_currency: Record<string, number>;
}

// Portfolio Screenshot Parsing Types
export interface ParsedPortfolioHolding {
  ticker: string;
  name?: string;
  asset_type: 'stock' | 'etf' | 'crypto' | 'bond' | 'other';
  quantity: number;
  purchase_price: number;
  current_price: number;
  currency: string;
  total_value?: number;
  total_cost?: number;
  gain_loss?: number;
  gain_loss_percent?: number;
  confidence: string;
}

export interface ParsePortfolioScreenshotsRequest {
  file_ids: string[];
}

export interface ParsePortfolioScreenshotsResponse {
  holdings: ParsedPortfolioHolding[];
  total_count: number;
  total_value: number;
  total_cost: number;
  total_gain_loss: number;
}

// Subscription Screenshot Parsing Types
export interface ParsedSubscription {
  name: string;
  description?: string;
  amount: number;
  currency: string;
  frequency: 'monthly' | 'quarterly' | 'biannually' | 'annually';
  category?: string;
  next_payment_date?: string;
  status: 'active' | 'expired' | 'cancelled';
  provider?: string;
  confidence: string;
}

export interface ParseSubscriptionScreenshotsRequest {
  file_ids: string[];
}

export interface ParseSubscriptionScreenshotsResponse {
  subscriptions: ParsedSubscription[];
  total_count: number;
  active_count: number;
  monthly_total: number;
  annual_total: number;
}

// Installment Screenshot Parsing Types
export interface ParsedInstallment {
  name: string;
  description?: string;
  total_amount: number;
  amount_per_payment: number;
  currency: string;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  number_of_payments: number;
  payments_made: number;
  remaining_balance?: number;
  start_date?: string;
  next_payment_date?: string;
  category?: string;
  status: 'active' | 'completed';
  provider?: string;
  confidence: string;
}

export interface ParseInstallmentScreenshotsRequest {
  file_ids: string[];
}

export interface ParseInstallmentScreenshotsResponse {
  installments: ParsedInstallment[];
  total_count: number;
  active_count: number;
  total_debt: number;
  monthly_payment: number;
}

// Tax Presets Types
export interface TaxPreset {
  name: string;
  description: string;
  rate: number;
  tax_type: 'percentage' | 'fixed';
  frequency: 'monthly' | 'quarterly' | 'annually';
  is_deductible: boolean;
  category: 'Income' | 'Social' | 'Property' | 'Business' | 'Healthcare' | 'Pension' | 'Other';
  notes?: string;
}

export interface GetTaxPresetsRequest {
  country: string;
  occupation: string;
}

export interface GetTaxPresetsResponse {
  presets: TaxPreset[];
  country: string;
  occupation: string;
  total_count: number;
  disclaimer: string;
}

// Budget Presets Types
export interface BudgetPreset {
  name: string;
  category: string;
  description: string;
  suggested_amount: number;
  period: 'monthly' | 'quarterly' | 'yearly';
  alert_threshold: number;
  reasoning: string;
  priority: 'high' | 'medium' | 'low';
}

export interface GetBudgetPresetsRequest {
  currency: string;
}

export interface GetBudgetPresetsResponse {
  presets: BudgetPreset[];
  total_count: number;
  total_suggested_monthly: number;
  analysis_summary: string;
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
    getFinancialInsights: builder.query<FinancialInsights, { forceRefresh?: boolean }>({
      query: ({ forceRefresh = false } = {}) => ({
        url: '/insights',
        params: forceRefresh ? { force_refresh: true } : {},
      }),
      providesTags: ['AIInsights'],
    }),

    // Upload multiple images for AI parsing
    uploadImages: builder.mutation<MultipleFileUploadResponse, FormData>({
      query: (formData) => ({
        url: '/upload-images',
        method: 'POST',
        body: formData,
      }),
      invalidatesTags: ['UploadedFiles'],
    }),

    // Parse income screenshots with AI Vision
    parseIncomeScreenshots: builder.mutation<ParseIncomeScreenshotsResponse, ParseIncomeScreenshotsRequest>({
      query: (body) => ({
        url: '/parse-income-screenshots',
        method: 'POST',
        body,
      }),
    }),

    // Parse account screenshots with AI Vision
    parseAccountScreenshots: builder.mutation<ParseAccountScreenshotsResponse, ParseAccountScreenshotsRequest>({
      query: (body) => ({
        url: '/parse-account-screenshots',
        method: 'POST',
        body,
      }),
    }),

    // Parse portfolio screenshots with AI Vision
    parsePortfolioScreenshots: builder.mutation<ParsePortfolioScreenshotsResponse, ParsePortfolioScreenshotsRequest>({
      query: (body) => ({
        url: '/parse-portfolio-screenshots',
        method: 'POST',
        body,
      }),
    }),

    // Parse subscription screenshots with AI Vision
    parseSubscriptionScreenshots: builder.mutation<ParseSubscriptionScreenshotsResponse, ParseSubscriptionScreenshotsRequest>({
      query: (body) => ({
        url: '/parse-subscription-screenshots',
        method: 'POST',
        body,
      }),
    }),

    // Parse installment screenshots with AI Vision
    parseInstallmentScreenshots: builder.mutation<ParseInstallmentScreenshotsResponse, ParseInstallmentScreenshotsRequest>({
      query: (body) => ({
        url: '/parse-installment-screenshots',
        method: 'POST',
        body,
      }),
    }),

    // Get AI-generated tax presets based on country and occupation
    getTaxPresets: builder.mutation<GetTaxPresetsResponse, GetTaxPresetsRequest>({
      query: (body) => ({
        url: '/tax-presets',
        method: 'POST',
        body,
      }),
    }),

    // Get AI-generated budget presets based on user's financial data
    getBudgetPresets: builder.mutation<GetBudgetPresetsResponse, GetBudgetPresetsRequest>({
      query: (body) => ({
        url: '/budget-presets',
        method: 'POST',
        body,
      }),
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
  useUploadImagesMutation,
  useParseIncomeScreenshotsMutation,
  useParseAccountScreenshotsMutation,
  useParsePortfolioScreenshotsMutation,
  useParseSubscriptionScreenshotsMutation,
  useParseInstallmentScreenshotsMutation,
  useGetTaxPresetsMutation,
  useGetBudgetPresetsMutation,
} = aiApi;
