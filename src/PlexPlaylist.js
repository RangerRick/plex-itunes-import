const Playlist = require('./Playlist');

const items = new RegExp('/items$');

class PlexPlaylist extends Playlist {
	constructor(data) {
		super(data.title);

		data.key = data.key.replace(items, '');
		delete data.title;
		Object.assign(this, data);
	}

	toString() {
		return 'PlexPlaylist[' + this.name + ']';
	}

	static isValid(playlistXml) {
		return (playlistXml.title && playlistXml.key);
	}
}

module.exports = PlexPlaylist;