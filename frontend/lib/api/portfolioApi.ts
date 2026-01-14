/**
 * Portfolio API endpoints using RTK Query
 */
import { apiSlice } from './apiSlice';

// Types
export interface PortfolioAsset {
  id: string;
  user_id: string;
  asset_name: string;
  asset_type?: string;
  symbol?: string;
  description?: string;
  quantity: number;
  purchase_price: number;
  current_price: number;
  currency: string;
  purchase_date: string;
  total_invested?: number;
  current_value?: number;
  total_return?: number;
  return_percentage?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Payment account integration
  payment_account_id?: string;
  auto_transact: boolean;
  // Dynamic pricing
  ticker?: string;
  use_dynamic_pricing: boolean;
  last_price_update?: string;
  price_source?: string;
  // Dividend tracking
  is_dividend_paying: boolean;
  dividend_yield?: number;
  dividend_per_share?: number;
  dividend_frequency?: string;
  next_dividend_date?: string;
  last_dividend_date?: string;
  total_dividends_received: number;
  // Dividend deposit account
  dividend_account_id?: string;
  auto_deposit_dividends: boolean;
  // Cost basis
  cost_basis?: number;
  cost_basis_method?: string;
  // Display currency fields
  display_purchase_price?: number;
  display_current_price?: number;
  display_total_invested?: number;
  display_current_value?: number;
  display_total_return?: number;
  display_currency?: string;
}

export interface PortfolioAssetCreate {
  asset_name: string;
  asset_type?: string;
  symbol?: string;
  description?: string;
  quantity: number;
  purchase_price: number;
  current_price: number;
  currency?: string;
  purchase_date: string;
  is_active?: boolean;
  // Payment account integration
  payment_account_id?: string;
  auto_transact?: boolean;
  sync_historical?: boolean;
  // Dynamic pricing
  ticker?: string;
  use_dynamic_pricing?: boolean;
  // Dividend tracking
  is_dividend_paying?: boolean;
  dividend_yield?: number;
  dividend_per_share?: number;
  dividend_frequency?: string;
  next_dividend_date?: string;
  // Dividend deposit account
  dividend_account_id?: string;
  auto_deposit_dividends?: boolean;
  // Cost basis
  cost_basis_method?: string;
}

export interface PortfolioAssetUpdate {
  asset_name?: string;
  asset_type?: string;
  symbol?: string;
  description?: string;
  quantity?: number;
  purchase_price?: number;
  current_price?: number;
  currency?: string;
  purchase_date?: string;
  is_active?: boolean;
  // Payment account integration
  payment_account_id?: string | null;
  auto_transact?: boolean;
  sync_historical?: boolean;
  // Dynamic pricing
  ticker?: string;
  use_dynamic_pricing?: boolean;
  // Dividend tracking
  is_dividend_paying?: boolean;
  dividend_yield?: number;
  dividend_per_share?: number;
  dividend_frequency?: string;
  next_dividend_date?: string;
  // Dividend deposit account
  dividend_account_id?: string | null;
  auto_deposit_dividends?: boolean;
  // Cost basis
  cost_basis_method?: string;
}

export interface PortfolioAssetListResponse {
  items: PortfolioAsset[];
  total: number;
  page: number;
  page_size: number;
}

export interface PortfolioStats {
  total_assets: number;
  active_assets: number;
  total_invested: number;
  current_value: number;
  total_return: number;
  total_return_percentage: number;
  currency: string;
  best_performer?: {
    asset_name: string;
    symbol?: string;
    return_percentage: number;
  };
  worst_performer?: {
    asset_name: string;
    symbol?: string;
    return_percentage: number;
  };
  by_asset_type: Record<string, number>;
  winners: number;
  losers: number;
  total_dividends_received: number;
  dividend_paying_assets: number;
}

export interface ListPortfolioAssetsParams {
  page?: number;
  page_size?: number;
  asset_type?: string;
  is_active?: boolean;
}

export interface AssetBatchDeleteRequest {
  ids: string[];
}

export interface AssetBatchDeleteResponse {
  deleted_count: number;
  failed_ids: string[];
}

// Transaction types
export interface PortfolioTransaction {
  id: string;
  asset_id: string;
  user_id: string;
  type: 'buy' | 'sell' | 'dividend' | 'split' | 'transfer_in' | 'transfer_out';
  quantity: number;
  price_per_unit: number;
  total_amount: number;
  fees: number;
  currency: string;
  dividend_per_share?: number;
  split_ratio?: number;
  transaction_date: string;
  shares_before?: number;
  shares_after?: number;
  account_transaction_id?: string;
  income_transaction_id?: string;
  status: string;
  notes?: string;
  created_at: string;
}

