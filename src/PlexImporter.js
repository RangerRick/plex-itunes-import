const os                     = require('os');

const PlexAPI                = require('plex-api');
const Queue                  = require('promise-queue');
const LRU                    = require('lru-cache');

const util                   = require('./util');

const PlexSong               = require('./PlexSong');
const PlexAlbum              = require('./PlexAlbum');
const Playlist               = require('./Playlist');
const PlexPlaylist           = require('./PlexPlaylist');
const PlaylistCollection     = require('./PlaylistCollection');
const PlexPlaylistCollection = require('./PlexPlaylistCollection');

//const filePrefix = new RegExp('^file://');

let _client      = null;
let _logger      = null;
let _artistCache = null;
let _albumCache  = null;

let _queue  = new Queue(1);
let _syncQueue = new Queue(1);

let playlistCache = new PlaylistCollection();

class PlexImporter {
	constructor(config, failureHandler) {
		this.failureHandler = failureHandler || {
			onFailure: function() {}
		};

		if (!config.product) {
			config.product = 'Plex iTunes Import';
		}
		if (!config.deviceName) {
			let hostname = os.hostname();
			if (hostname) {
				hostname = hostname.replace(/\..*$/, '');
			}
			config.deviceName = hostname;
		}
		if (!config.version) {
			config.version = '0.1.2';
		}

		let clientOptions = {
			options: {}
		};
		Object.assign(clientOptions.options, config);

		for (let configKey of ['hostname', 'port', 'username', 'password', 'managedUser']) {
			if (config[configKey]) {
				clientOptions[configKey] = config[configKey];
			}
			delete clientOptions.options[configKey];
		}

		this.config = config;

		_client = new PlexAPI(clientOptions);

		_artistCache = new LRU(config.artistCacheSize || 50);
		_albumCache  = new LRU(config.albumCacheSize || 500);

		if (config.logger) {
			_logger = config.logger;
		} else {
			_logger = require('winston');
		}
	}

	setLogger(logger) {
		_logger = logger;
	}

	getConfig() {
		if (this.config) {
			return this.config;
		} else {
			return {};
		}
	}

	getPrefixes() {
		if (this.config && this.config.stripPrefixes) {
			return this.config.stripPrefixes;
		}
		return [];
	}

	getPlaylists(force=false) {
		var label = 'getPlaylists(' + force + ')';

		_logger.verbose(label);

		if (playlistCache && playlistCache.length && !force) {
			_logger.silly(label + ': Found playlist in cache.');
			return Promise.resolve(playlistCache);
		}

		_logger.debug(label + ': Getting playlists from Plex.');
		return _client.query("/playlists/all?type=15&sort=titleSort%3Aasc&playlistType=audio").then(function(result) {
			if (result && result.MediaContainer) {
				if (result.MediaContainer.size > 0) {
					let playlists = new PlexPlaylistCollection(result.MediaContainer.Metadata);
					_logger.verbose(label + ': Found ' + playlists.length + ' playlists.');
					playlistCache = playlists;
				} else {
					_logger.warn(label + ': No playlists found.');
					playlistCache = new PlaylistCollection();
				}
				return playlistCache;
			} else {
				_logger.error(label + ': Unknown result: ' + util.stringify(result));
				return Promise.reject('Unknown result.');
			}
		},function(err) {
			_logger.warn(label + ': could not query server: ' + err);
			return Promise.reject(err);
		});
	}

	getPlaylist(name) {
		var label = 'getPlaylist(' + name + ')';

		if (playlistCache.contains(name)) {
			return Promise.resolve(playlistCache.get(name));
		} else {
			_logger.debug(label + ': Playlist not in cache.  Fetching.');
			return this.getPlaylists().then(function(playlists) {
				if (playlists.contains(name)) {
					_logger.verbose(label + ': Found playlist.');
					return playlists.get(name);
				} else {
					_logger.warn(label + ': Playlist does not exist on the Plex server.');
					return undefined;
				}
			});
		}
	}

