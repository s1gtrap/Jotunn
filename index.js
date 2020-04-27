const Discord = require('discord.js');
const {
    prefix,
    token,
} = require('./config.json');
const ytdl = require('ytdl-core');
const { getInfo } = require('ytdl-getinfo');
const { Client } = require('pg');

//Database client
const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: true,
});

const bot = new Discord.Client();
const defaultVolume = 100;

bot.once("ready", () => {
    console.log("Ready!");
});

//Login to Discord with token
bot.login(token);

//Song queues for servers (ServerID, Construct)
const serverMap = new Map();

bot.on("message", async message => {
    //Owner of message is bot
    if(message.author.bot) return;

    //Message is not intended for bot
    if(message.content.substring(0, 1) !== prefix) return;

    const args = message.content.substring(1).split(' ');
    const cmd = args[0].toLowerCase();

    const serverQueue = serverMap.get(message.guild.id);

    switch (cmd) {
        case "setname":
            setName(message);
            break;
        case "history":
            history(message);
            break;
        case "join":
            join(message, serverQueue);
            break;
        case "play":
            execute(message, serverQueue);
            break;
        case "skip":
            skip(message, serverQueue);
            break;
        case "dc":
            joinAFKChannel(message.guild.id);
            break;
        case "volume":
            volume(message, serverQueue);
            break;
        case "earrape":
            earRape(message, serverQueue);
            break;
        case "loop":
            loop(message, serverQueue);
            break;
        case "queue":
            queue(message, serverQueue);
            break;
        case "clear":
            clear(message, serverQueue);
            break;
        case "remove":
            remove(message, serverQueue);
            break;
        case "drawmelikeoneofyourfrenchgirls":
            drawMe(message);
            break;
        case "setafkchannel":
            setAFKChannel(message);
            break;
        case "test":
            test(message);
            break;
        case "toggleafkmusic":
            toggleAFKMusic(message);
            break;
        case "setafksong":
            setAFKSong(message);
            break;
    }
});

function test(message){
    message.channel.send(message.member.voice.channel.id.toString());
    joinAFKChannel(message.member.voice.channel.id.toString());
}

//Set nickname of user in channel
function setName(message) {
    const args = message.content.split(' ');

    if(args.length < 3) {
        return message.channel.send(`Bad format. Usage: ${prefix}setname [@User] [nickname]`);
    }

    //Get userID from message
    const userID = args[1].replace('<@!', '').replace('>', '');
    //Get nickname from message
    const nickname = args.slice(2).join(' ');

    //Users are not allowed to change their own name
    if(message.author.id === userID) {
        return message.channel.send("<@!" + userID + "> er en pølse");
    }

    //Change nickname
    message.guild.member(userID).setNickname(nickname).then((member) => {
        //Check if success
        if(member.nickname !== nickname) {
            return message.channel.send("Failed to change name");
        }
    });

    //Connect to database
    client.connect();

    //Add name to database and then disconnect
    client.query(`INSERT INTO History (UserID, Nickname, Namer) VALUES('${userID}', '${nickname}', '${message.author.id}');`)
        .catch((error) => console.log(error));

    return message.channel.send("Successfully changed name")
}

function modifySettings(message, query) {
    const serverID = message.guild.id.toString();

    //Check if server already exists in settings table
    client.connect();
    client.query(`SELECT 1 FROM Settings WHERE ID='${serverID}'`)
        .then((res) => {
            //Insert if not present already
            if(res.rows.length < 1) {
                client.query(`INSERT INTO Setttings (ID) VALUES('${serverID}')`)
                    .catch((err) => {
                        console.log("Failed db setup on serverID");
                        console.log(err);
                    })
            }
        }).catch((err) => {
            console.log(err);
            return false;
        });

    //Send requested query to database
    client.query(query)
        .catch((err) => {
            console.log(err);
            return false;
        });
    return true;
}

