const app = require('./app');
const env = require('./config/env');

app.listen(env.port, () => {
  console.log(`School Management System backend listening on port ${env.port}`);
});
