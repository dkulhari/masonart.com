# Manual Test: Health Check API

## Test Environment
- **Browser/Tool**: Postman / cURL / Browser / Thunder Client
- **API Base URL**: http://localhost:3000
- **Date**: 2026-01-16
- **Tester**: Manual QA

## Prerequisites
- [x] Dev server running at http://localhost:3000
- [ ] Load balancer configured (for production testing)
- [ ] Monitoring tools configured (optional)

## Test Cases

### TC-001: Health Check - Basic Request

**Description**: Verify health check endpoint responds successfully

**Steps**:
1. Send GET request to `/health`
2. Verify response status is 200
3. Check response contains expected fields

**Expected Result**:
- Status code: 200 OK
- Response time: < 100ms
- Content-Type: application/json
- Response body contains:
  ```json
  {
    "status": "ok",
    "timestamp": "[ISO 8601 timestamp]",
    "service": "chobi-api",
    "version": "1.0.0"
  }
  ```

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-002: Health Check - Status Field

**Description**: Verify status field indicates service health

**Steps**:
1. Send GET request to `/health`
2. Extract `status` field from response
3. Verify value is "ok"

**Expected Result**:
- Status field exists
- Value is exactly "ok" (lowercase)
- Type is string

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:
- Status value: ___________

---

### TC-003: Health Check - Timestamp Field

**Description**: Verify timestamp field contains current server time

**Steps**:
1. Note current time before request
2. Send GET request to `/health`
3. Extract `timestamp` field from response
4. Verify timestamp is recent (within 1 second)

**Expected Result**:
- Timestamp field exists
- Format is ISO 8601 with timezone (e.g., "2026-01-16T16:30:45.123Z")
- Timestamp is current (within 1 second of request time)
- Type is string

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:
- Timestamp value: ___________
- Time difference: ___ms

---

### TC-004: Health Check - Service Field

**Description**: Verify service name is correctly identified

**Steps**:
1. Send GET request to `/health`
2. Extract `service` field from response
3. Verify service name matches expected value

**Expected Result**:
- Service field exists
- Value is "chobi-api"
- Type is string

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:
- Service value: ___________

---

### TC-005: Health Check - Version Field

**Description**: Verify version field contains API version

**Steps**:
1. Send GET request to `/health`
2. Extract `version` field from response
3. Verify version follows semantic versioning format

**Expected Result**:
- Version field exists
- Format follows semantic versioning: "X.Y.Z" (e.g., "1.0.0")
- Type is string

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:
- Version value: ___________

---

### TC-006: Health Check - Response Structure

**Description**: Verify complete response structure matches schema

**Steps**:
1. Send GET request to `/health`
2. Validate response structure
3. Ensure no extra or missing fields

**Expected Result**:
- Response has exactly 4 fields: status, timestamp, service, version
- No additional fields present
- All fields are required (none are null/undefined)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-007: Health Check - No Authentication Required

**Description**: Verify health check is publicly accessible without authentication

**Steps**:
1. Send GET request to `/health` without any authentication headers
2. Verify successful response

**Expected Result**:
- Status code: 200 OK
- Response returned without authentication
- Public endpoint accessible by load balancers and monitoring tools

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-008: Health Check - Content-Type Header

**Description**: Verify correct Content-Type header in response

**Steps**:
1. Send GET request to `/health`
2. Check response headers
3. Verify Content-Type header

**Expected Result**:
- Content-Type header present
- Value is "application/json" or "application/json; charset=utf-8"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:
- Content-Type: ___________

---

### TC-009: Health Check - Response Time

**Description**: Verify health check responds quickly for monitoring purposes

**Steps**:
1. Send GET request to `/health`
2. Measure response time
3. Repeat 10 times to get average

**Expected Result**:
- Average response time < 100ms
- Maximum response time < 200ms
- Consistent performance across multiple requests

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:
- Average response time: ___ms
- Min: ___ms, Max: ___ms
- Response times: [___, ___, ___, ___, ___, ___, ___, ___, ___, ___] ms

---

### TC-010: Health Check - Concurrent Requests

**Description**: Verify health check handles multiple simultaneous requests

**Steps**:
1. Send 10 concurrent GET requests to `/health`
2. Verify all requests succeed
3. Check response times remain reasonable

**Expected Result**:
- All 10 requests return 200 OK
- All responses have correct structure
- No performance degradation
- No rate limiting applied to health endpoint

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:
- Successful requests: ___/10
- Average response time: ___ms

---

### TC-011: Health Check - High Load

**Description**: Verify health check remains responsive under load

**Steps**:
1. Send 100 requests rapidly to `/health`
2. Verify all requests succeed
3. Monitor server performance