	createPlaylist(playlistName, song) {
		var label = 'createPlaylist(' + playlistName + ' - ' + song.name + ')';

		_logger.verbose(label);

		let item = "library:///item/" + util.strictEncodeURIComponent(song.path);
		if (song.librarySectionUUID) {
			item = "library://" + song.librarySectionUUID + "/item/" + util.strictEncodeURIComponent(song.path);
		}
		var query = "/playlists?type=audio&title=" + util.strictEncodeURIComponent(playlistName) + "&smart=0&uri=" + util.strictEncodeURIComponent(item);
		_logger.debug(label + ': query=' + query);

		return _client.postQuery(query).then(function(res) {
			_logger.silly(label + ': res=',res);
			if (res && res.MediaContainer) {
				if (res.MediaContainer.size > 0) {
					playlistCache.add(new PlexPlaylist(res.MediaContainer.Metadata[0]));
					return playlistCache.get(playlistName);
				}
			}
			_logger.warn(label + ': Unhandled result.', res);
			return Promise.reject();
		},function(err) {
			let e = 'Failed to create playlist: ' + err;
			_logger.warn(label + ': ' + e);
			return Promise.reject(e);
		});
	}

	getSong(song) {
		var label = 'getSong(' + song.grandparentTitle + ' - ' + song.title + ')';
		var plexSong = new PlexSong(song);

		let query = song.key + '?checkFiles=1&includeExtras=1';
		_logger.verbose(label + ': query=' + query);

		return _client.query(query).then(function(res) {
			_logger.debug(label + ': got: ' + util.stringify(res));
			if (res && res.MediaContainer && res.MediaContainer.Metadata) {
				if (res.MediaContainer.Metadata[0].Mood) {
					plexSong.moods = res.MediaContainer.Metadata[0].Mood;
				}
			}
			if (!plexSong.moods) {
				_logger.debug(label + ': No moods found for ' + plexSong.toString());
			}
			return plexSong;
		},function(err) {
			_logger.warn(label + ': ' + err);
			_logger.debug(label + ': song=' + util.stringify(song));
			return Promise.reject(err);
		});
	}

	getAlbum(album) {
		const self = this;
		var label = 'getAlbum(' + album.parentTitle + ' - ' + album.title + ')';

		var existing = _albumCache.get(album.key);
		if (existing) {
			return Promise.resolve(existing);
		}

		var plexAlbum = new PlexAlbum(album);

		return _client.query(album.key).then(function(a) {
			_logger.silly(label + ': children: ' + util.stringify(a));
			var promises = [];

			if (a && a.MediaContainer && a.MediaContainer.Metadata) {
				for (const song of a.MediaContainer.Metadata) {
					promises.push(self.getSong(song));
				}
			}

			return Promise.all(promises).then(function(songs) {
				for (const song of songs) {
					plexAlbum.add(song);
				}
				return plexAlbum;
			});
		}, function(err) {
			_logger.warn(label + ': Error getting album: ' + util.stringify(err));
			return plexAlbum;
		}).then(function(a) {
			_albumCache.set(a.key,a);
			return a;
		});
	}

	getAlbumsForArtist(artist) {
		const self = this;

		var existing = _artistCache.get(artist.key);
		if (existing) {
			return Promise.resolve(existing);
		}

		var label = 'getAlbumsForArtist(' + artist.title + ')';

		_logger.verbose(label);
		return _client.query(artist.key).then(function(res) {
			var promises = [];
			if (res && res.MediaContainer && res.MediaContainer.size > 0 && res.MediaContainer.Metadata) {
				for (const item of res.MediaContainer.Metadata) {
					if (item.type === 'album') {
						promises.push(self.getAlbum(item));
					}
				}
			}
			return Promise.all(promises).then(function(all) {
				_artistCache.set(artist.key, all);
				return all;
			}, function(err) {
				_logger.warn(label + ': Failed to get albums for artist: ' + err);
				return Promise.reject(err);
			});
		}, function(err) {
			_logger.warn(label + ': Error getting artist: ' + util.stringify(err));
			return [];
		});
	}

