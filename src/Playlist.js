const SongCollection = require('./SongCollection');

class Playlist extends SongCollection {
	constructor(name) {
		super();
		this.name = name;
	}

	toString() {
		return 'Playlist[' + this.name + ',' + this.length + ']';
	}

	static isValid(playlistObj) { 	/* jshint unused:false */
		return true;
	}
}

module.exports = Playlist;