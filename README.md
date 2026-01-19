# CO | Government Utilities Bot

Advanced moderation and staff management bot with case tracking system.

## Features

### Moderation Commands
- `/warn` - Issue warnings with point tracking
- `/mute` - Timeout users with case logging
- `/unmute` - Remove mutes
- `/kick` - Kick users with case logging
- `/ban` - Ban users with case logging

### Case Management
- `/case view <id>` - View case details and edit history
- `/case edit <id>` - Edit case reason/evidence/points
- `/case delete <id>` - Soft delete (visible in deleted-history)
- `/case void <id>` - Hard delete (completely hidden)
- `/case restore <id>` - Restore deleted case

### History Commands
- `/view-history <user>` - View user's moderation history
- `/deleted-history <user>` - View user's deleted cases

### Staff Management
- `/autorole assign` - Assign government positions + Staff/Government team roles
- `/autorole remove` - Remove positions
- `/autorole list` - List all assignments
- `/autorole view` - View user's positions
- `/fire` - Remove all roles except Member role

### Investigations
- `/investigation open` - Open investigation, create channel, remove roles
- `/investigation close` - Close with outcome, archive channel
- `/investigation view` - View investigation details
- `/investigation list` - List open investigations

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure `.env`:**
   - Set `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`
   - Configure role IDs (Member, Staff Team, Government Team, etc.)
   - Set permission role IDs (Moderator, Senior Mod, Admin, HR)

3. **Initialize database:**
   ```bash
   npm run db:init
   ```

4. **Deploy commands:**
   ```bash
   npm run deploy
   ```

5. **Start bot:**
   ```bash
   npm start
   ```

## Permission Levels

| Level | Can Use |
|-------|---------|
| USER | `/help`, `/ping`, `/autorole list/view` |
| MODERATOR | + `/warn`, `/mute`, `/unmute`, `/kick`, `/case view`, `/view-history` |
| SENIOR_MOD | + `/ban`, `/case edit`, `/deleted-history`, `/investigation view/list` |
| ADMIN | + `/case delete/void/restore`, `/investigation open/close` |
| HR | + `/autorole assign/remove`, `/fire` |
| SUPERUSER | All commands |

## Database

SQLite database at `./data/moderation.db`

### Tables
- `cases` - All moderation cases
- `case_edits` - Case edit history
- `investigations` - Investigation records
- `staff_assignments` - Position assignments
- `active_mutes` - Active mute tracking
- `case_counters` - Per-guild case ID counters
- `audit_log` - Action audit trail

## Case ID Format

Cases are automatically assigned IDs in format: `CASE-0001`, `CASE-0002`, etc.

Configurable via `CASE_PREFIX` environment variable.

## Environment Variables

See `.env` file for all configuration options including:
- Discord credentials
- Role IDs (Member, Staff, Government, Investigation, Muted)
- Channel IDs (Mod Log, Case Log, Investigation Category)
- Permission role IDs
- Moderation settings (max warns, default mute duration)

## License

ISC
