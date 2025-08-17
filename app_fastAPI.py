# server.py
import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# ① AsyncServer を ASGI モードで作成
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*"
)

# ② FastAPIアプリを作成
fastapi_app = FastAPI()

fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # または ['http://127.0.0.1:5501'] など
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ③ Socket.IO と FastAPI をラップ
#    → ASGIアプリとして一つのインスタンスにまとめる
app = socketio.ASGIApp(sio, fastapi_app)

# ── RESTエンドポイント ──
@fastapi_app.get("/")
async def root():
    return {"message": "Hello!"}


@sio.event
async def to_flutter(sid, data):
    print(f"[to_flutter] from {sid}: {data}")
    # 発信元（Web）を除いた全クライアントに送信
    await sio.emit('from_web', data, skip_sid=sid)

# Flutter → Web 用イベント（任意）
@sio.event
async def to_web(sid, data):
    print(f"[to_web] from {sid}: {data}")
    await sio.emit('from_flutter', data, skip_sid=sid)

@sio.event
async def connect(sid, environ):
    print(f"[connect] {sid}")

@sio.event
async def disconnect(sid):
    print(f"[disconnect] {sid}")

# ④ サーバー起動
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
