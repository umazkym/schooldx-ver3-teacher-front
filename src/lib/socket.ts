import { io, Socket } from "socket.io-client";
import { apiBaseUrl } from '@/lib/apiConfig';

let socket: Socket | null = null;

/**
 * 共有されたSocketインスタンスを取得または新規作成します。
 * すでにインスタンスが存在する場合は、既存のものを返します。
 * @returns {Socket} Socket.IOのインスタンス
 */
export const getSocket = (): Socket => {
  if (!socket) {
    if (!apiBaseUrl) {  // API_BASE_URL を apiBaseUrl に変更
      throw new Error("APIのベースURLが設定されていません。");
    }
    console.log("Creating new socket connection...");
    socket = io(apiBaseUrl, {  // API_BASE_URL を apiBaseUrl に変更
      transports: ["websocket"],
      withCredentials: true,
    });
  }
  return socket;
};

/**
 * 共有されたSocketインスタンスを切断し、インスタンスを破棄します。
 */
export const disconnectSocket = () => {
  if (socket?.connected) {
    console.log("Disconnecting socket...");
    socket.disconnect();
  }
  socket = null;
};