module.exports = {
  apps: [
    {
      name: "css-store",
      cwd: __dirname,
      script: "./node_modules/next/dist/bin/next",
      args: "start --hostname 127.0.0.1 --port 3068",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      time: true,
      env: {
        NODE_ENV: "production",
        PORT: "3068",
        HOSTNAME: "127.0.0.1",
      },
    },
  ],
};