export interface PortfolioTransactionListResponse {
  items: PortfolioTransaction[];
  total: number;
  page: number;
  page_size: number;
}

export interface BuyAssetRequest {
  quantity: number;
  price_per_unit: number;
  fees?: number;
  transaction_date: string;
  notes?: string;
  withdraw_from_account?: boolean;
}

export interface SellAssetRequest {
  quantity: number;
  price_per_unit: number;
  fees?: number;
  transaction_date: string;
  notes?: string;
  deposit_to_account?: boolean;
}

export interface SellAssetResponse {
  transaction: PortfolioTransaction;
  proceeds: number;
  cost_basis_sold: number;
  realized_gain_loss: number;
  is_gain: boolean;
}

export interface RecordDividendRequest {
  amount: number;
  payment_date: string;
  dividend_per_share?: number;
  notes?: string;
  deposit_to_account?: boolean;
}

export interface UpdatePriceRequest {
  current_price: number;
}

export interface PriceUpdateResponse {
  asset_id: string;
  ticker?: string;
  old_price: number;
  new_price: number;
  price_source: string;
  updated_at: string;
  current_value: number;
  total_return: number;
  return_percentage: number;
}

export interface BulkPriceUpdateResponse {
  updated_count: number;
  failed_count: number;
  updates: PriceUpdateResponse[];
  errors: Array<{ ticker: string; error: string }>;
}

export interface TickerValidationResponse {
  ticker: string;
  price?: number;
  currency?: string;
  name?: string;
  change?: number;
  change_percent?: number;
  valid: boolean;
}

export interface TickerDividendInfo {
  ticker: string;
  dividend_yield?: number;
  dividend_rate?: number;
  ex_dividend_date?: string;
  dividend_frequency?: string;
  pays_dividend: boolean;
}

