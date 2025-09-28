import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";

/**
 * 共有されたSocketインスタンスを取得または新規作成します。
 * すでにインスタンスが存在する場合は、既存のものを返します。
 * @returns {Socket} Socket.IOのインスタンス
 */
export const getSocket = (): Socket => {
  if (!socket) {
    if (!API_BASE_URL) {
      throw new Error("APIのベースURLが設定されていません。");
    }
    console.log("Creating new socket connection...");
    socket = io(API_BASE_URL, {
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