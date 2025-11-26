# Rate Limiting and JSON Parsing: Lessons Learned

## Overview

This document captures the lessons learned from a comprehensive audit and fix of rate limiting and JSON parsing issues that were discovered after a soft launch. The issues were found through systematic debugging and a thorough code review.

## Issues Discovered

### 1. Missing Rate Limiting on Write Endpoints

**Problem**: 13 write endpoints were missing rate limiting protection, leaving them vulnerable to abuse.

**Root Cause**: Rate limiting was implemented incrementally as new endpoints were added, but not all endpoints were updated. There was no systematic process to ensure all write endpoints had rate limiting.

**Endpoints Fixed**:
- `POST /api/tags/create`
- `DELETE /api/tags/delete`
- `POST /api/notes/[id]/remove-thread`
- `POST /api/spaces/[spaceId]/add-thread`
- `POST /api/spaces/[spaceId]/add-note`
- `POST /api/spaces/[spaceId]/add-items`
- `POST /api/spaces/[spaceId]/remove-items`
- `POST /api/notes/[id]/update-content`
- `POST /api/note-tags/assign`
- `DELETE /api/note-tags/remove`
- `POST /api/user/update-church`
- `POST /api/inbox/archive`
- `POST /api/inbox/unarchive`

### 2. Missing Imports

**Problem**: `src/pages/api/threads/create.ts` was missing imports for `rateLimitMiddleware` and `getClientIP`, causing runtime errors.

**Root Cause**: The rate limiting code was added but the imports were forgotten.

**Fix**: Added `import { rateLimitMiddleware, getClientIP } from '@/utils/rate-limit';`

### 3. Missing State Variable Declaration

**Problem**: `src/components/react/navigation/MobileNavigation.tsx` was calling `setIsExiting(false)` but the state variable `isExiting` was never declared.

**Root Cause**: State variable was removed or never added, but the setter was still being called.

**Fix**: Added `const [isExiting, setIsExiting] = useState(false);`

### 4. Fragile JSON Parsing

**Problem**: Multiple endpoints had fragile JSON parsing that would throw unhandled errors when:
- The value was `null`
- The value was an empty string
- The value was whitespace-only
- The value was not a valid JSON array

**Root Cause**: Assumed input would always be valid JSON without validation.

**Endpoints Fixed**:
- `POST /api/threads/create.ts` - `selectedNoteIds` parsing
- `POST /api/threads/update.ts` - `selectedNoteIds` parsing
- `POST /api/spaces/create.ts` - `selectedNoteIds` and `selectedThreadIds` parsing
- `POST /api/webflow/webhook.ts` - `rawBody` parsing

**Fix Pattern**:
```typescript
let selectedNoteIds: string[] = [];
if (selectedNoteIdsStr) {
  const trimmed = selectedNoteIdsStr.trim();
  if (trimmed.length === 0) {
    selectedNoteIds = [];
  } else if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      selectedNoteIds = JSON.parse(trimmed);
      if (!Array.isArray(selectedNoteIds)) {
        console.error('selectedNoteIds is not an array after parsing');
        selectedNoteIds = [];
      }
    } catch (e) {
      console.error('Error parsing selectedNoteIds:', e);
      selectedNoteIds = [];
    }
  } else {
    console.error('selectedNoteIds does not appear to be a JSON array:', trimmed);
    selectedNoteIds = [];
  }
}
```

## Why These Issues Were Missed

### 1. Incremental Implementation
- Rate limiting was added to endpoints as they were created, but older endpoints were not retroactively updated
- No systematic audit was performed before launch

### 2. Documentation Gap
- `docs/API.md` listed rate-limited endpoints, but the implementation was not fully aligned
- No checklist or process to ensure new endpoints included rate limiting

### 3. Testing Gaps
- Edge cases for JSON parsing were not tested (null, empty strings, malformed JSON)
- Rate limiting was not tested on all endpoints
- Missing imports and state variables were not caught by TypeScript (in some cases) or linting

