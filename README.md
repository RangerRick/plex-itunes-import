iTunes Playlist Importer for Plex
=================================

This project is a tool for importing an `iTunes Playlist.xml` file into Plex.  It assumes that the iTunes playlist and Plex are both using the same files, ie, they are both referencing music in the same directory or network share (most of the matching is based on the path/filenames matching).


Configuring the Importer
------------------------

Copy the `example.yaml` file to `config.yaml` and edit it to match your iTunes and Plex settings.

<dl>
  <dt><strong>hostname</strong></dt>
  <dd>The hostname or IP address of your Plex server.</dd>

  <dt><strong>port</strong></dt>
  <dd>The port that Plex is listening on.  (Optional)</dd>

  <dt><strong>username</strong></dt>
  <dd>Your Plex username.</dd>

  <dt><strong>password</strong></dt>
  <dd>Your Plex password.</dd>

  <dt><strong>managedUser</strong></dt>
  <dd>If you are using PlexHome users, set the <strong>name</strong> and <strong>pin</strong> for the PlexHome user to operate as.</dd>

  <dt><strong>itunesxml</strong></dt>
  <dd>The complete path to your <code>iTunes Library.xml</code> file.</dd>

  <dt><strong>stripPrefixes</strong></dt>
  <dd>A list of prefixes to strip off of the beginning of file names when trying to determine song matches.</dd>

  <dt><strong>stripNames</strong></dt>
  <dd>A list of regular expressions that are applied (in order, top to bottom) to album and song names when searching Plex for matches.</dd>
</dl>


Running the Importer
--------------------

Once you have checked out/downloaded the project, install the dependencies:

```
# if you don't already have yarn installed, install it
sudo npm install -g yarn
yarn install
```

(Note, because of a bug on more recent versions of Mac OS X and Xcode,
you may need to run `LDFLAGS=/usr/lib yarn install` if you get compile errors.)

Then, you can run the importer with:

`yarn run import -- [--verbose] [--debug] [--config path/to/config.yaml]`


TODO
----

* handle iTunes playlist changes (adding/removing songs)
* handle deleting an iTunes playlist
* be more efficient in requests (make a real cache that can track iTunes songs and Plex songs and avoid unnecessary queries)
* GUI?
