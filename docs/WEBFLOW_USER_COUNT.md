# Displaying Clerk User Count in Webflow

This guide explains how to display the total number of users from Clerk in your Webflow marketing site using a JavaScript embed.

## Overview

The solution uses:
1. A public API endpoint: `https://app.harvous.com/api/stats/user-count`
2. JavaScript in a Webflow Embed element to fetch and display the count
3. Dynamic text updates without page refreshes

## Step 1: Add Target Element in Webflow

1. In Webflow Designer, add a **Text** element where you want the user count to appear
2. Give it an ID: `user-count` (or any ID you prefer)
3. Optionally add placeholder text like "1,000+" or "Loading..."

## Step 2: Add JavaScript Embed

1. Add an **Embed** element near your target text element (or in the page footer)
2. Paste the following JavaScript code:

```html
<script>
  (function() {
    // Configuration
    const API_URL = 'https://app.harvous.com/api/stats/user-count';
    const TARGET_ELEMENT_ID = 'user-count'; // Change this to match your element ID
    
    // Format number with commas (e.g., 1234 -> "1,234")
    function formatNumber(num) {
      return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    
    // Update the element with the count
    function updateUserCount(count) {
      const element = document.getElementById(TARGET_ELEMENT_ID);
      if (element) {
        element.textContent = formatNumber(count);
      }
    }
    
    // Fetch user count from API
    async function fetchUserCount() {
      try {
        const response = await fetch(API_URL);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.count !== undefined) {
          updateUserCount(data.count);
        } else {
          console.error('[User Count] Invalid response format:', data);
          // Don't update - leave existing text (e.g., "50+") unchanged
        }
      } catch (error) {
        console.error('[User Count] Error fetching count:', error);
        // Don't update - leave existing text (e.g., "50+") unchanged
      }
    }
    
    // Wait for DOM to be ready, then fetch
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fetchUserCount);
    } else {
      fetchUserCount();
    }
  })();
</script>
```

## Step 3: Customize

### Change Target Element

If your element has a different ID, update this line:
```javascript
const TARGET_ELEMENT_ID = 'your-element-id';
```

### Change API URL

If your app is hosted elsewhere, update:
```javascript
const API_URL = 'https://your-domain.com/api/stats/user-count';
```

### Custom Formatting

To add a "+" suffix for large numbers:
```javascript
function formatNumber(num) {
  const formatted = num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return num >= 1000 ? formatted + '+' : formatted;
}
```

### Add Loading State

To show "Loading..." while fetching:
```javascript
function updateUserCount(count) {
  const element = document.getElementById(TARGET_ELEMENT_ID);
  if (element) {
    if (count === null) {
      element.textContent = 'Loading...';
    } else {
      element.textContent = formatNumber(count);
    }
  }
}

// Set loading state initially
updateUserCount(null);
```

## Step 4: Test

1. **Preview in Webflow**: The count should load when you preview the page
2. **Check Browser Console**: Open DevTools to see any errors
3. **Verify API**: Test the endpoint directly: `https://app.harvous.com/api/stats/user-count`

## Alternative: Using Custom Attributes

If you prefer using Webflow's custom attributes feature, you can:

1. Add a custom attribute `data-user-count` to your text element
2. Use JavaScript to update the attribute:
```javascript
function updateUserCount(count) {
  const element = document.getElementById(TARGET_ELEMENT_ID);
  if (element) {
    element.setAttribute('data-user-count', count);
    element.textContent = formatNumber(count);
  }
}
```

However, note that custom attributes are primarily for data binding, not for updating text content. The JavaScript approach above is more straightforward for this use case.

## Troubleshooting

### Count Not Appearing

- **Check element ID**: Ensure the JavaScript `TARGET_ELEMENT_ID` matches your element's ID exactly
- **Check console**: Open browser DevTools (F12) → Console tab for errors
- **Verify API**: Test `https://app.harvous.com/api/stats/user-count` directly in browser
- **CORS issues**: The endpoint should allow cross-origin requests (already configured)

### API Returns 0

- Check that `CLERK_SECRET_KEY` is configured in your production environment
- Verify the endpoint is accessible (should return `{ count: number }`)

### Styling Issues

- The JavaScript only updates text content, not styling
- Use Webflow's native styling tools to style the element
- The element will inherit your Webflow text styles

## API Response Format

The endpoint returns:
```json
{
  "count": 1234
}
```

Or on error:
```json
{
  "count": 0,
  "error": "Failed to fetch user count"
}
```

## Caching

The API endpoint caches responses for 5 minutes to reduce load on Clerk's API. The count will update automatically when the cache expires.

## Security

- The endpoint is public (no authentication required)
- It only returns the total count, no user data
- Rate limiting is handled by Clerk's API
