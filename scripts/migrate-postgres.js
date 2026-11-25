const { createDatabase } = require('../src/data/database');

if (!process.env.DATABASE_URL_UNPOOLED) {
  console.error('missing DATABASE_URL_UNPOOLED: use Neon Connect with pooling disabled; see .env.example');
  process.exit(1);
}

const db = createDatabase(null, process.env.DATABASE_URL_UNPOOLED);
(async () => {
  await db.ready();
  await db.close();
  console.log('Postgres migration complete.');
})().catch((error) => {
  console.error('Postgres migration failed:', error.message);
  process.exit(1);
});
