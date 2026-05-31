// Login surge: 500 logins in 60 seconds.
// Target (directive §6.1): P95 < 750 ms, error rate < 1%.
//
//   k6 run -e BASE_URL=http://localhost:8000 load-tests/k6/login-surge.js

import { sleep } from 'k6';
import { BASE_URL, STUDENT_PASSWORD, emailForVU, login } from './lib.js';

export const options = {
  scenarios: {
    login_surge: {
      executor: 'per-vu-iterations',
      vus: 500,
      iterations: 1,
      maxDuration: '90s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{endpoint:login}': ['p(95)<750'],
    checks: ['rate>0.99'],
  },
};

export default function () {
  login(emailForVU(), STUDENT_PASSWORD);
  sleep(0.1);
}
