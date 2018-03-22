const fs        = require('fs');
const os        = require('os');

const PlexAPI   = require('plex-api');
const Queue     = require('promise-queue');
const Sequelize = require('sequelize');

const util      = require('./util');

const PlexPlaylist           = require('./PlexPlaylist');
const PlexPlaylistCollection = require('./PlexPlaylistCollection');
const PersistedSong          = require('./PersistedSong');

/*
const cls       = require('continuation-local-storage');
const namespace = cls.Namespace('plexdb');
Sequelize.useCLS(namespace);
*/

let _client     = null;
let _sequelize  = null;
let _logger     = null;
let _indexedAt  = new Date();

let DBSong = null;
let DBPlaylist = null;
let DBPlaylistMapping = null;

let ready = false;
let dbQueue = new Queue(1, Infinity);
let queryQueue = new Queue(4, Infinity);
let syncQueue = new Queue(1, Infinity);
let updateQueue = new Queue(1, Infinity);

const norm = function(s) {
	if (s && s.normalize) {
		return s.normalize();
	}
	return s;
}

const normInt = function(i) {
	return i? parseInt(i) : i;
}

const datesMatch = function(a, b) {
	return a && b && a.getTime() === b.getTime();
}

class PlexIndexer {
	constructor(server) {
		this.server = server;

		if (server.config.logger) {
			_logger = server.config.logger;
		} else {
			_logger = require('winston');
		}

		if (!fs.existsSync('temp')) {
			fs.mkdirSync('temp');
		}
		this._sequelize = new Sequelize('plexdb', undefined, undefined, {
			dialect: 'sqlite',
			storage: 'temp/plexdb.sqlite',
			logging: false,
			operatorsAliases: false,
		});

		DBSong = this._sequelize.define('song', {
			id: {
				type: Sequelize.UUID,
				defaultValue: Sequelize.UUIDV4,
				primaryKey: true
			},
			plexId: { type: Sequelize.STRING },
			librarySectionID: { type: Sequelize.INTEGER },
			librarySectionUUID: { type: Sequelize.UUID },
			name: { type: Sequelize.STRING },
			album: { type: Sequelize.STRING },
			artist: { type: Sequelize.STRING },
			disc: { type: Sequelize.SMALLINT },
			track: { type: Sequelize.SMALLINT },
			path: { type: Sequelize.STRING },
			filePrefix: { type: Sequelize.STRING },
			file: { type: Sequelize.STRING },
			relativeFile: { type: Sequelize.STRING },
			createdAt: { type: Sequelize.DATE },
			updatedAt: { type: Sequelize.DATE },
			indexedAt: {
				type: Sequelize.DATE,
				defaultValue: Sequelize.NOW,
			},
		});
		DBPlaylist = this._sequelize.define('playlist', {
			id: {
				type: Sequelize.UUID,
				defaultValue: Sequelize.UUIDV4,
				primaryKey: true
			},
			plexId: { type: Sequelize.STRING },
			name: { type: Sequelize.STRING },
		});
		DBPlaylistMapping = this._sequelize.define('playlist-mapping', {
			songId: { type: Sequelize.UUID },
			playlistId: { type: Sequelize.UUID },
		});

		_client = new PlexAPI(server.getClientOptions());
	}

	setLogger(logger) {
		_logger = logger;
	}

	getConfig() {
		if (this.server && this.server.config) {
			return this.server.config;
		} else {
			return {};
		}
	}

	getPrefixes() {
		if (this.server && this.server.config && this.server.config.stripPrefixes) {
			return this.server.config.stripPrefixes;
		}
		return [];
	}

	getExcludes() {
		if (this.server && this.server.config && this.server.config.excludeFolders) {
			return this.server.config.excludeFolders;
		}
		return [];
	}

	async queryPlex(path) {
		const self = this;
		_logger.debug('queueing query: ' + path);
		return new Promise((resolve,reject) => {
			queryQueue.add(async () => {
				_logger.debug('running query: ' + path);
				try {
					const res = await _client.query(path);
					_logger.debug('queryPlex result: ' + util.stringify(res));
					resolve(res);
				} catch(err) {
					_logger.error('queryPlex error: ' + util.stringify(err));
					reject(err);
				};
			});
		});
	}