	matchArtist(fromSong) {
		const self = this;

		var label = 'matchArtist(' + fromSong.artist + ')';

		let config = self.getConfig();
		let searchFor = util.stripName(config.stripNames(fromSong.artist));

		var url = '/search?query=' + util.strictEncodeURIComponent(searchFor) + '&limit=1000';
		_logger.verbose(label + ': url=' + url);

		return _client.query(url).then(function(res) {
			_logger.debug(label + ': ' + util.stringify(res));

			var matches = [];

			if (res && res.MediaContainer && res.MediaContainer.size > 0 && res.MediaContainer.Metadata) {
				for (const item of res.MediaContainer.Metadata) {
					if (item.type === 'artist') {
						_logger.debug(label + ': Potential artist match: ' + util.stringify(item));
						matches.push(item);
					}
				}
			}

			if (matches.length === 0) {
				_logger.verbose(label + ': No matches.');
				return {
					song: fromSong,
					match: undefined
				};
			}

			_logger.debug(label + ': matched ' + matches.length + ' artist(s).');
			_logger.silly(label + ': matches: ' + util.stringify(matches));

			var promises = [];

			for (const match of matches) {
				promises.push(self.getAlbumsForArtist(match));
			}

			return Promise.all(promises).then(function(albumSets) {
				_logger.silly(label + ': Artist album matches: ' + util.stringify(albumSets));
				var prefixes = self.getPrefixes();
				var songMatches = [];
				for (const albumSet of albumSets) {
					for (const album of albumSet) {
						_logger.debug(label + ': Checking album: ' + album.toString());
						let match = album.get(fromSong, prefixes);
						if (match) {
							songMatches.push(match);
						}
					}
				}

				if (songMatches.length > 0) {
					_logger.debug(label + ': Potential song matches: ' + util.stringify(songMatches));
					for (const match of songMatches) {
						if (match.matches(fromSong, prefixes, false)) {
							return {
								song: fromSong,
								match: match
							};
						}
					}
					_logger.warn(label + ': Failed to find exact match.  Returning first fuzzy match.');
					return {
						song: fromSong,
						match: songMatches[0]
					};
				} else {
					_logger.warn(label + ': Unable to find song ' + fromSong.toString() + ' in artist catalog.');
					return Promise.reject();
				}
			});
		},function(err) {
			_logger.warn(label + ': Failed to query artist: ' + err);
			return Promise.reject(err);
		});
	}

	matchAlbum(fromSong) {
		const self = this;

		var label = 'matchAlbum(' + fromSong.artist + ' - ' + fromSong.album + ')';

		let config = self.getConfig();
		let searchFor = util.stripName(config.stripNames(fromSong.album));

		var url = '/search?query=' + util.strictEncodeURIComponent(searchFor) + '&limit=1000';
		_logger.verbose(label + ': url=' + url);

		return _client.query(url).then(function(res) {
			_logger.debug(label + ': ' + util.stringify(res));
			var matches = [];

			if (res && res.MediaContainer && res.MediaContainer.size > 0 && res.MediaContainer.Metadata) {
				// for each search result...
				for (const item of res.MediaContainer.Metadata) {
					if (item.type === 'album') {
						_logger.debug(label + ': Potential album match: ' + util.stringify(item));
						matches.push(item);
					}
				}
			}

			if (matches.length === 0) {
				_logger.verbose(label + ': No matches.');
				return self.matchArtist(fromSong);
			}

			_logger.debug(label + ': matched ' + matches.length + ' album(s).');
			_logger.silly(label + ': matches: ' + util.stringify(matches));

			var promises = [];

			for (const match of matches) {
				promises.push(self.getAlbum(match));
			}

			return Promise.all(promises).then(function(albums) {
				_logger.silly(label + ': albums: ' + util.stringify(albums));
				let prefixes = self.getPrefixes();
				fromSong.setLogger(_logger);

				let matchedSongs = [];

				for (const album of albums) {
					_logger.verbose(label + ': Trying album: ' + album.toString());
					for (const song of album) {
						song.setLogger(_logger);
					}
					var song = album.get(fromSong, prefixes);
					if (song) {
						_logger.verbose(label + ': Matched: ' + song.toString());
						matchedSongs.push({
							song: fromSong,
							matchedAlbum: album,
							match: song
						});
					}
				}

				if (matchedSongs.length === 0) {
					_logger.verbose(label + ': Found ' + albums.length + ' albums, but no songs matched "' + fromSong.name + '".');
					_logger.debug(label + ': Song: ' + util.stringify(fromSong));
					_logger.debug(label + ': Albums: ' + util.stringify(albums));
					return self.matchArtist(fromSong);
				} else if (matchedSongs.length > 1) {
					_logger.verbose(label + ': Found ' + matchedSongs.length + ' potential songs.  Attempting to determine the most correct.');
					for (const matchedSong of matchedSongs) {
						if (matchedSong.match.matches(fromSong, prefixes, false)) {
							return matchedSong;
						}
					}
					_logger.warn(label + ': Failed to find exact match.  Returning first fuzzy match.');
				}

				return matchedSongs[0];
			}, function(err) {
				_logger.warn(label + ': Failed to get all ' + matches.length + ' matches: ' + err);
				return Promise.reject(err);
			});
		},function(err) {
			var ret = {
				song: fromSong,
				match: undefined,
				error: err
			};
			_logger.warn(label + ': Error matching album: ' + util.stringify(ret));
			return ret;
		});
	}

