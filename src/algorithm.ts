import type { TorrentState } from "#src/torrentState.js";

export async function maintainPeerConnections(torrentState: TorrentState) {
  const neededPeers =
    torrentState.config.desiredPeers - torrentState.activePeers.size;
  if (neededPeers <= 0) return;
  let i = 0;
  for (const peerConn of torrentState.availablePeers) {
    if (i >= neededPeers) break;
    if (peerConn.lastErrorAt && Date.now() - peerConn.lastErrorAt < 60000)
      continue;
    peerConn.connect(torrentState.config, torrentState.metainfo, {
      onConnecting: () => torrentState.peerConnected(peerConn),
      onDisconnect: () => torrentState.peerDisconnected(peerConn),
      onError: () => torrentState.peerErrored(peerConn),
      onPieceBlock: (blockRequest, data) =>
        torrentState.receivedPieceBlock(blockRequest, data),
    });
    i++;
  }
  console.log(
    `New connections attempted. Active: ${torrentState.activePeers.size}, Available: ${torrentState.availablePeers.size}, Ignored: ${torrentState.ignoredPeers.size}`
  );
}

export async function saturatePieceBlockRequests(appState: TorrentState) {
  for (let piece = 0; piece < appState.bitfield.length; piece++) {
    const requestsCount = Object.keys(appState.requestsInFlight).length;
    if (requestsCount >= appState.config.desiredPiecesInFlight) return;

    if (appState.requestsInFlight[piece]) continue;
    const peerWithPiece = [...appState.activePeers.values()].find((p) =>
      p.bitfield?.has(piece)
    );
    if (!peerWithPiece) continue;

    peerWithPiece.sendInterested();
    const blocksPerPiece = Math.ceil(
      appState.metainfo.info.pieceLength / appState.config.blockSize
    );
    for (let block = 0; block <= blocksPerPiece; block++) {
      const begin = block * appState.config.blockSize;
      peerWithPiece.sendRequest(piece, begin);
      if (block >= appState.config.desiredBlocksInFlight) break;
    }
    appState.requestsInFlight[piece] = peerWithPiece;
  }
}
