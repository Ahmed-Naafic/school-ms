const { verifyAccessToken } = require('../shared/jwt');
const { AuthenticationError } = require('../shared/errors');
const asyncHandler = require('../shared/async-handler');
const prisma = require('../config/database');

// Verifies the JWT access token and attaches the authenticated account to
// req.user. Every protected route sits behind this, per System-Architecture.md:
// "Every request must be authenticated unless explicitly public."
const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new AuthenticationError('Missing or invalid authorization header');
  }

  const token = header.slice('Bearer '.length);

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (error) {
    throw new AuthenticationError('Invalid or expired access token');
  }

  // Re-check current account state on every request — a revoked/deactivated/
  // locked account must lose access immediately, not just at next login,
  // per Authentication-and-Authorization.md Business Rules #12 and #18.
  const account = await prisma.account.findUnique({
    where: { id: payload.sub },
    include: { school: true },
  });

  if (!account || account.status === 'DEACTIVATED' || account.status === 'LOCKED') {
    throw new AuthenticationError('Account is not active');
  }

  // Suspending or closing a school immediately blocks every user of that
  // school except Super Admin, per School-Management.md Business Rule #5 and
  // Authentication-and-Authorization.md Business Rule #15 — enforced here so
  // it takes effect on the very next request, not just at next login.
  if (account.school && account.school.lifecycleStatus !== 'ACTIVE') {
    throw new AuthenticationError('Your school is not currently active');
  }

  req.user = {
    id: account.id,
    role: account.role,
    schoolId: account.schoolId,
    status: account.status,
  };

  next();
});

module.exports = authenticate;
