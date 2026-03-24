module.exports = {
  apps: [
    {
      name: "animon-be",
      script: "dist/app.js",
      cwd: process.cwd(),
      instances: 1,
      exec_mode: "fork",
      watch: false,
      max_memory_restart: "300M",
      env_production: {
        NODE_ENV: "production",
        PORT: "4000"
      }
    }
  ]
};
