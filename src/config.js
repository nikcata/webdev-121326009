function validateRequiredEnvironment() {
  const required = ['DATABASE_URL', 'SESSION_SECRET'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    console.error(`missing ${missing.join(', ')}: see .env.example`);
    process.exit(1);
  }
}

module.exports = { validateRequiredEnvironment };
