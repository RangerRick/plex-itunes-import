const Song = require('./Song');

class SongCollection extends Array {
	get(match) {
		if (match instanceof Song) {
			for (const song of this) {
				if (match.matches(song)) {
					return song;
				}
			}
		} else if (match instanceof String || typeof(match) === 'string') {
			let m = match.toLowerCase();
			for (const song of this) {
				if (song.name.toLowerCase() === m) {
					return song;
				}
			}
		} else {
			throw 'Unknown search type: ' + typeof(searchfor);
		}
		return undefined;
	}

	add(song) {
		if (this.indexOf(song) < 0 && this.get(song) === undefined) {
			this.push(song);
		}
	}

	remove(song) {
		let existing = this.get(song);
		if (existing) {
			let index = this.indexOf(existing);
			return this.splice(index,1);
		}
		return undefined;
	}

	toString() {
		return 'SongCollection[' + this.length + ']';
	}
}

module.exports = SongCollection;