function setAFKChannel(message) {
    const serverID = message.guild.id.toString();
    const voiceChannel = message.member.voice.channel.id;
    if(!voiceChannel) return message.channel.send("You need to be in channel to set this as the AFK channel");

    if(modifySettings(message, `INSERT INTO Settings (AFKChannel) VALUES('${voiceChannel.toString()}') WHERE ID='${serverID}';`)) {
        return message.channel.send("Successfully set AFK channel");
    } else {
        return message.channel.send("Failed to set AFK channel");
    }
}

function getChannel(channelID) {
    bot.channels.fetch(channelID).then((res) => { return res });
}

function toggleAFKMusic(message) {
    const serverID = message.guild.id.toString();

    let toggle = 0;

    client.connect();
    client.query(`SELECT AFKMusic FROM Settings WHERE ID='${serverID}'`)
        .then((res) =>
            console.log(res);
            if(res.rows[0].afkmusic == 0) {
                toggle = 1;
            }

            client.query(`INSERT INTO Settings (AFKMusic) VALUES ('${toggle}') WHERE ID='${serverID}'`)
                .then(() => {
                    if(toggle === 0){
                        return message.channel.send("AFKMusic is now off");
                    } else {
                        return message.channel.send("AFKMusic is now on");
                    }
                })
                .catch((err) => {
                    console.log(err);
                    return message.channel.send("Failed to toggle AFKMusic");
            });
        }).catch((err) => {
            console.log(err);
            return message.channel.send("Failed to toggle AFKMusic");
    });
}

function setAFKSong(message) {
    const serverID = message.guild.id.toString();
    const searchTerm = message.content.substr(12).trim();

    client.connect();
    client.query(`INSERT INTO Settings (AFKSong) VALUES ('${searchTerm}') WHERE ID='${serverID}'`)
        .then(() => {
            return message.channel.send("Successfully set afk song");
        })
        .catch((err) => {
            console.log("Failed to set afk song: ");
            console.log(err);
            return message.channel.send("Failed to set afk song")
        });
}

async function joinAFKChannel(serverID) {
    client.connect();

    let songTerm;
    const serverQueue = serverMap.get(serverID);

    await client.query(`SELECT AFKChannel, AFKSong, AFKMusic FROM Settings WHERE ID='${serverID}'`)
        .then((res) => {
            if(res.rows[0].afkmusic != 1) return;
            const AFKChannelID = res.rows[0].afkchannel;
            const voiceChannel = getChannel(AFKChannelID);
            songTerm = res.rows[0].afksong;

            serverQueue.afk = true;
            serverQueue.loop = true;
            serverQueue.playing = true;
            serverQueue.voiceChannel = voiceChannel;

            voiceChannel.join();

            if(!songTerm.includes("https://")) {
                songTerm = "ytsearch:" + songTerm;
            }
        }).catch((err) => {
            console.log("Failed to fetch afk channel: ");
            console.log(err);
    });

    //Create new song object
    const song = {
        title: null,
        url: null,
    };

    //Get song info from ytdl
    await getInfo(songTerm, [], true).then((info) => {
        song.title = info.items[0].title;
        song.url = info.items[0].webpage_url;
        console.log(`Song added: ${song.title}`);
        console.log(song);
    }).catch((err) => {
        console.log(err);
        console.log(`Could not find any song matching ${songTerm}`);
    });

    if(song.title === null || song.url === null) {
        console.log(`Could not find any song matching ${songTerm}`)
    }

    serverQueue.songs[0] = song;

    const guild = bot.guilds.cache.get(serverID);

    play(guild, serverQueue.songs[0]);
}

