const Song = require('./Song');

class PersistedSong extends Song {
	constructor(item) {
		super(
			item.dataValues.id,
			item.dataValues.name,
			item.dataValues.album,
			item.dataValues.artist,
			item.dataValues.disc,
			item.dataValues.track,
			item.dataValues.path,
			item.dataValues.file
		);
		this._data = item.dataValues;
		this.relativeFile = item.dataValues.relativeFile;
		this.filePrefix = item.dataValues.filePrefix;
		this.librarySectionID = item.dataValues.librarySectionID;
		this.librarySectionUUID = item.dataValues.librarySectionUUID;
	}

	toJSON() {
		var ret = super.toJSON();
		ret._data = this._data;
		return ret;
	}
}

module.exports = PersistedSong;