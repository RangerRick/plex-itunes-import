const Song = require('./Song');

class PlexSong extends Song {
	constructor(item) {
		super(item.key, item.title, item.parentTitle, item.grandparentTitle, item.parentIndex, item.index, item.key, item.Media[0].Part[0].file);
		this._data = item;
		this.librarySectionUUID = item.librarySectionUUID;
		this.librarySectionID = item.librarySectionID;
	}

	static isValid(plexSongXml) {
		return (plexSongXml &&
			plexSongXml.title &&
			plexSongXml.key &&
			plexSongXml.Media.length > 0 &&
			plexSongXml.Media.filter(function(entry) {
				return entry && entry.Part && entry.Part.length > 0;
			}).length > 0
		);
	}

	toJSON() {
		var ret = super.toJSON();
		ret._data = this._data;
		return ret;
	}
}

module.exports = PlexSong;