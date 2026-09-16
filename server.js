import { createApp } from './src/app.js';
import { env } from './src/config/env.js';

const app = createApp();

app.listen(env.PORT, env.HOST, () => {
  console.log(`API running at http://${env.HOST}:${env.PORT}`);
});
