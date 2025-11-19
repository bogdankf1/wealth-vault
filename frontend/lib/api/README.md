# API Retry Logic Documentation

## Overview

The API slice includes comprehensive retry logic with exponential backoff to handle transient network errors and temporary service issues gracefully.

## Features

### 1. Automatic Retry with Exponential Backoff
- **Max Retries**: 3 attempts per request
- **Backoff Strategy**: Exponential (1s, 2s, 4s)
- **Max Delay**: 8 seconds
- **Timeout**: 30 seconds per request

### 2. Smart Retry Logic

The system intelligently determines which errors should be retried:

#### Errors That ARE Retried:
- **Network Errors** (`FETCH_ERROR`, `TIMEOUT_ERROR`) - connectivity issues
- **Server Errors** (500-599) - temporary backend issues
- **408 Request Timeout** - request took too long
- **429 Too Many Requests** - rate limit exceeded
- **503 Service Unavailable** - service temporarily down

#### Errors That ARE NOT Retried:
- **401 Unauthorized** - invalid/expired token (triggers logout)
- **403 Forbidden** - insufficient permissions
- **400-499 Client Errors** - bad requests (except 408, 429)
- **PARSING_ERROR** - malformed response data

### 3. User Feedback

The system provides real-time feedback during retry attempts:

```
1st attempt: Silent (no notification)
2nd attempt: "Connection issue detected. Retrying... (attempt 1/3)"
3rd attempt: "Connection issue detected. Retrying... (attempt 2/3)"
4th attempt: "Connection issue detected. Retrying... (attempt 3/3)"

On Success: "Connection restored!" (if retried)
On Failure: Error-specific message
```

### 4. Error-Specific Messages

After all retries are exhausted, users see context-specific error messages:

- **401**: "Your session has expired. Please sign in again." + auto-logout
- **403**: "You do not have permission to access this resource."
- **429**: "Too many requests. Please slow down and try again."
- **503**: "Service temporarily unavailable. Please try again later."
- **500+**: "Server error occurred. Please try again later."
- **Network**: "Unable to connect to the server. Please check your internet connection."

## Implementation Details

### Code Structure

```typescript
// 1. Determine if error should be retried
const shouldRetry = (error: FetchBaseQueryError): boolean => {
  // Returns true for retryable errors, false otherwise
}

// 2. Base query with timeout
const baseQuery = fetchBaseQuery({
  timeout: 30000, // 30 seconds
  // ... other config
})

// 3. Retry wrapper with exponential backoff
const baseQueryWithRetry = retry(
  async (args, api, extraOptions) => {
    // Handles retry logic and user feedback
  },
  {
    maxRetries: 3,
    backoff: async (attempt) => {
      // Exponential: 1s, 2s, 4s
    }
  }
)

// 4. Error handler wrapper
const baseQueryWithAuth = async (args, api, extraOptions) => {
  // Handles specific error codes and cleanup
}
```

## Usage Examples

### Standard API Call (Automatic Retry)

```typescript
// All API calls automatically include retry logic
const { data, error, isLoading } = useGetIncomeSourcesQuery();

// If the request fails with a retryable error:
// - Automatically retries up to 3 times
// - Shows retry progress to user
// - Shows success message if recovered
// - Shows error message if all retries fail
```

### Mutation with Retry

```typescript
const [createIncome, { isLoading, error }] = useCreateIncomeSourceMutation();

// Mutations also benefit from retry logic
await createIncome(newIncome);

// Handles network errors gracefully with automatic retries
```

## Best Practices

### 1. Let the System Handle Retries
Don't implement manual retry logic in components - the API slice handles it automatically.

❌ **Don't do this:**
```typescript
const handleSubmit = async () => {
  let retries = 3;
  while (retries > 0) {
    try {
      await createIncome(data);
      break;
    } catch {
      retries--;
    }
  }
}
```

✅ **Do this:**
```typescript
const handleSubmit = async () => {
  try {
    await createIncome(data).unwrap();
    toast.success('Income created!');
  } catch (error) {
    // Error already handled by API slice
    // Toast already shown to user
  }
}
```

### 2. Handle Critical Operations Carefully

For critical operations (e.g., payments), consider whether automatic retry is appropriate:

```typescript
// The retry logic is smart enough to NOT retry client errors (400-499)
// So payment validation errors won't be retried
```

### 3. Monitor Retry Behavior

Watch the toast notifications during development to ensure retry behavior is appropriate for your use case.

## Configuration

### Modifying Retry Behavior

To adjust retry settings, edit `/lib/api/apiSlice.ts`:

```typescript
const baseQueryWithRetry = retry(
  // ... implementation
  {
    maxRetries: 3,  // Change max attempts
    backoff: async (attempt) => {
      // Customize delay calculation
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    },
  }
);
```

### Adding Custom Retry Logic per Endpoint

For specific endpoints that need different retry behavior:

```typescript
export const customApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    criticalOperation: builder.mutation({
      query: (data) => ({
        url: '/critical',
        method: 'POST',
        body: data,
      }),
      // RTK Query will use the global retry settings
      // To disable retry for this endpoint, handle it in shouldRetry()
    }),
  }),
});
```

## Testing Retry Logic

### Simulating Network Errors

1. **Browser DevTools**:
   - Open Network tab → Set throttling to "Offline"
   - Trigger API call → Watch retry attempts

2. **Backend Down**:
   - Stop backend server
   - Use the app → See retry notifications

3. **Slow Network**:
   - Set throttling to "Slow 3G"
   - Watch timeout and retry behavior

### Expected Behavior

```
[Network goes offline]
User clicks "Create Income"
→ Loading spinner shows
→ After 1s: "Connection issue detected. Retrying... (attempt 1/3)"
→ After 2s more: "Connection issue detected. Retrying... (attempt 2/3)"
→ After 4s more: "Connection issue detected. Retrying... (attempt 3/3)"
→ "Unable to connect to the server. Please check your internet connection."

[Network comes back online]
User clicks "Create Income" again
→ Request succeeds immediately
→ Toast: "Income created!"
```

## Troubleshooting

### Issue: Too many retry notifications
**Solution**: Check if you're making duplicate API calls. Each call will retry independently.

### Issue: Retries not happening
**Solution**: Check the error type. Client errors (4xx except 408, 429) are not retried by design.

### Issue: Slow response after errors
**Solution**: The exponential backoff is working correctly. Total retry time can be up to 7 seconds (1+2+4).

## Related Files

- `/lib/api/apiSlice.ts` - Main retry implementation
- `/lib/api/authApi.ts` - Authentication endpoints
- `/lib/api/*Api.ts` - All other API endpoints
