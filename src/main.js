const commandLineArgs          = require('command-line-args');
const logger                   = require('winston');

const ConfigFile               = require('./ConfigFile');

const ITunesPlaylistCollection = require('./ITunesPlaylistCollection');
const PlexImporter             = require('./PlexImporter');

const optionDefinitions = [
	{ name: 'verbose', alias: 'v', type: Boolean },
	{ name: 'debug', alias: 'd', type: Boolean },
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

logger.add(logger.transports.File, {
	colorize: false,
	json: false,
	prettyPrint: true,
	level: 'debug',
	filename: 'playlist.log'
});

logger.info('Loading iTunes XML: ' + options.config.itunesxml);
var itunesPlaylists = new ITunesPlaylistCollection(options.config.itunesxml);
logger.info('Found ' + itunesPlaylists.length + ' iTunes playlists.  Starting sync...');

if (!options.config.stripPrefixes) {
	options.config.stripPrefixes = [];
}
if (itunesPlaylists.prefix && options.config.stripPrefixes.indexOf(itunesPlaylists.prefix) === -1) {
	options.config.stripPrefixes.push(itunesPlaylists.prefix);
}

var failures = [];
let plex = new PlexImporter(options.config, {
	onFailure: function(song) {
		"use strict";	
		//logger.warn('Failed to import ' + song.toString());
		failures.push(song);
	}
});

plex.setLogger(logger);

var getSyncCallback = function(itunesPlaylist) {
	"use strict";
	return plex.sync(itunesPlaylist, itunesPlaylist.name);
};

var p = Promise.resolve();
for (const itunesPlaylist of itunesPlaylists) {
	/* jshint loopfunc: true */
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