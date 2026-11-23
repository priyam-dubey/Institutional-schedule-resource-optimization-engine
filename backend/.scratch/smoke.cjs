const { PrismaClient } = require('./client/wasm.js');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const depts = await prisma.department.findMany({ include: { institution: true, programs: true } });
  console.log(JSON.stringify(depts.map(d => ({ code: d.code, inst: d.institution.code, programs: d.programs.map(p => p.code) }))));
  console.log('subjects', await prisma.subject.count(), 'rooms', JSON.stringify((await prisma.room.findMany({ select: { roomNumber: true, equipment: true } }))[0]));
  await prisma.$disconnect(); await pool.end();
})().catch(e => { console.error('FAIL', e.message.slice(0, 400)); process.exit(1); });
