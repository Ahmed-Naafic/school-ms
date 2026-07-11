// One-time platform bootstrap script (Authentication-and-Authorization.md
// Business Rule #23). Run via `npm run prisma:seed`. Not an HTTP endpoint —
// deliberately outside the normal application/request pipeline, per the
// Technical Design's Architecture section.
require('dotenv').config();
const { bootstrapSuperAdmin } = require('../src/features/auth/auth.service');

async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_BOOTSTRAP_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'SUPER_ADMIN_EMAIL and SUPER_ADMIN_BOOTSTRAP_PASSWORD must be set to run the bootstrap seed.'
    );
  }

  const result = await bootstrapSuperAdmin({ email, password });

  if (result.created) {
    console.log(`Bootstrap Super Admin created: ${email}`);
    console.log('This account must change its credentials on first login.');
  } else {
    console.log('A Super Admin account already exists. Bootstrap skipped (idempotent).');
  }
}

main()
  .catch((error) => {
    console.error('Bootstrap seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const prisma = require('../src/config/database');
    await prisma.$disconnect();
  });
