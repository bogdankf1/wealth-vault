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
} = portfolioApi;