### 4. Code Review Process
- No systematic review checklist for API endpoints
- Focus was on feature functionality, not security and robustness

## Prevention Strategies

### 1. API Endpoint Checklist

**For every new API endpoint, ensure**:
- [ ] Authentication check is present
- [ ] Rate limiting is added (for write operations)
- [ ] Input validation is performed
- [ ] JSON parsing has error handling
- [ ] Error responses are consistent
- [ ] Imports are complete
- [ ] TypeScript types are correct

### 2. Automated Checks

**Consider implementing**:
- Pre-commit hook to check for rate limiting on write endpoints
- Linter rule to flag missing rate limiting imports
- Test coverage for edge cases (null, empty, malformed JSON)
- TypeScript strict mode (already enabled)

### 3. Code Templates

**Create API endpoint template**:
```typescript
import type { APIRoute } from 'astro';
import { rateLimitMiddleware, getClientIP } from '@/utils/rate-limit';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // 1. Authentication
    const { userId } = locals.auth();
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. Rate limiting (for write operations)
    const ip = getClientIP(request);
    const rateLimit = rateLimitMiddleware(userId, '/api/endpoint', 'write', ip);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ 
        error: rateLimit.error,
        code: 'RATE_LIMIT_EXCEEDED'
      }), {
        status: 429,
        headers: { 
          'Content-Type': 'application/json',
          'X-RateLimit-Remaining': String(rateLimit.remaining || 0),
          'X-RateLimit-Reset': String(rateLimit.resetTime || Date.now())
        }
      });
    }

    // 3. Input validation and parsing
    // ... rest of endpoint logic
  } catch (error: any) {
    return handleAPIError(error);
  }
};
```

### 4. Systematic Audits

**Before each release**:
- [ ] Audit all write endpoints for rate limiting
- [ ] Check all JSON parsing for error handling
- [ ] Verify all imports are present
- [ ] Test edge cases (null, empty, malformed input)
- [ ] Review error handling consistency

### 5. Documentation Updates

**Keep documentation in sync**:
- Update `docs/API.md` when adding rate limiting
- Document rate limit values and behavior
- Include examples of error responses

## Systematic Audit Process

The audit that found these issues followed this process:

1. **Initial Error Discovery**: User reported errors during soft launch
2. **Root Cause Analysis**: Traced errors to missing imports and fragile JSON parsing
3. **Pattern Recognition**: Identified that multiple endpoints might have similar issues
4. **Systematic Search**: Used grep to find all API endpoints
5. **Categorization**: Separated read vs write operations
6. **Verification**: Checked each write endpoint for rate limiting
7. **JSON Parsing Review**: Searched for all `JSON.parse` calls and verified error handling
8. **Comprehensive Fix**: Applied fixes to all identified issues

## Key Takeaways

1. **Incremental changes need systematic review**: When adding features incrementally, periodically audit the entire codebase for consistency
2. **Edge cases matter**: Always handle null, empty, and malformed input gracefully
3. **Security is not optional**: Rate limiting should be on all write endpoints by default
4. **Documentation helps**: Keep API documentation in sync with implementation
5. **Automation prevents mistakes**: Consider automated checks for common patterns
6. **Testing edge cases**: Test with null, empty strings, and malformed JSON
7. **Code review checklists**: Use checklists to ensure nothing is missed

## Future Improvements

1. **Pre-commit hooks**: Add checks for rate limiting on write endpoints
2. **API endpoint template**: Create a template with all required patterns
3. **Automated testing**: Add tests for rate limiting and JSON parsing edge cases
4. **Documentation automation**: Generate API docs from code annotations
5. **Monitoring**: Add alerts for rate limit violations and JSON parsing errors

## Related Documentation

- `docs/API.md` - API endpoint documentation
- `src/utils/rate-limit.ts` - Rate limiting implementation
- `src/utils/error-handling.ts` - Error handling utilities