	async index() {
		const self = this;
		try {
			const res = await self.queryPlex('/library/sections');
			if (res.MediaContainer && res.MediaContainer.Directory) {
				let ret = [];
				for (const entry of res.MediaContainer.Directory) {
					if (entry.agent === 'com.plexapp.agents.plexmusic' || entry.agent === 'com.plexapp.agents.lastfm') {
						ret.push(self.indexLibrary(entry));
					}
				}
				return Promise.all(ret);
			} else {
				_logger.error('index: no media container found in result: ' + util.stringify(res));
				return Promise.reject('index: got a response, but no media container found');
			}
		} catch (err) {
			_logger.error('indexLibrary: failed to query library sections: ' + util.stringify(err));
			return Promise.reject(err);
		};
	}

	async initializeDatabase() {
		if (!ready) {
			try {
				await DBSong.sync();
				await DBPlaylist.sync();
				await DBPlaylistMapping.sync();
				ready = true;
			} catch(err) {
				_logger.error('initializeDatabase: failed to initialize database: ' + util.stringify(err));
				return Promise.reject(err);
			}
		}
		return ready;
	}

	async storeTrack(library, track) {
		const self = this;
		_logger.debug('storeTrack: ' + track.key);
		//console.log('Library: ' + util.stringify(library));
		//console.log('Track: ' + util.stringify(track));
		if (track.Media && track.Media[0].Part) {
			if (track.Media[0].Part.length > 1) {
				_logger.warn('storeTrack: track ' + track.key + ' has more than one part: ' + util.stringify(track.Media[0].Part));
			}

			await self.initializeDatabase();
			return dbQueue.add(async () => {
				let songData = {
					plexId: norm(track.key),
					librarySectionID: normInt(library.key),
					librarySectionUUID: norm(library.uuid),
					name: norm(track.title),
					album: norm(track.parentTitle),
					artist: norm(track.grandparentTitle),
					disc: normInt(track.parentIndex),
					track: normInt(track.index),
					path: norm(track.key),
					file: norm(track.Media[0].Part[0].file),
					indexedAt: _indexedAt,
					createdAt: new Date(track.addedAt),
					updatedAt: new Date(track.updatedAt),
				};

				let filePrefix = undefined;
				let relativeFile = undefined;
				if (library && library.Location) {
					for (const loc of library.Location) {
						if (songData.file.startsWith(loc.path + '/')) {
							filePrefix = loc.path;
							relativeFile = songData.file.substring(loc.path.length + 1);
						}
					}
				}

				if (filePrefix && relativeFile) {
					songData.filePrefix = filePrefix;
					songData.relativeFile = relativeFile;
				}

				_logger.info('Storing: ' + songData.file);
				const song = await DBSong.findOrCreate({
					where: {
						plexId: norm(track.key)
					},
					defaults: songData
				});

				song.librarySectionID = songData.librarySectionID;
				song.librarySectionUUID = songData.librarySectionUUID;
				song.name = songData.name;
				song.album = songData.album;
				song.artist = songData.artist;
				song.disc = songData.disc;
				song.track = songData.track;
				song.path = songData.path;
				song.filePrefix = songData.filePrefix;
				song.file = songData.file;
				song.relativeFile = songData.relativeFile;
				song.createdAt = songData.createdAt;
				song.updatedAt = songData.updatedAt;
				song.indexedAt = _indexedAt;

				if (datesMatch(song.createdAt, songData.createdAt) && datesMatch(song.updatedAt, songData.updatedAt)) {
					return DBSong.update({indexedAt: _indexedAt}, { where: { plexId: songData.plexId }});
				} else {
					return DBSong.update(songData, { where: { plexId: songData.plexId }});
				}
			});
		}
		_logger.warn('storeTrack: no media for entry: ' + util.stringify(track));
		return Promise.resolve(null);
	}

