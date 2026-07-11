const { AuthorizationError } = require('../shared/errors');

// Role check, per Multi-Tenancy.md's "Authorization must verify: User Role,
// User Permissions, School Ownership." Role is checked here, at the route
// level; school ownership is checked separately (see assertSameSchool) once
// the specific resource has been loaded.
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return next(new AuthorizationError());
    }
    next();
  };
}

// Tenant ownership check. Super Admin is the only role allowed to cross
// school boundaries, per Multi-Tenancy.md. Tenant context always comes from
// the authenticated user, never from client-supplied input.
function assertSameSchool(user, resourceSchoolId) {
  if (user.role === 'SUPER_ADMIN') {
    return;
  }
  if (user.schoolId !== resourceSchoolId) {
    throw new AuthorizationError();
  }
}

module.exports = { requireRole, assertSameSchool };
