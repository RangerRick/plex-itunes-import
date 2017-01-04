const itunesdb           = require('itunes-db');

const PlaylistCollection = require('./PlaylistCollection');
const ITunesPlaylist     = require('./ITunesPlaylist');

class ITunesPlaylistCollection extends PlaylistCollection {
	constructor(itunesxml) {
		super();

		let itunes = itunesdb.loadSync(itunesxml);
		this.prefix = itunes.mediaDir.replace(/\/$/, '').replace(/^file\:\/\//, '');

		for (let i=0, len=itunes.playlists.length, playlist; i < len; i++) {
			playlist = itunes.playlists[i];
			if (ITunesPlaylist.isValid(playlist)) {
				this.add(new ITunesPlaylist(playlist));
			}
		}
	}
}

module.exports = ITunesPlaylistCollection;