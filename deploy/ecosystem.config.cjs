// PM2 ecosystem config for GNNcab
// Usage:
//   pm2 start deploy/ecosystem.config.cjs
//   pm2 reload gnncab-api --update-env
//   pm2 save && pm2 startup

module.exports = {
  apps: [
    {
      name:          "gnncab-api",
      script:        "./artifacts/api-server/dist/index.cjs",
      cwd:           "/var/www/gnncab",

      // Realtime delivery is only correctness-safe in single-worker mode
      // unless Redis pub/sub is provisioned and configured.
      instances:     1,
      exec_mode:     "fork",

      // Environment
      env_production: {
        NODE_ENV:      "production",
        PORT:          3000,
        // DATABASE_URL, JWT_SECRET, ALLOWED_ORIGINS are loaded from .env
        // (pm2 reads .env automatically when env_file is set, or use dotenv)
      },

      // Restart policy
      watch:          false,           // never watch files in production
      max_memory_restart: "512M",      // restart if heap exceeds 512 MB
      restart_delay:  3000,            // 3 s between restarts
      exp_backoff_restart_delay: 100,  // exponential back-off for crash loops
      max_restarts:   10,

      // Graceful shutdown — give in-flight requests 10 s to finish
      kill_timeout:   10000,
      wait_ready:     true,            // wait for process.send('ready')
      listen_timeout: 8000,

      // Logging (PM2 log rotate plugin handles rotation)
      error_file:     "/var/log/gnncab/pm2-error.log",
      out_file:       "/var/log/gnncab/pm2-out.log",
      merge_logs:     true,
      log_date_format:"YYYY-MM-DD HH:mm:ss Z",

      // Environment file (pm2 >= 5 supports env_file)
      env_file: "/var/www/gnncab/.env",
    },
  ],
};
