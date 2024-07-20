# TS Torrent

Very basic BitTorrent [v1.0 spec](https://wiki.theory.org/BitTorrentSpecification) client built in TypeScript. Primarily done to learn modern Node JS + TS.

### Usage

```
npm run dev
```

### Features

- Decodes tracker information from a .torrent file
- Queries tracker to discover peers
- Negotiates TCP connections to peers
- Leeches data from peers
- Validates downloaded pieces against SHA1 hashes
- Writes validated pieces to disk
- Restore progress on reboot

### Missing

- Configure via command line arguments
- Announce progress to peers
- Seed data to peers
- Self-implemented bencode decode / encode
- Any tests :D
