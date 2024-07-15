import type { TorrentState } from "#src/torrentState.js";
import type { PeerState } from "./peer.js";

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
  const pieceCapacity =
    appState.config.desiredPiecesInFlight - appState.requestsInFlight.size;
  for (let i = 0; i < pieceCapacity; i++) {
    const pieces = appState.bitfield.remaining();
    if (pieces.length === 0) {
      console.log("Are we done?");
      return;
    }
    let peerWithPiece: PeerState | undefined;
    const inFlightPieces = [...appState.requestsInFlight.keys()];
    const nextUnstartedPiece = pieces.find((piece) => {
      if (inFlightPieces.includes(piece)) return false;
      peerWithPiece = [...appState.activePeers.values()].find((p) =>
        p.bitfield?.has(piece)
      );
      return !!peerWithPiece;
    });
    if (nextUnstartedPiece === undefined || peerWithPiece === undefined) {
      console.log("No one has remaining pieces");
      return;
    }
    appState.requestsInFlight.set(nextUnstartedPiece, peerWithPiece);
    peerWithPiece.sendInterested();
  }
  // ensure enough blocks are in flight
  // if not, request available more blocks from FileManager for given piece
  for (const [piece, peer] of appState.requestsInFlight.entries()) {
    const blocksPerPiece = Math.ceil(
      appState.metainfo.info.pieceLength / appState.config.blockSize
    );
    for (let block = 0; block <= blocksPerPiece; block++) {
      const blocksInFlight = peer.blocksInFlight.get(piece) || new Set();
      if (blocksInFlight.size >= appState.config.desiredBlocksInFlight) break;
      if (blocksInFlight.has(block)) continue;
      const begin = block * appState.config.blockSize;
      peer.sendRequest(piece, begin);
    }
  }
}