	matchSong(fromSong) {
		const self = this;

		fromSong.setLogger(_logger);
		var label = 'matchSong(' + fromSong.artist + ' - ' + fromSong.album + ' - ' + fromSong.name + ')';

		let config = self.getConfig();
		let searchFor = util.stripName(config.stripNames(fromSong.name));

		var url = '/search?query=' + util.strictEncodeURIComponent(searchFor) + '&type=10&limit=1000';
		_logger.debug(label + ': url=' + url);
		return _client.query(url).then(function(res) {
			_logger.debug(label + ': ' + fromSong.name + ' (' + fromSong.file + '): ' + util.stringify(res));
			var matches = [];
			var prefixes = self.getPrefixes();

			if (res && res.MediaContainer && res.MediaContainer.size > 0 && res.MediaContainer.Metadata) {
				// for each search result...
				ITEMS: for (const item of res.MediaContainer.Metadata) {
					if (PlexSong.isValid(item)) {
						var song = new PlexSong(item);
						song.setLogger(_logger);

						if (fromSong.matches(song, prefixes)) {
							matches.push(song);
							continue ITEMS;
						}
					} else {
						_logger.warn(label + ': Invalid Plex song: ' + util.stringify(item));
					}
				}
			}

			if (matches.length > 1) {
				_logger.verbose(label + ': Found ' + matches.length + ' potential songs.  Attempting to determine the most correct.');
				for (const match of matches) {
					if (match.matches(fromSong, prefixes, false)) {
						return {
							song: fromSong,
							match: match
						};
					}
				}
				_logger.warn(label + ': Failed to find exact match.  Returning first fuzzy match.');
			} else if (matches.length === 0) {
				_logger.verbose(label + ': Plex search failed match.  Trying album match.');
				return self.matchAlbum(fromSong);
			}

			_logger.silly(label + ': matches: ',matches);
			return {
				song: fromSong,
				match: matches[0]
			};
		},function(err) {
			var ret = {
				song: fromSong,
				match: undefined,
				error: err
			};
			_logger.warn(label + ': Error getting song: ' + fromSong.name, ret);
			return ret;
		});
	}

	addSong(toPlaylistName, song) {
		const self = this;
		var label = 'addSong(' + song.toString() + ' -> ' + toPlaylistName + ')';

		_logger.verbose(label);
		return self.getPlaylist(toPlaylistName).then(function(plexPlaylist) {
			_logger.debug(label + ': Got Plex playlist.');
			if (song instanceof PlexSong) {
				let item = "library:///item/" + util.strictEncodeURIComponent(song.path);
				if (song.librarySectionUUID) {
					item = "library://" + song.librarySectionUUID + "/item/" + util.strictEncodeURIComponent(song.path);
				}
				var query = plexPlaylist.key + "/items?uri=" + util.strictEncodeURIComponent(item);

				_logger.verbose(label + ': Adding song "' + song.name + '" to playlist: ' + plexPlaylist.name + ': query=' + query);

				return _client.putQuery(query).then(function(res) {
					_logger.debug(label + ': added song "' + song.name + '" to playlist: ' + plexPlaylist.name + ': ' + util.stringify(res));
					return res;
				}, function(err) {
					_logger.warn(label + ': failed to add song: ' + err);
					return Promise.reject({
						plexPlaylist: plexPlaylist,
						song: song,
						error: err
					});
				});
			} else {
				_logger.warn(label + ': Unhandled song type: ' + typeof(song));
				return Promise.reject('Unhandled song type: ' + typeof(song));
			}
		}, function(err) {
			_logger.warn(label + ': Failed to get playlist: ' + err);
			return Promise.reject(err);
		});
	}