**Expected Result**:
- All 100 requests return 200 OK
- Response times remain under 200ms
- No server errors or timeouts
- No memory leaks or resource exhaustion

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:
- Successful requests: ___/100
- Average response time: ___ms
- Max response time: ___ms

---

### TC-012: Health Check - HTTP Methods

**Description**: Verify only GET method is supported

**Steps**:
1. Send GET request to `/health` (should succeed)
2. Send POST request to `/health` (should fail)
3. Send PUT request to `/health` (should fail)
4. Send DELETE request to `/health` (should fail)
5. Send PATCH request to `/health` (should fail)

**Expected Result**:
- GET: 200 OK
- POST: 405 Method Not Allowed
- PUT: 405 Method Not Allowed
- DELETE: 405 Method Not Allowed
- PATCH: 405 Method Not Allowed
- Allow header indicates: GET, HEAD, OPTIONS

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:
- POST: ___
- PUT: ___
- DELETE: ___
- PATCH: ___

---

### TC-013: Health Check - OPTIONS Method (CORS Preflight)

**Description**: Verify OPTIONS method for CORS preflight requests

**Steps**:
1. Send OPTIONS request to `/health`
2. Check response headers

**Expected Result**:
- Status code: 200 or 204
- CORS headers present (if CORS enabled):
  - Access-Control-Allow-Origin
  - Access-Control-Allow-Methods
  - Access-Control-Allow-Headers

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-014: Health Check - HEAD Method

**Description**: Verify HEAD method returns headers without body

**Steps**:
1. Send HEAD request to `/health`
2. Verify headers are returned
3. Verify no response body

**Expected Result**:
- Status code: 200 OK
- Headers same as GET request
- No response body (Content-Length: 0 or no body)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-015: Health Check - Invalid Query Parameters

**Description**: Verify health check ignores query parameters

**Steps**:
1. Send GET request to `/health?foo=bar&test=123`
2. Verify normal response

**Expected Result**:
- Status code: 200 OK
- Query parameters ignored
- Same response as without parameters

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-016: Health Check - Cache Headers

**Description**: Verify appropriate cache headers for health endpoint

**Steps**:
1. Send GET request to `/health`
2. Check cache-related headers

**Expected Result**:
- Cache-Control header indicates no caching:
  - "no-cache, no-store, must-revalidate"
  - Or "max-age=0"
- Prevents caching of health status

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:
- Cache-Control: ___________

---

### TC-017: Health Check - Custom Headers

**Description**: Verify health check works with various request headers

**Steps**:
1. Send GET request with User-Agent header
2. Send GET request with Accept: application/json
3. Send GET request with Accept: text/html
4. Verify responses are consistent

**Expected Result**:
- Status code: 200 OK for all requests
- Response always JSON regardless of Accept header
- Custom headers don't affect response

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-018: Health Check - Server Uptime

**Description**: Verify health check can indicate service availability

**Steps**:
1. Restart the server
2. Immediately send GET request to `/health`
3. Verify service responds

**Expected Result**:
- Status code: 200 OK
- Service responds immediately after startup
- Health check is one of first routes to be ready

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:
- Time to first successful health check: ___ms

---

### TC-019: Health Check - Load Balancer Health Probe

**Description**: Verify health check suitable for load balancer health probes

**Steps**:
1. Configure load balancer to use `/health` endpoint
2. Monitor load balancer health check status
3. Verify service marked as healthy

**Expected Result**:
- Load balancer successfully probes endpoint
- Service marked as healthy
- Consistent 200 responses
- Response time acceptable for health probe interval

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-020: Health Check - Monitoring Integration

**Description**: Verify health check can be used by monitoring tools

**Steps**:
1. Configure monitoring tool (Uptime Robot, Pingdom, DataDog, etc.)
2. Set up health check monitoring on `/health`
3. Verify monitoring works correctly

**Expected Result**:
- Monitoring tool successfully checks endpoint
- Alerts triggered if endpoint fails
- Historical uptime data collected

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-021: Health Check - Different Environments

**Description**: Verify health check works across environments

**Steps**:
1. Test health check on development server
2. Test health check on staging server (if available)
3. Test health check on production server (if available)

**Expected Result**:
- Status code: 200 OK in all environments
- Service name consistent
- Version may differ between environments
- Response format consistent

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:
- Development: ___
- Staging: ___
- Production: ___

---

### TC-022: Health Check - IPv4 and IPv6

**Description**: Verify health check accessible via IPv4 and IPv6