export const portfolioApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // List portfolio assets with pagination and filters
    listPortfolioAssets: builder.query<PortfolioAssetListResponse, ListPortfolioAssetsParams | void>({
      query: (params) => ({
        url: '/api/v1/portfolio',
        params: params || undefined,
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map(({ id }) => ({ type: 'Portfolio' as const, id })),
              { type: 'Portfolio', id: 'LIST' },
            ]
          : [{ type: 'Portfolio', id: 'LIST' }],
    }),

    // Get single portfolio asset
    getPortfolioAsset: builder.query<PortfolioAsset, string>({
      query: (id) => `/api/v1/portfolio/${id}`,
      providesTags: (result, error, id) => [{ type: 'Portfolio', id }],
    }),

    // Create portfolio asset
    createPortfolioAsset: builder.mutation<PortfolioAsset, PortfolioAssetCreate>({
      query: (data) => ({
        url: '/api/v1/portfolio',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: [
        { type: 'Portfolio', id: 'LIST' },
        { type: 'Portfolio', id: 'STATS' },
        { type: 'Saving', id: 'LIST' },
        'Dashboard',
      ],
    }),

    // Update portfolio asset
    updatePortfolioAsset: builder.mutation<PortfolioAsset, { id: string; data: PortfolioAssetUpdate }>({
      query: ({ id, data }) => ({
        url: `/api/v1/portfolio/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: 'Portfolio', id },
        { type: 'Portfolio', id: 'LIST' },
        { type: 'Portfolio', id: 'STATS' },
        { type: 'Saving', id: 'LIST' },
        'Dashboard',
      ],
    }),

    // Delete portfolio asset
    deletePortfolioAsset: builder.mutation<void, string>({
      query: (id) => ({
        url: `/api/v1/portfolio/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, id) => [
        { type: 'Portfolio', id },
        { type: 'Portfolio', id: 'LIST' },
        { type: 'Portfolio', id: 'STATS' },
        'Dashboard',
      ],
    }),

    // Get portfolio statistics
    getPortfolioStats: builder.query<PortfolioStats, void>({
      query: () => '/api/v1/portfolio/stats',
      providesTags: [{ type: 'Portfolio', id: 'STATS' }],
    }),

    // Batch delete portfolio assets
    batchDeleteAssets: builder.mutation<AssetBatchDeleteResponse, AssetBatchDeleteRequest>({
      query: (data) => ({
        url: '/api/v1/portfolio/batch-delete',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (result) => {
        const tags = [
          { type: 'Portfolio' as const, id: 'LIST' },
          { type: 'Portfolio' as const, id: 'STATS' },
          'Dashboard' as const,
        ];
        if (result && result.deleted_count > 0) {
          result.failed_ids.forEach(id => tags.push({ type: 'Portfolio' as const, id }));
        }
        return tags;
      },
    }),

    // Get asset transactions
    getAssetTransactions: builder.query<PortfolioTransactionListResponse, { assetId: string; page?: number; page_size?: number; type?: string }>({
      query: ({ assetId, ...params }) => ({
        url: `/api/v1/portfolio/${assetId}/transactions`,
        params,
      }),
      providesTags: (result, error, { assetId }) => [
        { type: 'Portfolio', id: `TRANSACTIONS-${assetId}` },
      ],
    }),

    // Buy more of an asset
    buyAsset: builder.mutation<PortfolioTransaction, { assetId: string; data: BuyAssetRequest }>({
      query: ({ assetId, data }) => ({
        url: `/api/v1/portfolio/${assetId}/buy`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (result, error, { assetId }) => [
        { type: 'Portfolio', id: assetId },
        { type: 'Portfolio', id: 'LIST' },
        { type: 'Portfolio', id: 'STATS' },
        { type: 'Portfolio', id: `TRANSACTIONS-${assetId}` },
        { type: 'Saving', id: 'LIST' },
        'Dashboard',
      ],
    }),

    // Sell asset
    sellAsset: builder.mutation<SellAssetResponse, { assetId: string; data: SellAssetRequest }>({
      query: ({ assetId, data }) => ({
        url: `/api/v1/portfolio/${assetId}/sell`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (result, error, { assetId }) => [
        { type: 'Portfolio', id: assetId },
        { type: 'Portfolio', id: 'LIST' },
        { type: 'Portfolio', id: 'STATS' },
        { type: 'Portfolio', id: `TRANSACTIONS-${assetId}` },
        { type: 'Saving', id: 'LIST' },
        'Dashboard',
      ],
    }),

    // Record dividend
    recordDividend: builder.mutation<PortfolioTransaction, { assetId: string; data: RecordDividendRequest }>({
      query: ({ assetId, data }) => ({
        url: `/api/v1/portfolio/${assetId}/dividend`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (result, error, { assetId }) => [
        { type: 'Portfolio', id: assetId },
        { type: 'Portfolio', id: 'STATS' },
        { type: 'Portfolio', id: `TRANSACTIONS-${assetId}` },
        { type: 'Saving', id: 'LIST' },
        'Dashboard',
      ],
    }),

    // Update price manually
    updatePriceManual: builder.mutation<PriceUpdateResponse, { assetId: string; data: UpdatePriceRequest }>({
      query: ({ assetId, data }) => ({
        url: `/api/v1/portfolio/${assetId}/update-price`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (result, error, { assetId }) => [
        { type: 'Portfolio', id: assetId },
        { type: 'Portfolio', id: 'LIST' },
        { type: 'Portfolio', id: 'STATS' },
        'Dashboard',
      ],
    }),

    // Refresh price from API
    refreshPrice: builder.mutation<PriceUpdateResponse, string>({
      query: (assetId) => ({
        url: `/api/v1/portfolio/${assetId}/refresh-price`,
        method: 'POST',
      }),
      invalidatesTags: (result, error, assetId) => [
        { type: 'Portfolio', id: assetId },
        { type: 'Portfolio', id: 'LIST' },
        { type: 'Portfolio', id: 'STATS' },
        'Dashboard',
      ],
    }),

    // Refresh all prices
    refreshAllPrices: builder.mutation<BulkPriceUpdateResponse, void>({
      query: () => ({
        url: '/api/v1/portfolio/refresh-all-prices',
        method: 'POST',
      }),
      invalidatesTags: [
        { type: 'Portfolio', id: 'LIST' },
        { type: 'Portfolio', id: 'STATS' },
        'Dashboard',
      ],
    }),

    // Validate ticker
    validateTicker: builder.query<TickerValidationResponse, string>({
      query: (ticker) => `/api/v1/portfolio/validate-ticker/${ticker}`,
    }),

    // Get ticker dividend info
    getTickerDividendInfo: builder.query<TickerDividendInfo, string>({
      query: (ticker) => `/api/v1/portfolio/ticker-dividend-info/${ticker}`,
    }),
  }),
  overrideExisting: true,
});

export const {
  useListPortfolioAssetsQuery,
  useGetPortfolioAssetQuery,
  useCreatePortfolioAssetMutation,
  useUpdatePortfolioAssetMutation,
  useDeletePortfolioAssetMutation,
  useGetPortfolioStatsQuery,
  useBatchDeleteAssetsMutation,
  useGetAssetTransactionsQuery,
  useBuyAssetMutation,
  useSellAssetMutation,
  useRecordDividendMutation,
  useUpdatePriceManualMutation,
  useRefreshPriceMutation,
  useRefreshAllPricesMutation,
  useValidateTickerQuery,
  useLazyValidateTickerQuery,
  useGetTickerDividendInfoQuery,
  useLazyGetTickerDividendInfoQuery,
} = portfolioApi;
