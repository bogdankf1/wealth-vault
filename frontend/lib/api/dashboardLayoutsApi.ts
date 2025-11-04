/**
 * Dashboard Layouts API endpoints using RTK Query
 */
import { apiSlice } from './apiSlice';

// Types
export interface WidgetConfig {
  id: string;
  visible: boolean;
  order: number;
}

export interface LayoutConfiguration {
  widgets: WidgetConfig[];
}

export interface DashboardLayout {
  id: string;
  user_id: string;
  name: string;
  is_active: boolean;
  is_preset: boolean;
  configuration: LayoutConfiguration;
  created_at: string;
  updated_at: string;
}

export interface DashboardLayoutCreate {
  name: string;
  configuration: LayoutConfiguration;
}

export interface DashboardLayoutUpdate {
  name?: string;
  configuration?: LayoutConfiguration;
}

export interface DashboardLayoutList {
  items: DashboardLayout[];
  total: number;
}

//API
export const dashboardLayoutsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listLayouts: builder.query<DashboardLayoutList, void>({
      query: () => '/api/v1/dashboard/layouts',
      providesTags: ['DashboardLayouts'],
    }),
    getActiveLayout: builder.query<DashboardLayout, void>({
      query: () => '/api/v1/dashboard/layouts/active',
      providesTags: ['ActiveDashboardLayout'],
    }),
    getLayout: builder.query<DashboardLayout, string>({
      query: (id) => `/api/v1/dashboard/layouts/${id}`,
      providesTags: (result, error, id) => [{ type: 'DashboardLayouts' as const, id }],
    }),
    createLayout: builder.mutation<DashboardLayout, DashboardLayoutCreate>({
      query: (layout) => ({
        url: '/api/v1/dashboard/layouts',
        method: 'POST',
        body: layout,
      }),
      invalidatesTags: ['DashboardLayouts'],
    }),
    updateLayout: builder.mutation<DashboardLayout, { id: string; data: DashboardLayoutUpdate }>({
      query: ({ id, data }) => ({
        url: `/api/v1/dashboard/layouts/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (result, error, { id }) => [
        'DashboardLayouts',
        { type: 'DashboardLayouts' as const, id },
        'ActiveDashboardLayout',
      ],
    }),
    deleteLayout: builder.mutation<void, string>({
      query: (id) => ({
        url: `/api/v1/dashboard/layouts/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['DashboardLayouts', 'ActiveDashboardLayout'],
    }),
    activateLayout: builder.mutation<DashboardLayout, string>({
      query: (id) => ({
        url: `/api/v1/dashboard/layouts/${id}/activate`,
        method: 'POST',
      }),
      invalidatesTags: ['DashboardLayouts', 'ActiveDashboardLayout'],
    }),
    initializePresets: builder.mutation<DashboardLayoutList, void>({
      query: () => ({
        url: '/api/v1/dashboard/layouts/presets/initialize',
        method: 'POST',
      }),
      invalidatesTags: ['DashboardLayouts', 'ActiveDashboardLayout'],
    }),
  }),
});

export const {
  useListLayoutsQuery,
  useGetActiveLayoutQuery,
  useGetLayoutQuery,
  useCreateLayoutMutation,
  useUpdateLayoutMutation,
  useDeleteLayoutMutation,
  useActivateLayoutMutation,
  useInitializePresetsMutation,
} = dashboardLayoutsApi;
