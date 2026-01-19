/**
 * Deploy Commands for CO Government Utilities Bot
 */

require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_IDS = (process.env.DEV_GUILD_IDS || process.env.DISCORD_GUILD_ID || '').split(',').filter(Boolean);

const isProduction = process.argv.includes('--production') || process.argv.includes('--prod');

async function deployCommands() {
  console.log('═'.repeat(50));
  console.log('CO Government Utilities - Command Deployment');
  console.log('═'.repeat(50));
  console.log(`Mode: ${isProduction ? 'PRODUCTION (Global)' : 'DEVELOPMENT (Guild)'}`);
  console.log(`Client ID: ${CLIENT_ID}`);
  
  if (!TOKEN || !CLIENT_ID) {
    console.error('❌ Missing DISCORD_TOKEN or DISCORD_CLIENT_ID');
    process.exit(1);
  }

  const commands = [];
  const commandsPath = path.join(__dirname, 'Commands');

  if (!fs.existsSync(commandsPath)) {
    console.error('❌ Commands folder not found');
    process.exit(1);
  }

  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    try {
      const command = require(path.join(commandsPath, file));
      if ('data' in command) {
        commands.push(command.data.toJSON());
        console.log(`✓ Loaded: ${command.data.name}`);
      }
    } catch (error) {
      console.error(`✗ Failed: ${file} - ${error.message}`);
    }
  }

  console.log(`\nTotal commands: ${commands.length}`);
  console.log('─'.repeat(50));

  const rest = new REST({ version: '10' }).setToken(TOKEN);

  try {
    if (isProduction) {
      console.log('Deploying globally...');
      const data = await rest.put(
        Routes.applicationCommands(CLIENT_ID),
        { body: commands }
      );
      console.log(`✓ Deployed ${data.length} commands globally`);
    } else {
      for (const guildId of GUILD_IDS) {
        if (!guildId.trim()) continue;
        
        console.log(`Deploying to guild: ${guildId}...`);
        try {
          const data = await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, guildId.trim()),
            { body: commands }
          );
          console.log(`✓ Guild ${guildId}: ${data.length} commands`);
        } catch (error) {
          console.error(`✗ Guild ${guildId}: ${error.message}`);
        }
      }
    }
    
    console.log('─'.repeat(50));
    console.log('Deployment complete!');
    
  } catch (error) {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  }
}

deployCommands();
