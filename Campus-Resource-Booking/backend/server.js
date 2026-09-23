require('dotenv').config();

const app = require('./app');
const connectDB = require('./config/db');
const assertSecureConfig = require('./config/assertSecureConfig');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  // Fail fast: never boot with a missing or placeholder JWT secret. Starting
  // anyway is what lets an attacker forge tokens (see the security review).
  assertSecureConfig();

  await connectDB();

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
};

startServer();