function history(message) {
    const args = message.content.split(' ');

    if(args.length < 2) {
        return message.channel.send(`Bad format. Usage: ${prefix}history [@User] OPTIONAL[length]`);
    }

    //Get userID from message
    const userID = args[1].replace('<@!', '').replace('>', '');

    let length = 5;

    //Allow custom history length
    if(args.length > 2) {
        length = parseInt(args[2]);
    }

    //History message string builder
    let msg = "";

    //Connect to database
    client.connect();

    //Get results from db and then disconnect
    client.query(`SELECT Nickname FROM History WHERE UserID='${userID}';`)
        .then((res) => {
            //If wished length is more than result length, set length to result length
            if(length > res.rows.length) {
                length = res.rows.length;
            }

            //Get last n entries
            for(let i = res.rows.length - length; i < res.rows.length; i++) {
                msg += res.rows[i].nickname + "\n"
            }

            //Print history
            return message.channel.send(msg);
        }).catch((err) => {
            console.log(err);
            return message.channel.send("Failed to retrieve history");
        });
}

//Join voice channel and play music
async function execute(message, serverQueue) {
    const args = message.content.split(' ');

    //Check if the user is in a voice channel
    const voiceChannel = message.member.voice.channel;
    if(!voiceChannel) return message.channel.send("You need to be in a voice channel to play music you dumb dumb.");

    //Check if the bot has permissions to join/speak in channel
    const permissions = voiceChannel.permissionsFor(message.client.user);
    if(!permissions.has("CONNECT") || !permissions.has("SPEAK")) {
        return message.channel.send("I need permission to join and speak in your channel.")
    }

    let msg;

    message.channel.send("Searching...").then((m) => {
        msg = m;
    });

    //Create new song object
    const song = {
        title: null,
        url: null,
    };

    const request = message.content.substr(6).trim();
    let searchTerm = request;

    if(!request.includes("https://")) {
        searchTerm = "ytsearch:" + searchTerm;
    }

    //Get song info from ytdl
    await getInfo(searchTerm, [], true).then((info) => {
        song.title = info.items[0].title;
        song.url = info.items[0].webpage_url;
        console.log(`Song added: ${song.title}`);
        console.log(song);
    }).catch((err) => {
        console.log(err);
        return msg.edit(`Could not find any song matching ${searchTerm}`);
    });

    if(song.title === null || song.url === null) {
        return msg.edit(`Could not find any song matching ${searchTerm}`)
    }


    //Check if we are already connected
    if(!serverQueue || serverQueue.afk) {
        //If not, create new queueConstruct. This holds all information about current session
        const queueConstruct = {
            textChannel: message.channel,
            voiceChannel: voiceChannel,
            connection: null,
            songs: [],
            volume: 100,
            playing: true,
            loop: false,
            afk: false,
        };

        //Add this server session to list of all sessions
        serverMap.set(message.guild.id, queueConstruct);

        //Push requested song to this sessions queue
        queueConstruct.songs.push(song);

        //Try joining voice channel
        try {
            queueConstruct.connection = await voiceChannel.join();
            //Play music
            play(message.guild, queueConstruct.songs[0]);
            return msg.edit(`Now playing: ${song.title}`);
        } catch (err) {
            console.log(err);
            serverMap.delete(message.guild.id);
            return msg.edit(err);
        }
    } else {
        //We are already in a voice channel
        //Push song to song queue
        serverQueue.songs.push(song);
        //If not playing anything play this song
        if(!serverQueue.playing) {
            play(message.guild, serverQueue.songs[0]);
            serverQueue.playing = true;
            return msg.edit(`Now playing: ${song.title}`);
        }
        return msg.edit(`${song.title} has been added to the queue!`);
    }
}

