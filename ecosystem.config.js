module.exports = {
  apps: [{
    name: 'gov-utils',
    script: 'index.js',
    cwd: '/home/vpcommunityorganisation/CO-Gov-Utils',
    
    // Restart behavior - prevents restart storms
    max_restarts: 10,           // Max 10 restarts within exp_backoff window
    min_uptime: '30s',          // Must run 30s to count as "stable"
    restart_delay: 5000,        // Wait 5s between restarts
    exp_backoff_restart_delay: 100, // Exponential backoff: 100ms -> 200ms -> 400ms... up to 15s
    
    // Don't auto-restart on these exit codes (clean shutdown)
    stop_exit_codes: [0],
    
    // Crash protection
    autorestart: true,
    watch: false,
    
    // Logging
    error_file: '/home/vpcommunityorganisation/.pm2/logs/gov-utils-error.log',
    out_file: '/home/vpcommunityorganisation/.pm2/logs/gov-utils-out.log',
    merge_logs: true,
    
    // Environment
    env: {
      NODE_ENV: 'production'
    }
  }]
};