	sync(fromPlaylist, toPlaylistName) {
		var self = this;

		if (!(fromPlaylist instanceof Playlist)) {
			let err = '"fromPlaylist" is not a Playlist object!';
			_logger.error('sync(): ' + err);
			throw err;
		}
		if (!(toPlaylistName instanceof String) && typeof(toPlaylistName) !== 'string') {
			let err = '"toPlaylistName" is not a string!';
			_logger.error('sync(): ' + err);
			throw err;
		}

		_queue.add(function() {
			self.doSync(fromPlaylist, toPlaylistName);
		});
	}

	doSync(fromPlaylist, toPlaylistName) {
		var self = this;

		var label = 'sync(' + fromPlaylist.name + ')';
		var failures = [];

		return self.getPlaylist(toPlaylistName).then(function(toPlaylist) {
			var songs = fromPlaylist.slice();

			if (songs.length === 0) {
				_logger.warn(label + ': No songs in playlist.');
				return;
			}

			_logger.info(label + ': Syncing ' + songs.length + ' songs from ' + fromPlaylist.name);

			let promises = [];

			if (!toPlaylist) {
				let song = songs.shift();
				let promise = _syncQueue.add(function() {
					return self.matchSong(song).then(function(plexMatch) {
						if (plexMatch && plexMatch.match) {
							_logger.info(label + ': Adding ' + plexMatch.match.toString());
							_logger.debug(label + ': Matched song:',plexMatch);
							return self.createPlaylist(toPlaylistName, plexMatch.match);
						} else {
							var err = label + ': Failed to match song: ' + song.toString();
							if (plexMatch && plexMatch.error) {
								err += ': ' + plexMatch.error;
							}
							_logger.warn(err);
							self.failureHandler.onFailure(song);
							//failures.push(song);
							//return Promise.reject(err);
						}
					},function(err) {
						_logger.warn(label + ': Failed to match song: ' + song.toString() + ': ' + err);
						failures.push(song);
						//return Promise.reject(err);
					});
				});
				promises.push(promise);
			}

			let getSongMatch = function(song) {
				return function() {
					return self.matchSong(song).then(function(plexMatch) {
						if (plexMatch && plexMatch.match) {
							_logger.info(label + ': Adding ' + plexMatch.match.toString());
							_logger.debug(label + ': matched song:',plexMatch);
							return self.addSong(toPlaylistName, plexMatch.match);
						} else {
							var err = label + ': Failed to match song: ' + song.toString();
							if (plexMatch && plexMatch.error) {
								err += ': ' + plexMatch.error;
							}
							_logger.warn(err);
							self.failureHandler.onFailure(song);
							//failures.push(song);
							//return Promise.reject(err);
						}
					},function(err) {
						_logger.warn(label + ': Failed to match song: ' + song.toString() + ': ' + err);
						failures.push(song);
						//return Promise.reject(err);
					});
				};
			};

			let promise = null;
			for (const song of songs) {
				promise = _syncQueue.add(getSongMatch(song));
				promises.push(promise);
			}

			return Promise.all(promises).then(function(all) {
				if (failures.length > 0) {
					_logger.warn(label + ': The following ' + failures.length + ' songs failed to match:');
					failures.forEach(function(failure) {
						_logger.warn(label + ':     ' + failure.toString());
					});
				}

				return all;
			});
		}, function(err) {
			_logger.error(label + ': ' + err);
			return Promise.reject(err);
		});
	}
}

module.exports = PlexImporter;