//Join voice channel without playing any music
async function join(message, serverQueue) {
    const voiceChannel = message.member.voice.channel;
    if(!voiceChannel) return message.channel.send("You need to be in a voice channel to play music you dumb dumb.");

    const permissions = voiceChannel.permissionsFor(message.client.user);
    if(!permissions.has("CONNECT") || !permissions.has("SPEAK")) {
        return message.channel.send("I need permission to join and speak in your channel.")
    }

    if(!serverQueue) {
        const queueConstruct = {
            textChannel: message.channel,
            voiceChannel: voiceChannel,
            connection: null,
            songs: [],
            volume: defaultVolume,
            playing: false,
            loop: false,
        };

        serverMap.set(message.guild.id, queueConstruct);

        try {
            queueConstruct.connection = await voiceChannel.join();
        } catch (err) {
            console.log(err);
            serverMap.delete(message.guild.id);
            return message.channel.send(err);
        }
    } else {
        return message.channel.send("Already in a voice channel");
    }
}

//Skip to next song if any
function skip(message, serverQueue) {
    if(!message.member.voice.channel) return message.channel.send("You have to be in a voice channel to skip");
    if(!serverQueue) return message.channel.send("There is no song to skip!");
    serverQueue.songs.shift();
    play(message.guild, serverQueue.songs[0]);
}

//Disconnect from voice channel
function disconnect(message, serverQueue) {
    if(!message.member.voice.channel) return message.channel.send("You have to be in a voice channel to disconnect the bot");
    serverQueue.voiceChannel.leave();
    //Delete this server session from list of sessions
    serverMap.delete(message.guild.id);
}

//Handles playing song in voice channels
function play(guild, song) {
    //Get this server's music session data
    const serverQueue = serverMap.get(guild.id);

    //No song to play, so just return
    if(!song) {
        serverQueue.playing = false;
        return;
    }

    //Create dispatcher to play song from ytdl
    const dispatcher = serverQueue.connection.play(ytdl(song.url, {
        filter: "audioonly",
        highWaterMark: 1<<20, //We need a higher than usual buffer or else songs will end prematurely
    }))
        .on('finish', () => { //Current song has ended, so play the next song
            console.log("Music ended");
            if(!serverQueue.loop) {
                serverQueue.songs.shift(); //If not looping, shift queue, so we can play next song in line
            }
            play(guild, serverQueue.songs[0]); //Play next song in queue
        })
        .on('error', error => {
            console.error(error);
        });
    dispatcher.setVolumeLogarithmic(serverQueue.volume / defaultVolume);
}

function volume(message, serverQueue) {
    if(!message.member.voice.channel) return message.channel.send("You have to be in a voice channel to set volume");
    const args = message.content.split(' ');

    try {
        //Read volume from arguments
        const vol = parseInt(args[1]);
        //Volume must be between 0 and default
        if(vol < 0 || vol > defaultVolume) {
            return message.channel.send("Volume must be between 0 and " + defaultVolume);
        }
        //Update construct volume
        serverQueue.volume = vol;
        //Update played volume
        serverQueue.connection.dispatcher.setVolumeLogarithmic(serverQueue.volume / defaultVolume);
        return message.channel.send("Successfully set volume to " + serverQueue.volume + "");
    } catch (err) {
        return message.channel.send("Failed to set volume");
    }
}

function earRape(message, serverQueue) {
    if(!message.member.voice.channel) return message.channel.send("You have to be in a voice channel to earRape");

    //Increase volume to 2000%
    try {
        serverQueue.volume = defaultVolume * 20;
        serverQueue.connection.dispatcher.setVolumeLogarithmic(serverQueue.volume / defaultVolume);
        return message.channel.send("!!!BEN!!!");
    } catch (err) {
        return message.channel.send("Failed to !!!BEN!!!");
    }
}

function loop(message, serverQueue) {
    if(!message.member.voice.channel) return message.channel.send("You have to be in a voice channel to loop");

    //Toggle looping
    serverQueue.loop = !serverQueue.loop;

    return message.channel.send("Looping: " + serverQueue.loop);
}

