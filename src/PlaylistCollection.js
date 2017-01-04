const Playlist = require('./Playlist');

class PlaylistCollection extends Array {
	get(name) {
		return this.filter(function(p) {
			return p.name === name;
		})[0];
	}

	contains(obj) {
		if (obj instanceof Playlist) {
			return this.includes(obj);
		} else {
			for (let playlist of this) {
				if (playlist.name === obj) {
					return true;
				}
			}
			return false;
		}
	}

	add(playlist) {
		this.push(playlist);
	}

	remove(playlist) {
		if (playlist instanceof Playlist) {
			var index = this.indexOf(playlist);
			if (index >= 0) {
				return this.splice(index);
			}
		} else {
			return this.remove(this.get(playlist));
		}
		return undefined;
	}
}

module.exports = PlaylistCollection;