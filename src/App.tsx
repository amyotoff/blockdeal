import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { ethers } from 'ethers';
import { FileSignature, Copy, CheckCircle2, Lock, ExternalLink, RefreshCw, Send, Users, Shield, Network, Download, FileText } from 'lucide-react';
import { computeHashPayload, getContractHash } from './lib/contractHash';
import type { RoomState } from './types/room';

declare global {
  interface Window {
    Telegram?: any;
    ethereum?: any;
  }
}

const SOCKET_URL = window.location.origin;

export default function App() {
  const [roomId, setRoomId] = useState<string>('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [myName, setMyName] = useState<string>('');
  const [isAnchoring, setIsAnchoring] = useState(false);
  const [errorTracker, setErrorTracker] = useState<string>('');

  useEffect(() => {
    const hash = window.location.hash.replace('#/room/', '');
    if (!window.location.hash.startsWith('#/room/')) {
      const newRoomId = Math.random().toString(36).substring(2, 9);
      window.location.hash = `#/room/${newRoomId}`;
      setRoomId(newRoomId);
    } else {
      setRoomId(hash);
    }

    const handleHashChange = () => {
      const newHash = window.location.hash.replace('#/room/', '');
      setRoomId(newHash);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    if (!roomId) return;

    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);

    let defaultName = '';
    try {
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.ready();
        window.Telegram.WebApp.expand();
        const user = window.Telegram.WebApp.initDataUnsafe?.user;
        if (user?.first_name) {
          defaultName = [user.first_name, user.last_name].filter(Boolean).join(' ');
        }
      }
    } catch (e) {
      console.log('Not in Telegram');
    }

    if (!defaultName) {
      const names = ['R2-D2', 'Bender', 'C-3PO', 'Wall-E', 'BB-8', 'Optimus Prime'];
      defaultName = names[Math.floor(Math.random() * names.length)];
    }

    setMyName(defaultName);
    newSocket.emit('join_room', roomId, defaultName);

    newSocket.on('room_state', (state: RoomState) => {
      setRoom(state);
    });

    newSocket.on('text_updated', (newText: string) => {
      setRoom((prev) => prev ? { ...prev, text: newText } : prev);
    });

    return () => {
      newSocket.disconnect();
    };
  }, [roomId]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setRoom((prev) => prev ? { ...prev, text: val } : prev);
    if (socket) {
      socket.emit('update_text', roomId, val);
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setMyName(val);
    if (socket) {
      socket.emit('update_name', roomId, val);
    }
  };

  const toggleSign = () => {
    if (socket) {
      socket.emit('toggle_sign', roomId);
    }
  };

  const buildHashPayload = () => {
    if (!room) return '';
    return computeHashPayload(room);
  };

  const getHash = () => {
    if (!room) return '';
    return getContractHash(room);
  };

  const anchorToBlockchain = async () => {
    setIsAnchoring(true);
    setErrorTracker('');
    try {
      if (!window.ethereum) {
        throw new Error('Установите MetaMask или откройте в Web3 браузере.');
      }
      
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send('eth_requestAccounts', []);
      if (!accounts || accounts.length === 0) {
        throw new Error('Кошелек не подключен.');
      }
      
      const signer = await provider.getSigner();
      const userAddress = await signer.getAddress();
      const hashData = getHash();
      
      const tx = await signer.sendTransaction({
        to: userAddress,
        value: 0,
        data: hashData,
      });
      
      if (socket) {
        socket.emit('set_tx_hash', roomId, tx.hash);
      }
      
    } catch (err: any) {
      setErrorTracker(err?.message || 'Ошибка блокчейна');
    } finally {
      setIsAnchoring(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    if (window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp;
      if (tg.HapticFeedback) {
        tg.HapticFeedback.notificationOccurred('success');
      }
    }
  };

  if (!room) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh] bg-slate-50 text-slate-800">
        <RefreshCw className="animate-spin w-8 h-8 text-indigo-500" />
      </div>
    );
  }

  const myParticipant = room.participants.find(p => p.id === socket?.id);
  const totalSigned = room.participants.filter(p => p.signed).length;
  const totalParticipants = room.participants.length;

  return (
    <div className="min-h-[100dvh] bg-slate-50 flex flex-col font-sans text-slate-900 pb-[100px] sm:pb-0">
      
      {/* Small Header for Mobile */}
      <header className="px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-indigo-600 rounded flex items-center justify-center text-white font-bold">
            <FileSignature className="w-3.5 h-3.5" />
          </div>
          <span className="font-semibold tracking-tight">LexHash</span>
        </div>
        <button 
          onClick={handleCopyLink}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 active:bg-slate-200 transition-colors rounded-lg font-medium text-xs"
        >
          <Copy className="w-3.5 h-3.5" />
          Share ID: {roomId}
        </button>
      </header>

      {/* Main Flow */}
      <main className="flex-1 p-4 flex flex-col gap-6 max-w-lg mx-auto w-full">
        
        {/* Editor Card */}
        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-2xl">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              Текст договора
              {room.hashed && <Lock className="w-3.5 h-3.5 text-slate-500" />}
            </h2>
            {room.hashed ? (
              <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 font-bold uppercase tracking-wider">ЗАФИКСИРОВАНО</span>
            ) : (
              <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 font-bold uppercase tracking-wider">ЧЕРНОВИК</span>
            )}
          </div>
          <div className="p-4">
            <textarea
              value={room.text}
              onChange={handleTextChange}
              disabled={room.hashed}
              className="w-full h-[25vh] min-h-[150px] bg-transparent border-none focus:ring-0 resize-none outline-none disabled:text-slate-600 transition-all font-sans text-slate-700 leading-relaxed text-sm selection:bg-indigo-100 p-0"
              placeholder="Внесите детали вашей договоренности..."
            />
          </div>
        </section>

        {/* Participants Card */}
        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 flex flex-col gap-3">
          <div className="flex justify-between items-center mb-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              Участники ({totalParticipants})
            </h2>
            <span className="text-[10px] font-medium text-slate-500">
              {totalSigned} / {totalParticipants} подписали
            </span>
          </div>
          
          <div className="flex flex-col gap-3">
            {room.participants.map((p, idx) => {
              const isMe = p.id === socket?.id;
              return (
                <div key={p.id}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 w-full">
                      <div className={`w-8 h-8 rounded-full ${p.signed ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'} flex shrink-0 items-center justify-center font-bold text-xs uppercase transition-colors`}>
                        {isMe ? 'ВЫ' : p.name.substring(0,2)}
                      </div>
                      <div className="flex-1 min-w-0 pr-2">
                        {isMe && !room.hashed ? (
                          <input 
                            value={myName}
                            onChange={handleNameChange}
                            className="bg-transparent border-b border-transparent focus:border-indigo-500 outline-none w-full text-sm font-semibold text-slate-900 p-0"
                            placeholder="Ваше имя"
                          />
                        ) : (
                          <p className="text-sm font-semibold truncate text-slate-900">
                            {p.name}
                          </p>
                        )}
                        <p className={`text-[11px] italic ${p.signed ? 'text-indigo-600 font-medium' : 'text-slate-500'}`}>
                          {p.signed ? 'Подписано' : 'Ожидает...'}
                        </p>
                      </div>
                    </div>
                    {p.signed ? (
                      <div className="w-5 h-5 rounded-full bg-emerald-500 flex shrink-0 items-center justify-center shadow-sm">
                        <CheckCircle2 className="w-3 h-3 text-white" />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-slate-200 shrink-0 opacity-60"></div>
                    )}
                  </div>
                  {idx < room.participants.length - 1 && <div className="h-px bg-slate-100 mt-3"></div>}
                </div>
              );
            })}
          </div>
        </section>

        {/* Blockchain Status / Hash Card */}
        {room.hashed && (
          <section className="bg-white border border-indigo-100 rounded-2xl shadow-sm p-4 bg-gradient-to-b from-indigo-50/50 to-white">
            <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-600 mb-3 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              Защита хэшем
            </h2>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 mb-3">
              <p className="text-[10px] font-mono break-all leading-tight text-slate-600">
                {getHash()}
              </p>
            </div>
            {room.txHash ? (
               <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                 <div className="flex items-center gap-2 text-emerald-800 font-bold mb-1 text-xs">
                   <Network className="w-3.5 h-3.5" /> Зафиксировано в Сети
                 </div>
                 <a href={`https://sepolia.etherscan.io/tx/${room.txHash}`} target="_blank" rel="noreferrer" className="text-emerald-600 text-[10px] hover:underline flex items-center gap-1 break-all mt-1">
                   {room.txHash} <ExternalLink className="w-3 h-3 shrink-0" />
                 </a>
                 <div className="mt-3 pt-3 border-t border-emerald-200/50">
                    <p className="text-[11px] text-emerald-900/80 mb-3 leading-relaxed">
                      <b>Как работает защита?</b> Блокчейн фиксирует только хэш (цифровой слепок текста). Чтобы в будущем доказать условия договора, вам потребуется <b>исходный файл</b>. Его хэш всегда будет в точности совпадать с записью в Сети.
                    </p>
                    <button onClick={() => {
                        const payload = buildHashPayload();
                        const blob = new Blob([payload], { type: 'text/plain;charset=utf-8' });
                        const link = document.createElement('a');
                        link.href = URL.createObjectURL(blob);
                        link.download = `LexHash_${roomId}.txt`;
                        link.click();
                    }} className="w-full py-2 bg-white text-emerald-700 border border-emerald-200 font-semibold rounded-lg text-xs flex justify-center items-center gap-1.5 active:bg-emerald-50 shadow-sm">
                      <Download className="w-3.5 h-3.5" /> Скачать оригинал файла (.txt)
                    </button>
                 </div>
               </div>
            ) : (
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Документ подписан всеми сторонами. Теперь любой участник может отправить хэш в EVM сеть (Sepolia).
              </p>
            )}
          </section>
        )}
      </main>

      {/* Sticky Bottom Action Bar for Mobile */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)] z-20 pb-safe">
        <div className="max-w-lg mx-auto">
          {!room.hashed ? (
            <button
              onClick={toggleSign}
              className={`w-full py-3.5 font-bold rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-2 ${
                myParticipant?.signed 
                  ? 'bg-slate-100 text-slate-500 border border-slate-200 active:bg-slate-200'
                  : 'bg-indigo-600 active:bg-indigo-700 text-white shadow-indigo-100'
              }`}
            >
              {myParticipant?.signed ? 'Отозвать подпись' : (
                <>Подписать <Send className="w-4 h-4 ml-1 opacity-80" /></>
              )}
            </button>
          ) : !room.txHash ? (
            <div className="flex flex-col gap-2">
              <button
                onClick={anchorToBlockchain}
                disabled={isAnchoring}
                className="w-full py-3.5 bg-slate-900 active:bg-slate-800 text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-xl shadow-slate-200"
              >
                {isAnchoring ? <RefreshCw className="w-4 h-4 animate-spin text-slate-400" /> : (
                  <>Зафиксировать в блокчейне <ExternalLink className="w-4 h-4 opacity-80" /></>
                )}
              </button>
              {errorTracker && (
                <div className="text-[10px] text-red-500 text-center leading-tight">
                  {errorTracker}
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => {
                const payload = buildHashPayload();
                const blob = new Blob([payload], { type: 'text/plain;charset=utf-8' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `LexHash_${roomId}.txt`;
                link.click();
              }}
              className="w-full py-3.5 bg-emerald-50 active:bg-emerald-100 text-emerald-700 font-bold rounded-xl text-sm flex items-center justify-center gap-2 border border-emerald-200 transition-colors shadow-sm"
            >
              <FileText className="w-4 h-4" /> Сохранить договор на устройство
            </button>
          )}
        </div>
      </div>
      
      {/* Global CSS adjustments for safe area on mobile */}
      <style>{`
        @supports (padding-bottom: env(safe-area-inset-bottom)) {
          .pb-safe {
            padding-bottom: calc(1rem + env(safe-area-inset-bottom));
          }
        }
      `}</style>
    </div>
  );
}