//Displays all song in queue
function queue(message, serverQueue) {
    if(!message.member.voice.channel) return message.channel.send("You have to be in a voice channel to view the queue");

    //Special message if no songs in queue
    if(serverQueue.songs.length < 1) return message.channel.send("No songs in queue");

    let msg = "";

    //Build queue string
    serverQueue.songs.forEach((song) => {
        msg += "\n" + song.title;
    });

    return message.channel.send("Queue: " + msg);
}

//Clears song queue
function clear(message, serverQueue) {
    if(!message.member.voice.channel) return message.channel.send("You have to be in a voice channel to clear the queue");

    //Clear the queue
    serverQueue.songs = [];
    return message.channel.send("Queue cleared");
}

//Removes specific song from queue
function remove(message, serverQueue) {
    if(!message.member.voice.channel) return message.channel.send("You need to be in a voice channel to edit the queue");
    
    //Remove ".remove " from message
    const songName = message.content.substr(8).trim();

    const prevLength = serverQueue.songs.length;

    //Filter songs that match the song name
    serverQueue.songs = serverQueue.songs.filter(function(song) {
        return song.title !== songName;
    });

    //If length is not changed song(s) were not removed
    if(serverQueue.length === prevLength) {
        return message.channel.send(`Failed to remove ${songName} from the queue`);
    }

    //Song(s) were removed
    return message.channel.send(`Successfully removed ${songName} from the queue`);
}

function drawMe(message) {
    return message.channel.send("``,,......,,**/(%%#######(((((((#%%%%####((/**/(((((%%#/,,//,.    \n" +
        "/(((////(((#####(//////////***//((((((((////(####%%%(/**/*,.    \n" +
        "#%%%%%%%%%##((/******************/***********/((#######(#(/**,..\n" +
        "&&&&&&%%%%#(/*************////////*,,**********////((#%%%%###(*,\n" +
        "&%%%%%###((/*******//***/////////*******////////*****/(#%%&&&%#/\n" +
        "%%###((((//*****/////////((((////////////((////********//(#%&&&#\n" +
        "##(((/////****///(((((((((((((/////////((((((////*********(#%&&%\n" +
        "##((/********//((((((((#((((((////((((((((##((////*********/(%&%\n" +
        "((((/********///(((#(((((/////////((((((((###((((//******,**/#%%\n" +
        "&%((/*,********//((##(((////***////((((((((##(((((//*****,,*/(%&\n" +
        "@@%(*******,,,*/(((###((//*****/////(((((((#####((///********(#&\n" +
        "@@%(/////*,.,*/(((((#((((///**//((((((##########((/////******/#&\n" +
        "@@#(((((/****/((((((((((((((((((((##############((///////////(#&\n" +
        "%#/**/((////(((((((((((##########################((((((((((((#%&\n" +
        "**,,*//((/((((((((((((((#########################((((((((((###%&\n" +
        ",,...*/((//((((((((((/((((#######################((((((((((###%&\n" +
        "    .*/(///////////(((((((((##################((((((((((((####%&\n" +
        "     ,*//////////(((((((((((((#############(((((((((((#((((((#%&\n" +
        "     .,///***////((((((((((((((###########((((((((/((((//***/(%&\n" +
        "      .*//*,.,,***********//((###########((((((((((((/**,,,*/(%&\n" +
        "       .//*,............,,**((##########(((((/////////**,,,*(##%\n" +
        "        ,//*,,..........,**/((####(##((((/////////////**,,,*(#(/\n" +
        "        .*//***///*****///(((((((((((((////////***//****,..,*/*.\n" +
        "        .*/////(((((((((((((((((((((/////////**********,....,,,,\n" +
        "         ,////((((((((((((((((((((//////////**********,,..,,****\n" +
        "        .*////((((((((((((((((/((//////////******/***,,.,*////**\n" +
        "         ,*///((((((((((((///////////////******///***,,,*/((////\n" +
        "          ,****//////////////////*******/////////**,,,,,********\n" +
        "             ...,,,,,***/////**********//////////****,,,,,,,..,.``")
}
