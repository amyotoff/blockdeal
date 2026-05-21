import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { ethers } from 'ethers';
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileCheck,
  FileText,
  Fingerprint,
  Handshake,
  Network,
  RefreshCw,
  ReceiptText,
  Scale,
  Send,
  Signature,
  ScrollText,
  Terminal,
  Users,
} from 'lucide-react';
import { computeHashPayload, getContractHash } from './lib/contractHash';
import type { RoomState } from './types/room';

declare global {
  interface Window {
    Telegram?: any;
    ethereum?: any;
  }
}

const SOCKET_URL = window.location.origin;

function createRoomHash() {
  const newRoomId = Math.random().toString(36).substring(2, 9);
  return `#/room/${newRoomId}`;
}

function LandingPage() {
  const createRoom = () => {
    window.location.hash = createRoomHash();
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground font-sans">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4">
          <a href="#/landing" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-white shadow-sm">
              <Handshake className="h-4 w-4" />
            </span>
            <span className="font-heading text-lg font-semibold tracking-tight">BlockDeal</span>
          </a>
          <button
            onClick={createRoom}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition-colors active:bg-surface-muted"
          >
            Fix a deal
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main>
        <section className="mx-auto grid min-h-[calc(100dvh-65px)] w-full max-w-6xl items-center gap-10 px-5 py-12 lg:grid-cols-[1fr_0.95fr]">
          <div className="max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium text-muted shadow-sm">
              <Scale className="h-4 w-4 text-primary" strokeWidth={1.75} />
              Both sides agreed. The terms are fixed.
            </div>
            <h1 className="font-heading text-5xl font-bold leading-[1.02] tracking-normal text-foreground sm:text-6xl">
              Agreements fixed. Proof that lasts.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
              BlockDeal helps both sides confirm the same terms and create a blockchain-backed receipt without legal theatre or crypto noise.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={createRoom}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-white shadow-[0_10px_24px_rgba(0,180,126,0.18)] transition-colors active:bg-primary-700"
              >
                Fix a deal
                <ArrowRight className="h-4 w-4" />
              </button>
              <a
                href="#proof"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-6 py-3 text-sm font-bold text-foreground shadow-sm transition-colors active:bg-surface-muted"
              >
                See sample receipt
              </a>
            </div>
            <div className="mt-10 grid max-w-2xl gap-3 sm:grid-cols-3">
              {['Same terms for both sides', 'Permanent receipt', 'Export for disputes'].map((item) => (
                <div key={item} className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-muted">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-3 shadow-[0_1px_2px_rgba(18,25,31,0.04),0_8px_24px_rgba(18,25,31,0.06)]">
            <div className="rounded-xl border border-border bg-surface-muted p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="font-heading text-base font-semibold text-foreground">Sample receipt</p>
                  <p className="text-sm text-muted">Human-readable proof first</p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary-50 px-3 py-1 text-xs font-bold text-primary-700">
              <FileCheck className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Receipt ready
                </span>
              </div>
              <div className="space-y-3">
                <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted">Agreement</span>
                    <ReceiptText className="h-4 w-4 text-primary" strokeWidth={1.75} />
                  </div>
                  <p className="text-sm leading-6 text-foreground">
                    Delivery milestone triggers payment release. This version cannot be changed after both signatures.
                  </p>
                </div>
                {[
                  ['Founder', 'Signed', true],
                  ['Contractor', 'Signed', true],
                  ['Auditor', 'Waiting', false],
                ].map(([name, status, signed]) => (
                  <div key={name as string} className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold ${
                          signed ? 'bg-primary-50 text-primary-700' : 'bg-amber-50 text-warning'
                        }`}
                      >
                        {(name as string).substring(0, 2).toUpperCase()}
                      </span>
                      <span className="text-sm font-semibold text-foreground">{name as string}</span>
                    </div>
                    <span className={signed ? 'text-sm font-semibold text-primary-700' : 'text-sm font-semibold text-warning'}>
                      {status as string}
                    </span>
                  </div>
                ))}
                <div className="rounded-xl border border-white/10 bg-secondary p-4 text-white">
                  <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/70">
                    <Fingerprint className="h-3.5 w-3.5 text-accent" strokeWidth={1.75} />
                    Proof details
                  </p>
                  <p className="break-all font-mono text-[11px] leading-5 text-white/75">
                    0x8f34f7ab90d16665e4c4ab2a531a4be71e89d0f7b3a2c594e9d12e6c1f0a9124
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="proof" className="border-y border-border bg-surface">
          <div className="mx-auto grid max-w-6xl gap-4 px-5 py-12 md:grid-cols-4">
            {[
              ['Draft', 'Write terms in plain language before anything is fixed.', ScrollText],
              ['Invite', 'Bring the counterparty into the same shared version.', Handshake],
              ['Sign', 'Each party confirms identity and intent.', Signature],
              ['Receipt', 'Create a permanent proof users can actually read.', ReceiptText],
            ].map(([title, body, Icon, color]) => (
              <article key={title as string} className="rounded-xl border border-border bg-surface p-5 shadow-sm">
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full border border-primary/15 bg-primary-50 text-primary-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                  <Icon className="h-6 w-6" strokeWidth={1.55} />
                </div>
                <h2 className="font-heading text-lg font-semibold text-foreground">{title as string}</h2>
                <p className="mt-2 text-sm leading-6 text-muted">{body as string}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-6 px-5 py-14 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-sm font-bold text-primary-700">Trust signals</p>
            <h2 className="mt-2 font-heading text-4xl font-bold text-foreground">Blockchain details appear when proof matters.</h2>
          </div>
          <div className="rounded-xl border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(18,25,31,0.04),0_8px_24px_rgba(18,25,31,0.06)]">
            <div className="mb-4 flex items-center gap-2 text-sm font-bold text-muted">
              <Terminal className="h-4 w-4 text-primary" strokeWidth={1.75} />
              Proof model
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {['Human-readable receipt', 'Deterministic checksum', 'EVM transaction reference'].map((item) => (
                <div key={item} className="rounded-lg border border-border bg-surface-muted px-4 py-4 text-sm font-semibold text-foreground">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function App() {
  const [currentHash, setCurrentHash] = useState<string>(window.location.hash);
  const [roomId, setRoomId] = useState<string>('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [myName, setMyName] = useState<string>('');
  const [isAnchoring, setIsAnchoring] = useState(false);
  const [errorTracker, setErrorTracker] = useState<string>('');

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentHash(window.location.hash);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    if (!currentHash.startsWith('#/room/')) {
      setRoomId('');
      setRoom(null);
      return;
    }

    setRoomId(currentHash.replace('#/room/', ''));
  }, [currentHash]);

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

  if (!currentHash.startsWith('#/room/')) {
    return <LandingPage />;
  }

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
      <div className="flex items-center justify-center min-h-[100dvh] bg-background text-foreground">
        <RefreshCw className="animate-spin w-8 h-8 text-primary" />
      </div>
    );
  }

  const myParticipant = room.participants.find(p => p.id === socket?.id);
  const totalSigned = room.participants.filter(p => p.signed).length;
  const totalParticipants = room.participants.length;

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col font-sans text-foreground pb-[100px] sm:pb-0">
      
      {/* Small Header for Mobile */}
      <header className="px-4 py-3 bg-background/90 border-b border-border flex items-center justify-between sticky top-0 z-10 shadow-sm backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center text-white font-bold shadow-sm">
            <Handshake className="w-3.5 h-3.5" strokeWidth={1.75} />
          </div>
          <span className="font-heading font-semibold tracking-tight">BlockDeal</span>
        </div>
        <button 
          onClick={handleCopyLink}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-surface text-muted active:bg-surface-muted transition-colors rounded-lg border border-border font-medium text-xs shadow-sm"
        >
          <Copy className="w-3.5 h-3.5" />
          Share ID: {roomId}
        </button>
      </header>

      {/* Main Flow */}
      <main className="flex-1 p-4 flex flex-col gap-6 max-w-lg mx-auto w-full">
        
        {/* Editor Card */}
        <section className="bg-surface border border-border rounded-xl shadow-[0_1px_2px_rgba(18,25,31,0.04),0_8px_24px_rgba(18,25,31,0.06)] flex flex-col">
          <div className="px-4 py-3 border-b border-border flex justify-between items-center bg-surface-muted rounded-t-xl">
            <h2 className="text-sm font-heading font-bold text-foreground flex items-center gap-2">
              Текст договора
              {room.hashed && <FileCheck className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />}
            </h2>
            {room.hashed ? (
              <span className="text-[10px] text-primary-700 bg-primary-50 px-2 py-0.5 rounded-full border border-primary/20 font-bold uppercase tracking-wider">ЗАФИКСИРОВАНО</span>
            ) : (
              <span className="text-[10px] text-muted bg-surface px-2 py-0.5 rounded-full border border-border font-bold uppercase tracking-wider">ЧЕРНОВИК</span>
            )}
          </div>
          <div className="p-4">
            <textarea
              value={room.text}
              onChange={handleTextChange}
              disabled={room.hashed}
              className="w-full h-[25vh] min-h-[150px] bg-transparent border-none focus:ring-0 resize-none outline-none disabled:text-muted transition-all font-sans text-foreground leading-relaxed text-sm selection:bg-primary-100 p-0 placeholder:text-muted/70"
              placeholder="Внесите детали вашей договоренности..."
            />
          </div>
        </section>

        {/* Participants Card */}
        <section className="bg-surface border border-border rounded-xl shadow-[0_1px_2px_rgba(18,25,31,0.04),0_8px_24px_rgba(18,25,31,0.06)] p-4 flex flex-col gap-3">
          <div className="flex justify-between items-center mb-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" strokeWidth={1.75} />
              Участники ({totalParticipants})
            </h2>
            <span className="text-[10px] font-medium text-muted">
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
                      <div className={`w-8 h-8 rounded-full ${p.signed ? 'bg-primary-50 text-primary-700 ring-1 ring-primary/20' : 'bg-surface-muted text-muted ring-1 ring-border'} flex shrink-0 items-center justify-center font-bold text-xs uppercase transition-colors`}>
                        {isMe ? 'ВЫ' : p.name.substring(0,2)}
                      </div>
                      <div className="flex-1 min-w-0 pr-2">
                        {isMe && !room.hashed ? (
                          <input 
                            value={myName}
                            onChange={handleNameChange}
                            className="bg-transparent border-b border-transparent focus:border-primary outline-none w-full text-sm font-semibold text-foreground p-0 placeholder:text-muted/70"
                            placeholder="Ваше имя"
                          />
                        ) : (
                          <p className="text-sm font-semibold truncate text-foreground">
                            {p.name}
                          </p>
                        )}
                        <p className={`text-[11px] italic ${p.signed ? 'text-primary-700 font-medium' : 'text-muted'}`}>
                          {p.signed ? 'Подписано' : 'Ожидает...'}
                        </p>
                      </div>
                    </div>
                    {p.signed ? (
                      <div className="w-5 h-5 rounded-full bg-primary flex shrink-0 items-center justify-center shadow-sm">
                        <CheckCircle2 className="w-3 h-3 text-white" />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-border shrink-0 opacity-80"></div>
                    )}
                  </div>
                  {idx < room.participants.length - 1 && <div className="h-px bg-border mt-3"></div>}
                </div>
              );
            })}
          </div>
        </section>

        {/* Blockchain Status / Hash Card */}
        {room.hashed && (
          <section className="bg-secondary border border-secondary/10 rounded-xl shadow-[0_1px_2px_rgba(18,25,31,0.04),0_8px_24px_rgba(18,25,31,0.06)] p-4 text-white">
            <h2 className="text-xs font-bold uppercase tracking-wider text-white/75 mb-3 flex items-center gap-1.5">
              <ReceiptText className="w-3.5 h-3.5 text-accent" strokeWidth={1.75} />
              Proof receipt
            </h2>
            <div className="p-3 bg-white/5 rounded-lg border border-white/10 mb-3">
              <p className="text-[10px] font-mono break-all leading-tight text-white/70">
                {getHash()}
              </p>
            </div>
            {room.txHash ? (
               <div className="bg-primary/10 border border-primary/30 rounded-lg p-3">
                 <div className="flex items-center gap-2 text-primary-100 font-bold mb-1 text-xs">
                   <Network className="w-3.5 h-3.5" strokeWidth={1.75} /> Зафиксировано в Сети
                 </div>
                 <a href={`https://sepolia.etherscan.io/tx/${room.txHash}`} target="_blank" rel="noreferrer" className="text-primary-100 text-[10px] hover:underline flex items-center gap-1 break-all mt-1">
                   {room.txHash} <ExternalLink className="w-3 h-3 shrink-0" />
                 </a>
                 <div className="mt-3 pt-3 border-t border-white/10">
                    <p className="text-[11px] text-white/75 mb-3 leading-relaxed">
                      <b>Как работает защита?</b> Блокчейн фиксирует только хэш (цифровой слепок текста). Чтобы в будущем доказать условия договора, вам потребуется <b>исходный файл</b>. Его хэш всегда будет в точности совпадать с записью в Сети.
                    </p>
                    <button onClick={() => {
                        const payload = buildHashPayload();
                        const blob = new Blob([payload], { type: 'text/plain;charset=utf-8' });
                        const link = document.createElement('a');
                        link.href = URL.createObjectURL(blob);
                        link.download = `LexHash_${roomId}.txt`;
                        link.click();
                    }} className="w-full py-2 bg-white text-secondary border border-white/10 font-semibold rounded-lg text-xs flex justify-center items-center gap-1.5 active:bg-primary-50 shadow-sm">
                      <Download className="w-3.5 h-3.5" /> Скачать оригинал файла (.txt)
                    </button>
                 </div>
               </div>
            ) : (
              <p className="text-[11px] text-white/70 leading-relaxed">
                Документ подписан всеми сторонами. Теперь любой участник может отправить хэш в EVM сеть (Sepolia).
              </p>
            )}
          </section>
        )}
      </main>

      {/* Sticky Bottom Action Bar for Mobile */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/90 border-t border-border p-4 shadow-[0_-8px_30px_-18px_rgba(18,25,31,0.25)] z-20 pb-safe backdrop-blur">
        <div className="max-w-lg mx-auto">
          {!room.hashed ? (
            <button
              onClick={toggleSign}
              className={`w-full py-3.5 font-bold rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-2 ${
                myParticipant?.signed 
                  ? 'bg-surface text-muted border border-border active:bg-surface-muted'
                  : 'bg-primary active:bg-primary-700 text-white shadow-[0_10px_24px_rgba(0,180,126,0.18)]'
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
                className="w-full py-3.5 bg-primary active:bg-primary-700 text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-xl shadow-primary/20 disabled:opacity-70"
              >
                {isAnchoring ? <RefreshCw className="w-4 h-4 animate-spin text-primary-50" /> : (
                  <>Зафиксировать в блокчейне <ExternalLink className="w-4 h-4 opacity-80" /></>
                )}
              </button>
              {errorTracker && (
                <div className="text-[10px] text-danger text-center leading-tight">
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
              className="w-full py-3.5 bg-secondary active:bg-secondary-900 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 border border-secondary/10 transition-colors shadow-sm"
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
