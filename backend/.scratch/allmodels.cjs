const { PrismaClient, Prisma } = require('./client/wasm.js');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const models = Object.keys(Prisma.ModelName);
  let bad = 0;
  for (const m of models) {
    const key = m[0].toLowerCase() + m.slice(1);
    try { await prisma[key].findMany({ take: 1 }); console.log('ok  ', m); }
    catch (e) { bad++; console.log('FAIL', m, e.message.split('\n').filter(Boolean).pop()); }
  }
  console.log(models.length + ' models checked, ' + bad + ' failing');
  await prisma.$disconnect(); await pool.end(); process.exit(bad ? 1 : 0);
})();