	async indexFolder(library, key) {
		const self = this;
		_logger.debug('indexFolder: ' + key);

		try {
			const res = await self.queryPlex(key);
			if (res.MediaContainer && res.MediaContainer.Metadata && res.MediaContainer.size > 0) {
				const indexPromises = res.MediaContainer.Metadata.map((entry) => {
					_logger.debug('entry: ' + entry.key + ' (' + entry.title + ')');
					if (entry.type && entry.type === 'track') {
						// a track
						return self.storeTrack(library, entry);
					} else if (entry.title && entry.key) {
						// a subdirectory
						return self.indexFolder(library, entry.key);
					} else {
						_logger.debug('indexFolder: unhandled metadata: ' + util.stringify(entry));
						return null;
					}
				});
				return Promise.all(indexPromises);
			} else {
				_logger.debug('indexFolder: no media container found in result: ' + util.stringify(res));
				return Promise.reject(null);
			}
		} catch(err) {
			_logger.error('indexFolder: failed to query folder ' + key + ': ' + util.stringify(err));
			return Promise.reject(err);
		};
	}

	async indexLibrary(library) {
		const self = this;
		_logger.debug('indexLibrary: ' + library.title);
		return Promise.resolve('Skipping while testing.');

		try {
			const res = await self.queryPlex('/library/sections/' + library.key + '/folder');
			if (res.MediaContainer && res.MediaContainer.Metadata) {
				const included = res.MediaContainer.Metadata.map((entry) => {
					if (self.getExcludes().indexOf(entry.title) >= 0) {
						_logger.warn('indexLibrary: skipping sub-folder "' + entry.title + '"');
						return false;
					}
				});
				return Promise.all(included.map((entry) => {
					return self.indexFolder(library, entry.key);
				}));
			} else {
				_logger.error('indexLibrary: no media container found in result: ' + util.stringify(res));
				return Promise.reject('indexLibrary: got a response, but no media container found in result: ' + util.stringify(res));
			}
		} catch(err) {
			_logger.error('indexLibrary: failed to query library ' + library.title + ': ' + util.stringify(err));
			return Promise.reject(err);
		};
	}

	async indexPlaylists() {
		const self = this;
		_logger.debug('indexPlaylists: finding Plex playlists');
		try {
			const res = await self.queryPlex('/playlists/all?type=15&playlistType=audio');
			let playlists = new PlexPlaylistCollection();
			if (res && res.MediaContainer && res.MediaContainer.size > 0 && res.MediaContainer.Metadata) {
				playlists = new PlexPlaylistCollection(res.MediaContainer.Metadata);
			}
			_logger.info('Found ' + playlists.length + ' playlists in Plex.');
			return playlists;
		} catch(err) {
			console.error('indexPlaylists: failed to find Plex playlists: ' + util.stringify(err));
			return Promise.reject(err);
		};
	}

	async getPlaylist(name) {
		const self = this;
		_logger.debug('getPlaylist: ' + name);
		if (self.plexPlaylists && self.plexPlaylists.get) {
			_logger.debug('getPlaylist: playlist cache exists.');
			try {
				const pl = self.plexPlaylists.get(name);
				return Promise.resolve(pl);
			} catch(err) {
				_logger.warn('Error getting playlist "' + name + '" from Plex cache: ' + util.stringify(err));
			}
			return Promise.resolve();
		} else {
			try {
				const playlists = await self.indexPlaylists();
				_logger.debug('getPlaylist: ' + name);
				self.plexPlaylists = playlists;
				return playlists.get(name);
			} catch(err) {
				_logger.warn('Unable to index Plex playlists.', util.stringify(err));
				self.plexPlaylists = new PlexPlaylistCollection();
				return Promise.resolve();
			};
		}
	}

