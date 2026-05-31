// Heartbeat enqueue throughput: ~500 req/s, 1-20 events/request.
// Target (directive §6.1 / §13.3): API P99 < 200 ms, accepted error < 0.5%.
//
// Each VU logs in once, joins the exam, then streams heartbeat batches. Every
// ~10th batch is re-sent verbatim to exercise client_event_id idempotency.
//
//   k6 run -e BASE_URL=http://localhost:8000 \
//          -e SCHEDULED_SESSION_ID=<id> load-tests/k6/heartbeat-throughput.js

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
    heartbeat: {
      executor: 'constant-arrival-rate',
      rate: 500,
      timeUnit: '1s',
      duration: '60s',
      preAllocatedVUs: 200,
      maxVUs: 800,
    },
  },
  thresholds: {
    'http_req_failed{endpoint:heartbeat}': ['rate<0.005'],
    'http_req_duration{endpoint:heartbeat}': ['p(99)<200'],
    checks: ['rate>0.99'],
  },
};

const EVENT_TYPES = ['ANSWER_CHANGE', 'FLAG_TOGGLE', 'NAVIGATION'];

function randomBatch() {
  const n = 1 + Math.floor(Math.random() * 20);
  const events = [];
  for (let i = 0; i < n; i++) {
    const type = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
    events.push({
      client_event_id: uuidv4(),
      event_type: type,
      payload:
        type === 'ANSWER_CHANGE'
          ? { answer: `choice-${Math.floor(Math.random() * 4)}` }
          : type === 'FLAG_TOGGLE'
          ? { flagged: true }
          : { to: Math.floor(Math.random() * 10) },
    });
  }
  return { events };
}

// Per-VU session, established once. k6 keeps `init`-scope mutable state per VU
// across iterations within the same VU, so we lazily log in + join.
let sessionId = null;
let token = null;
let lastBatch = null;

export default function () {
  if (!token) {
    token = login(emailForVU(), STUDENT_PASSWORD);
    if (!token) return;
    const joinRes = http.post(
      `${BASE_URL}/api/student/sessions/${SCHEDULED_SESSION_ID}/join`,
      null,
      { ...authHeaders(token), tags: { endpoint: 'join' } },
    );
    if (joinRes.status === 200 || joinRes.status === 201) {
      sessionId = joinRes.json().id;
    }
  }
  if (!sessionId) return;

  // Re-send the previous batch ~10% of the time to test idempotency.
  const body = lastBatch && Math.random() < 0.1 ? lastBatch : randomBatch();
  lastBatch = body;

  const res = http.post(
    `${BASE_URL}/api/sessions/${sessionId}/heartbeat`,
    JSON.stringify(body),
    { ...authHeaders(token), tags: { endpoint: 'heartbeat' } },
  );
  check(res, { 'heartbeat accepted': (r) => r.status === 200 });
}
