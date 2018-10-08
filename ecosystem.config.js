 module.exports = {
    apps : [{
      name: "toltebot",
      script: "toltebot/src/index.js",
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
      }
    }]
  }