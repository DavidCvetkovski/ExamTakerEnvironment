// Submission burst: 500 submissions in 120 seconds.
// Target (directive §6.1): P95 < 1500 ms, grading failures logged + isolated.
//
// Each VU logs in, joins, sends one answer batch, then submits.
//
//   k6 run -e BASE_URL=http://localhost:8000 \
//          -e SCHEDULED_SESSION_ID=<id> load-tests/k6/submission-burst.js

import { check, sleep } from 'k6';
import http from 'k6/http';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
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
    submission_burst: {
      executor: 'per-vu-iterations',
      vus: 500,
      iterations: 1,
      maxDuration: '150s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{endpoint:submit}': ['p(95)<1500'],
    checks: ['rate>0.99'],
  },
};

export default function () {
  const token = login(emailForVU(), STUDENT_PASSWORD);
  if (!token) return;

  const joinRes = http.post(
    `${BASE_URL}/api/student/sessions/${SCHEDULED_SESSION_ID}/join`,
    null,
    { ...authHeaders(token), tags: { endpoint: 'join' } },
  );
  if (joinRes.status !== 200 && joinRes.status !== 201) return;
  const sessionId = joinRes.json().id;

  http.post(
    `${BASE_URL}/api/sessions/${sessionId}/heartbeat`,
    JSON.stringify({
      events: [
        { client_event_id: uuidv4(), event_type: 'ANSWER_CHANGE', payload: { answer: 'choice-1' } },
      ],
    }),
    { ...authHeaders(token), tags: { endpoint: 'heartbeat' } },
  );
  sleep(0.2);

  const res = http.post(
    `${BASE_URL}/api/sessions/${sessionId}/submit`,
    null,
    { ...authHeaders(token), tags: { endpoint: 'submit' } },
  );
  check(res, { 'submit ok': (r) => r.status === 200 });
}
