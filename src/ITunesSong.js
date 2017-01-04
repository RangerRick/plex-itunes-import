const Song = require('./Song');

const fileUrl = new RegExp('^file://');

class ITunesSong extends Song {
	constructor(itunesEntry) {
		let path = decodeURI(itunesEntry.Location);
		path = path.replace(fileUrl, '');
		super(parseInt(itunesEntry['Track ID'], 10), itunesEntry.Name, itunesEntry.Album, itunesEntry.Artist, itunesEntry['Disc Number'], itunesEntry['Track Number'], path, path);
		this._data = itunesEntry;
	}

	toJSON() {
		var ret = super.toJSON();
		ret._data = this._data;
		return ret;
	}
}

module.exports = ITunesSong;