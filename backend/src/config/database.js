const { PrismaClient } = require('@prisma/client');

// Single shared Prisma client instance — only Prisma may access the database,
// per Database-Standards.md.
const prisma = new PrismaClient();

module.exports = prisma;
