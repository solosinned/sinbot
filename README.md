# sinbot

A Discord bot with economy, fishing, lootboxes, and more!

## Setup

1. Install dependencies: `npm install`
2. Set environment variables (on Railway or your hosting platform):
	- `BOT_EMAIL` - Bot account email
	- `BOT_PASSWORD` - Bot account password
	- `BOT_PREFIX` - Command prefix (default: `s!`)
	- `OWNER_ID` - Your user ID for owner-only commands
	- `OPENAI_API_KEY` - OpenAI API key for AI commands

3. Start the bot: `npm start`

## Data Persistence (IMPORTANT)

**The `economy.json` file stores all user data (coins, fish, items, stats, etc.).**

To prevent data loss when updating the bot:

### On Railway:
1. Go to your Railway project
2. Navigate to your service's settings
3. Add a **Volume** pointing to `/app` (or the app directory)
4. This ensures `economy.json` persists between deploys

### On Other Platforms:
- Use persistent storage/volumes to keep the app directory alive
- Don't delete `economy.json` during updates
- The file is automatically created and updated when the bot runs

### Git:
- `economy.json` is in `.gitignore` and should NOT be committed
- This prevents accidental data loss from version control

## Commands

Use `s!help` or `!help` to see all commands in-game.

### Examples:
- `s!fish` - Catch a fish
- `s!shop` - View the shop
- `s!buy starterbox` - Buy a lootbox
- `s!stats @user` - View a user's stats
- `s!joke` - Get a random joke
- `s!dev` - Owner dev menu