	async syncPlaylist(fromiTunes) {
		const self = this;
		_logger.info('Syncing playlist "' + fromiTunes.name + '" to Plex (' + fromiTunes.length + ' songs)');

		for (const song of fromiTunes) {
			syncQueue.add(async () => {
				_logger.debug('syncPlaylist: matching song ' + song.name);
				try {
					const matches = await self.match(song);
					_logger.log('silly', 'syncPlaylist: matches=' + util.stringify(matches));
					if (matches.length > 1) {
						_logger.warn('syncPlaylist: more than one match found for song ' + song.name + ': ' + util.stringify(matches));
					}
					const s = matches[0];
					_logger.debug('syncPlaylist: first match=' + util.stringify(s));
					const plexPlaylist = await self.getPlaylist(fromiTunes.name);
					const playlistName = plexPlaylist? plexPlaylist.name : undefined;
					_logger.debug('syncPlaylist: Found iTunes Playlist: ' + playlistName);
					if (plexPlaylist) {
						_logger.info('Adding song "' + s.name + '" to Plex playlist "' + plexPlaylist.name + '"');
						return self.addSong(plexPlaylist, s);
					} else {
						_logger.info('Adding song "' + s.name + '" by creating Plex playlist "' + fromiTunes.name + '"');
						return self.createPlaylist(fromiTunes.name, s);
					}
				} catch(err) {
					_logger.warn('syncPlaylist: Unable to match song "' + song.name + '" in Plex.  Skipping.');
					_logger.debug('syncPlaylist: Unmatched iTunes song: ' + util.stringify(song));
					return Promise.resolve();
				};
			});
		}
		return syncQueue.add(() => {
			// sync complete
			return true;
		});
	}

	async createPlaylist(playlistName, song) {
		const self = this;
		_logger.debug('createPlaylist: ' + playlistName + ' (song=' + song.name +')');

		let item = "library:///item/" + util.strictEncodeURIComponent(song.path);
		if (song.librarySectionUUID) {
			item = "library://" + song.librarySectionUUID + "/item/" + util.strictEncodeURIComponent(song.path);
		}
		var query = "/playlists?type=audio&title=" + util.strictEncodeURIComponent(playlistName) + "&smart=0&uri=" + util.strictEncodeURIComponent(item);
		_logger.debug('createPlaylist: query=' + query);

		return updateQueue.add(() => {
			console.log('posting');
			return _client.postQuery(query).then(function(res) {
				_logger.debug(util.stringify(res));
				if (res && res.MediaContainer) {
					if (res.MediaContainer.size > 0) {
						_logger.debug('Added song "' + song.name + '" to Plex playlist "' + playlistName + '"');
						const pl = new PlexPlaylist(res.MediaContainer.Metadata[0]);
						self.plexPlaylists.push(pl);
						return pl;
					}
				}
				_logger.warn('Failed to add song "' + song.name + '" to Plex playlist "' + playlistName + '"');
				_logger.debug('createPlaylist: Unhandled response: ' + util.stringify(res));
				return Promise.reject();
			},function(err) {
				let e = 'Failed to create playlist: ' + util.stringify(err);
				_logger.warn('createPlaylist: ' + e);
				return Promise.reject(e);
			});
		});
	}

	async addSong(plexPlaylist, song) {
		const self = this;
		_logger.debug('addSong: ' + song.name + ' (playlist=' + plexPlaylist.name + ')');

		return updateQueue.add(async () => {
			let item = "library:///item/" + util.strictEncodeURIComponent(song.path);
			if (song.librarySectionUUID) {
				item = "library://" + song.librarySectionUUID + "/item/" + util.strictEncodeURIComponent(song.path);
			}
			const query = plexPlaylist.key + "/items?uri=" + util.strictEncodeURIComponent(item);

			try {
				const res = await _client.putQuery(query);
				_logger.info('Added song "' + song.name + '" to playlist "' + plexPlaylist.name + '"');
				return res;
			} catch(err) {
				_logger.warn('addSong: failed to add song.', err);
				return Promise.reject({
					plexPlaylist: plexPlaylist,
					song: song,
					error: err
				});
			};
		});
	}

	async match(song) {
		const self = this;
		const Op = Sequelize.Op;

		const or = self.getPrefixes().map((prefix) => {
			return {
				relativeFile: song.file.replace(new RegExp('^' + prefix + '/?'), '')
			};
		});
		let where = {
			[Op.or]: or
		};
		//console.log('where: ' + util.stringify(where));

		return DBSong.findAll({
			where: where
		}).then((songs) => {
			if (songs.length === 0) {
				_logger.warn('match: no matches for ' + song.file);
				return [];
			}
			const ret = songs.map((s) => {
				return new PersistedSong(s);
			});
			_logger.log('silly', 'match: found match(es): ' + util.stringify(ret));
			return ret;
		}).catch((err) => {
			_logger.error('match: failed to match: ',err);
			return Promise.reject(err);
		});
	}
}

module.exports = PlexIndexer;
