import type { TorrentState } from "#src/torrentState.js";
import type { PeerState } from "./peer.js";
import type { PieceIndex } from "./types.js";

export function maintainPeerConnections(torrentState: TorrentState) {
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

export function saturatePieceBlockRequests(appState: TorrentState) {
  const piecesInFlight = saturatePieces(appState);
  saturateBlockRequestsForPieces(appState, piecesInFlight);
}

function saturatePieces(appState: TorrentState): Map<PieceIndex, PeerState> {
  const pieceCapacity =
    appState.config.desiredPiecesInFlight - appState.requestsInFlight.size;
  for (let i = 0; i < pieceCapacity; i++) {
    const pieces = appState.bitfield.remaining();
    if (pieces.length === 0) {
      console.log("Are we done?");
      return new Map();
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
      return new Map();
    }
    appState.requestsInFlight.set(nextUnstartedPiece, peerWithPiece);
    peerWithPiece.sendInterested();
  }
  return appState.requestsInFlight;
}

function saturateBlockRequestsForPieces(
  appState: TorrentState,
  pieces: Map<PieceIndex, PeerState>
) {
  for (const [piece, peer] of pieces.entries()) {
    const blocksInFlight = peer.blocksInFlight(piece);
    const blocksPerPiece = appState.blocksPerPiece;
    if (blocksInFlight.size >= appState.config.desiredBlocksInFlight) continue;
    for (let blockIndex = 0; blockIndex < blocksPerPiece; blockIndex++) {
      if (blocksInFlight.has(blockIndex)) continue;
      if (appState.fileManager.hasPieceBlock(piece, blockIndex)) continue;
      peer.sendRequest(piece, appState.blockOffsetForIndex(blockIndex));
    }
  }
}
