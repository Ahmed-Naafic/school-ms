// Shared setup for integration tests (supertest against the real Express app
// and the real dev database). Deliberately self-contained: the only
// precondition is the one-time bootstrap Super Admin seed
// (`npm run prisma:seed`), never a manually-created fixture. Every School and
// School Admin an integration test needs is created fresh, on the fly, via
// the same public API a real user would use — including completing the
// mandatory password-reset flow every new account requires (Business Rule #9,
// Authentication-and-Authorization.md), since no account is ever created with
// a password already set.
require('dotenv').config();
const request = require('supertest');
const app = require('../app');

async function loginSuperAdmin() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  // SUPER_ADMIN_BOOTSTRAP_PASSWORD is the one-time seed value only — it stops
  // matching the real account the moment its mandatory first credential
  // change happens (Business Rule #23). TEST_SUPER_ADMIN_PASSWORD tracks
  // whatever the password actually is right now; it falls back to the
  // bootstrap value for a genuinely fresh environment where no change has
  // happened yet.
  const password = process.env.TEST_SUPER_ADMIN_PASSWORD || process.env.SUPER_ADMIN_BOOTSTRAP_PASSWORD;

  const res = await request(app).post('/api/v1/auth/login').send({ email, password });

  if (!res.body.success) {
    throw new Error(
      `Could not log in the seeded Super Admin for integration tests. Set TEST_SUPER_ADMIN_PASSWORD in .env to whatever that account's password currently is (see .env.example). Response: ${JSON.stringify(res.body)}`
    );
  }

  return res.body.data.accessToken;
}

// Captures the dev-mode console-logged password-reset token (never returned
// in the API response — see auth.service.js's requestPasswordReset) so a test
// can complete the same self-service credential-setup flow a real School
// Admin would, without ever touching a real secret. Monkey-patches
// console.log directly rather than using jest.spyOn, since jest.spyOn(console,
// 'log') is unreliable under Jest's own console-management (e.g. --silent
// replaces console.log before a spy can observe calls to it).
async function captureResetToken(email, act) {
  const marker = `token for ${email}: `;
  const original = console.log;
  const lines = [];
  console.log = (...args) => {
    lines.push(args.map(String).join(' '));
  };
  try {
    await act();
  } finally {
    console.log = original;
  }
  const line = lines.find((l) => l.includes(marker));
  if (!line) {
    throw new Error(`Did not observe a password-reset token being logged for ${email}`);
  }
  return line.split(marker)[1].trim();
}

// Creates a fresh School + its first School Admin, establishes real login
// credentials for that admin via the password-reset flow, and returns a
// ready-to-use access token plus the school/account ids.
async function createTestSchoolAdmin(superAdminToken, { schoolName, adminEmail, password }) {
  const schoolRes = await request(app)
    .post('/api/v1/schools')
    .set('Authorization', `Bearer ${superAdminToken}`)
    .send({ name: schoolName, firstSchoolAdminEmail: adminEmail });

  if (!schoolRes.body.success) {
    throw new Error(`Failed to create test school "${schoolName}": ${JSON.stringify(schoolRes.body)}`);
  }
  const schoolId = schoolRes.body.data.id;

  const token = await captureResetToken(adminEmail, () =>
    request(app).post('/api/v1/auth/password-reset/request').send({ email: adminEmail })
  );

  const confirmRes = await request(app)
    .post('/api/v1/auth/password-reset/confirm')
    .send({ token, newPassword: password });

  if (!confirmRes.body.success) {
    throw new Error(`Failed to confirm password reset for ${adminEmail}: ${JSON.stringify(confirmRes.body)}`);
  }

  const loginRes = await request(app).post('/api/v1/auth/login').send({ email: adminEmail, password });

  if (!loginRes.body.success) {
    throw new Error(`Failed to log in freshly-created School Admin ${adminEmail}: ${JSON.stringify(loginRes.body)}`);
  }

  return { token: loginRes.body.data.accessToken, schoolId };
}

// Completes the mandatory initial-credential-setup flow (Business Rule #9)
// for any already-created account and logs in, returning a ready-to-use
// access token. The generic "establish credentials, then log in" tail end
// createTestSchoolAdmin also performs for a freshly created School Admin —
// pulled out separately here so other roles (e.g. a Teacher created via
// POST /teachers) can reuse it without going through school creation again.
async function establishCredentialsAndLogin(email, password) {
  const token = await captureResetToken(email, () =>
    request(app).post('/api/v1/auth/password-reset/request').send({ email })
  );

  const confirmRes = await request(app)
    .post('/api/v1/auth/password-reset/confirm')
    .send({ token, newPassword: password });

  if (!confirmRes.body.success) {
    throw new Error(`Failed to confirm password reset for ${email}: ${JSON.stringify(confirmRes.body)}`);
  }

  const loginRes = await request(app).post('/api/v1/auth/login').send({ email, password });

  if (!loginRes.body.success) {
    throw new Error(`Failed to log in ${email} after establishing credentials: ${JSON.stringify(loginRes.body)}`);
  }

  return loginRes.body.data.accessToken;
}

function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

// Same end result as createTestSchoolAdmin (a ready-to-use School Admin
// token for a freshly created school), but never touches
// /api/v1/auth/password-reset/request or /confirm — both share one
// production security rate limit (5 requests per 15 minutes, per
// Security-Standards.md's Rate Limiting and Abuse Prevention section), and
// createTestSchoolAdmin alone spends 2 of those 5 per call. A test file
// needing more than two School Admin fixtures in one run exhausts that
// budget deterministically, not flakily — this bypasses it the same way
// this project's own service-layer concurrency tests already bypass HTTP
// entirely for tests that don't need to exercise the reset flow itself.
// Calls schools.service.createSchool in-process (no rate limiter applies
// outside Express route middleware), then sets a real password hash and
// mints a real JWT directly, mirroring this project's own established
// "flip Account state via Prisma, sign the token with shared/jwt.js
// directly" live-verification technique.
async function createTestSchoolAdminDirect({ schoolName, adminEmail, password }) {
  const schoolsService = require('../features/schools/schools.service');
  const { hashPassword } = require('./password');
  const { signAccessToken } = require('./jwt');
  const prisma = require('../config/database');

  const school = await schoolsService.createSchool(
    { name: schoolName, firstSchoolAdminEmail: adminEmail },
    { id: 'test-fixture-bootstrap' }
  );

  const passwordHash = await hashPassword(password);
  const account = await prisma.account.update({
    where: { email: adminEmail },
    data: { passwordHash, status: 'ACTIVE' },
  });

  return { token: signAccessToken(account), schoolId: school.id };
}

module.exports = {
  app,
  request,
  loginSuperAdmin,
  createTestSchoolAdmin,
  createTestSchoolAdminDirect,
  establishCredentialsAndLogin,
  uniqueSuffix,
};
