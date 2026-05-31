// Scheduled-exam join surge: 500 joins in 90 seconds.
// Target (directive §6.1): P95 < 1000 ms, error rate < 1%.
//
//   k6 run -e BASE_URL=http://localhost:8000 \
//          -e SCHEDULED_SESSION_ID=<id> load-tests/k6/exam-join-surge.js

import { check, sleep } from 'k6';
import http from 'k6/http';
import {
  BASE_URL,
  SCHEDULED_SESSION_ID,
  STUDENT_PASSWORD,
  authHeaders,
  emailForVU,
  login,
} from './lib.js';

export const options = {
  scenarios: {
    join_surge: {
      executor: 'per-vu-iterations',
      vus: 500,
      iterations: 1,
      maxDuration: '120s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{endpoint:join}': ['p(95)<1000'],
    checks: ['rate>0.99'],
  },
};

export function setup() {
  if (!SCHEDULED_SESSION_ID) {
    throw new Error('SCHEDULED_SESSION_ID is required (see seed_load.py manifest).');
  }
}

export default function () {
  const token = login(emailForVU(), STUDENT_PASSWORD);
  if (!token) return;

  const res = http.post(
    `${BASE_URL}/api/student/sessions/${SCHEDULED_SESSION_ID}/join`,
    null,
    { ...authHeaders(token), tags: { endpoint: 'join' } },
  );
  check(res, {
    'join ok': (r) => r.status === 200 || r.status === 201,
    'join returns session id': (r) => !!(r.json() && r.json().id),
  });
  sleep(0.1);
}
