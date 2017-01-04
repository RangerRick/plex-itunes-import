const SongCollection = require('./SongCollection');
const Song           = require('./Song');
const PlexSong       = require('./PlexSong');

class PlexAlbum extends SongCollection {
	constructor(album, songs) {
		super();
		this._data = album;
		this.artist = album.parentTitle || album.artist;
		this.name = album.title || album.name;
		this.key = album.key;

		//console.log('plexalbum: album=' + JSON.stringify(album,null,2));
		//console.log('plexalbum: songs=' + JSON.stringify(songs,null,2));

		if (songs) {
			for (const song of songs) {
				this.push(new PlexSong(song));
			}
		} else if (album.songs) {
			for (const song of songs) {
				this.push(new PlexSong(song));
			}
		}
	}

	get(song, prefixes) {
		if (song instanceof Song) {
			for (const matchme of this) {
				if (song.matches(matchme, prefixes)) {
					return matchme;
				}
			}
		} else {
			console.log('WARNING: PlexAlbum.get() called with non-song argument: ' + JSON.stringify(song));
		}
		for (const matchme of this) {
			if (matchme instanceof Song) {
				if (matchme.name.toLowerCase() === song.name.toLowerCase()) {
					return matchme;
				}
			} else {
				console.log('WARNING: PlexAlbum contains an item that is not a Song object: ' + JSON.stringify(matchme));
			}
		}
		return undefined;
	}

	toString() {
		return 'PlexAlbum[' + this.artist + ' - ' + this.name + ' (' + this.length + ')]';
	}

	toJSON() {
		return {
			name: this.name,
			artist: this.artist,
			key: this.key,
			songs: Array.from(this)
		};
	}
}

module.exports = PlexAlbum;