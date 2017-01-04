const PlaylistCollection = require('./PlaylistCollection');
const PlexPlaylist       = require('./PlexPlaylist');

class PlexPlaylistCollection extends PlaylistCollection {
	constructor(plexxml) {
		super();

		for (let key of Object.keys(plexxml)) {
			let playlist = plexxml[key];
			if (PlexPlaylist.isValid(playlist)) {
				this.add(new PlexPlaylist(playlist));
			} else {
				console.error('Unhandled playlist: ' + JSON.stringify(playlist));
			}
		}
	}
}

module.exports = PlexPlaylistCollection;