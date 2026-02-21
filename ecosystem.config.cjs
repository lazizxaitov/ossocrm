module.exports = {
  apps: [
    {
      name: "osso",
      cwd: "/var/www/osso",
      script: "npm",
      args: "run start -- -p 3000",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env_production: {
        NODE_ENV: "production",
        PORT: "3000",
      },
    },
  ],
};