**Steps**:
1. Send GET request to http://127.0.0.1:3000/health (IPv4)
2. Send GET request to http://[::1]:3000/health (IPv6)
3. Send GET request to http://localhost:3000/health (hostname)

**Expected Result**:
- Status code: 200 OK for all addresses
- Consistent responses
- No network-related errors

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:
- IPv4: ___
- IPv6: ___
- Hostname: ___

---

### TC-023: Health Check - Browser Access

**Description**: Verify health check accessible via web browser

**Steps**:
1. Open web browser
2. Navigate to http://localhost:3000/health
3. Verify JSON response displayed

**Expected Result**:
- Browser displays JSON response
- Response formatted (if browser has JSON viewer)
- No CORS errors in browser console

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-024: Health Check - cURL Access

**Description**: Verify health check accessible via cURL

**Steps**:
1. Execute: `curl http://localhost:3000/health`
2. Execute: `curl -i http://localhost:3000/health` (with headers)
3. Execute: `curl -v http://localhost:3000/health` (verbose)

**Expected Result**:
- JSON response returned
- Headers displayed with -i flag
- Verbose output shows connection details

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

**cURL Examples**:
```bash
# Basic request
curl http://localhost:3000/health

# With headers
curl -i http://localhost:3000/health

# Verbose output
curl -v http://localhost:3000/health

# Measure response time
curl -w "Response time: %{time_total}s\n" -o /dev/null -s http://localhost:3000/health
```

---

### TC-025: Health Check - JSON Parsing

**Description**: Verify response is valid JSON and can be parsed

**Steps**:
1. Send GET request to `/health`
2. Parse response as JSON
3. Verify no parsing errors

**Expected Result**:
- Response is valid JSON
- Can be parsed by JSON libraries
- No syntax errors

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-026: Health Check - Timestamp Precision

**Description**: Verify timestamp includes millisecond precision

**Steps**:
1. Send multiple GET requests to `/health`
2. Extract timestamps
3. Verify millisecond precision

**Expected Result**:
- Timestamps include milliseconds
- Format: YYYY-MM-DDTHH:mm:ss.sssZ
- Timestamps change between requests

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:
- Sample timestamps:
  - ___________
  - ___________
  - ___________

---

### TC-027: Health Check - Consistent Responses

**Description**: Verify health check returns consistent data

**Steps**:
1. Send 10 GET requests to `/health`
2. Compare responses (excluding timestamp)
3. Verify all fields except timestamp are identical

**Expected Result**:
- Status always "ok"
- Service name always "chobi-api"
- Version always "1.0.0" (or current version)
- Only timestamp varies between requests

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-028: Health Check - Special Characters in Headers

**Description**: Verify health check handles unusual request headers

**Steps**:
1. Send GET request with special characters in custom headers
2. Send GET request with very long header values
3. Verify normal response

**Expected Result**:
- Status code: 200 OK
- Health check not affected by unusual headers
- No server errors or crashes

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-029: Health Check - Request Size Limit

**Description**: Verify health check handles large request bodies (if any)

**Steps**:
1. Send GET request with body (unusual for GET)
2. Verify response

**Expected Result**:
- Status code: 200 OK
- Body ignored (GET requests shouldn't have bodies)
- No errors

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-030: Health Check - Documentation

**Description**: Verify health check is documented

**Steps**:
1. Check API documentation
2. Verify health endpoint is documented
3. Check if response format is specified

**Expected Result**:
- Health endpoint documented
- Response format clearly specified
- Purpose explained (monitoring, load balancer probes)
- Examples provided

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

## Issues Found

| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| | | | |

## Summary
- Total Test Cases: 30
- Passed: ___
- Failed: ___
- Blocked: ___
- Pass Rate: ___%

## Notes
- Health check endpoint: `/health`
- No authentication required (public endpoint)
- Expected response time: < 100ms (optimal for health probes)
- Used by load balancers, monitoring tools, and deployment health checks
- Should never cache responses
- Must be highly reliable and available
- Timestamp format: ISO 8601 with UTC timezone
- Service name: "chobi-api"
- Current version: "1.0.0"

## Integration Examples

### Load Balancer Configuration
```yaml
health_check:
  path: /health
  interval: 10s
  timeout: 2s
  healthy_threshold: 2
  unhealthy_threshold: 3
```

### Kubernetes Liveness Probe
```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 10
```

### Docker Healthcheck
```dockerfile
HEALTHCHECK --interval=10s --timeout=2s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
```

### Monitoring Script
```bash
#!/bin/bash
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health)
if [ $RESPONSE -eq 200 ]; then
  echo "Service is healthy"
  exit 0
else
  echo "Service is unhealthy (HTTP $RESPONSE)"
  exit 1
fi
```
