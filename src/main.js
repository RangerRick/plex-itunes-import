const commandLineArgs          = require('command-line-args');
const logger                   = require('winston');
const Queue                    = require('promise-queue');

const ConfigFile               = require('./ConfigFile');

const ITunesPlaylistCollection = require('./ITunesPlaylistCollection');
const PlexPlaylistCollection   = require('./PlexPlaylistCollection');
const PlexImporter             = require('./PlexImporter');
const PlexIndexer              = require('./PlexIndexer');
const PlexServer               = require('./PlexServer');

const util      = require('./util');

const optionDefinitions = [
	{ name: 'verbose', alias: 'v', type: Boolean },
	{ name: 'debug', alias: 'd', type: Boolean },
	{ name: 'silly', alias: 's', type: Boolean },
	{ name: 'config', alias: 'c', type: ConfigFile }
];

const options = commandLineArgs(optionDefinitions);

function die(err) {
	"use strict";
	console.error("Error: " + err);
	process.exit(1);
}

if (!options.config) {
	options.config = new ConfigFile('config.yaml');
}

if (!options.config)           { die("No configuration found!");    }
if (!options.config.hostname)  { die("Hostname not configured!");     }
if (!options.config.itunesxml) { die("ITunes XML not configured!"); }

logger.colorize = true;
logger.json = false;

if (options.config.verbose || options.verbose) {
	logger.level = 'verbose';
}
if (options.config.debug || options.debug) {
	logger.level = 'debug';
}
if (options.config.silly || options.silly) {
	logger.level = 'silly';
}
if (!options.config.stripPrefixes) {
	options.config.stripPrefixes = [];
}

logger.add(logger.transports.File, {
	colorize: false,
	json: false,
	prettyPrint: true,
	level: 'silly',
	filename: 'playlist.log'
});

var failures = [];
let server = new PlexServer(options.config);
let plex = new PlexImporter(server, {
	onFailure: function(song) {
		"use strict";	
		//logger.warn('Failed to import ' + song.toString());
		failures.push(song);
	}
});

plex.setLogger(logger);

process.on('unhandledRejection', (error, promise) => {
	console.error('Unhandled rejection:');
	console.error(JSON.stringify(error));
	console.error(JSON.stringify(promise));
	process.exit(1);
});

logger.info('Loading iTunes XML: ' + options.config.itunesxml);
var itunesPlaylists = new ITunesPlaylistCollection(options.config.itunesxml);
logger.info('Found ' + itunesPlaylists.length + ' iTunes playlists.  Starting sync...');

if (itunesPlaylists.prefix && options.config.stripPrefixes.indexOf(itunesPlaylists.prefix) === -1) {
	options.config.stripPrefixes.push(itunesPlaylists.prefix);
}

let indexer = new PlexIndexer(server);

indexer.index().then(async () => {
	let promises = [];
	for (const itunesPlaylist of itunesPlaylists) {
		//logger.info(itunesPlaylist.name);
		await indexer.syncPlaylist(itunesPlaylist);
	}
	logger.info('Sync complete.');
	process.exit(0);
}).catch((err) => {
	logger.error('Failed to sync iTunes to Plex.', err);
	process.exit(1);
});

/*
indexer.index().then(() => {
	console.log('finished indexing');


	for (const itunesPlaylist of itunesPlaylists) {
		for (const song of itunesPlaylist) {
			indexer.match(song, options.config.stripPrefixes);
			console.log('song: ' + util.stringify(song));
			break;
		}
		break;
	}

	process.exit(0);
}, (err) => {
	console.error('error indexing',err);
	process.exit(1);
});
*/


/*
var getSyncCallback = function(itunesPlaylist) {
	"use strict";
	return plex.sync(itunesPlaylist, itunesPlaylist.name);
};

var p = Promise.resolve();
for (const itunesPlaylist of itunesPlaylists) {
	// jshint loopfunc: true
	p.then(function() {
		"use strict";
		p = getSyncCallback(itunesPlaylist);
	});
}

p.then(function() {
	"use strict";
	if (failures.length > 0) {
		logger.warn(failures.length + ' songs failed to match:');
		for (const failure of failures) {
			logger.warn('    ' + failure.toString());
		}
	}
});
*/