// Shared helpers for OpenVision k6 load tests.
//
// Credentials and IDs are produced by `backend/seed_load.py`, which writes a
// manifest the scripts read via environment variables. Nothing here is
// production data — all accounts use the @loadtest.local domain.

import http from 'k6/http';
import { check } from 'k6';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
export const STUDENT_COUNT = parseInt(__ENV.STUDENT_COUNT || '500', 10);
export const STUDENT_PASSWORD = __ENV.STUDENT_PASSWORD || 'loadtest-pass-123';
// The scheduled exam the seed marks active; required for join/heartbeat runs.
export const SCHEDULED_SESSION_ID = __ENV.SCHEDULED_SESSION_ID || '';

// Deterministic per-VU student email matching the seed naming scheme.
export function studentEmail(index) {
  return `load_student_${index}@loadtest.local`;
}

// Spread virtual users across the seeded student pool so we exercise distinct
// accounts (and don't trip per-account rate limits).
export function emailForVU() {
  const idx = ((__VU - 1) % STUDENT_COUNT) + 1;
  return studentEmail(idx);
}

export function login(email, password) {
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email, password }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { endpoint: 'login' },
    },
  );
  check(res, {
    'login 200': (r) => r.status === 200,
    'login returns token': (r) => !!(r.json() && r.json().access_token),
  });
  return res.status === 200 ? res.json().access_token : null;
}

export function authHeaders(token) {
  return {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  };
}
