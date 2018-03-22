const Playlist = require('./Playlist');
const ITunesSong = require('./ITunesSong');

class ITunesPlaylist extends Playlist {
	constructor(data) {
		super(data.Name);

		if (data.items && data.items.length > 0) {
			for (let d=0, len=data.items.length, item; d < len; d++) {
				item = new ITunesSong(data.items[d]);
				if (item.file && item.file !== 'undefined') {
					this.add(item);
				}
			}
		}
	}

	toString() {
		return 'ITunesPlaylist[' + this.name + ']';
	}

	static isValid(playlistXml) {
		return (playlistXml.Name && playlistXml.Name.charAt(0) !== '-') &&
			!playlistXml.Master &&
			!playlistXml.Folder &&
			!playlistXml.hasOwnProperty('Distinguished Kind') &&
			!(playlistXml.hasOwnProperty('Visible') && !playlistXml.Visible);
	}
}

module.exports = ITunesPlaylist;