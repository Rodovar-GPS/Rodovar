
import React, { useState, useEffect, useRef } from 'react';
import { TrackingData, TrackingStatus, Coordinates, StatusLabels, Expense, CompanySettings, ProofOfDelivery } from '../types';
import { getShipment, saveShipment, getCoordinatesForString, calculateProgress, getDistanceFromLatLonInKm, getCompanySettings } from '../services/storageService';
import MapVisualization from './MapVisualization';
import { TruckIcon, SteeringWheelIcon, WhatsAppIcon, MicrophoneIcon, MicrophoneOffIcon, UserIcon, PenIcon, CameraIcon } from './Icons';

interface DriverPanelProps {
  onClose: () => void;
}

interface IWindow extends Window {
  webkitSpeechRecognition: any;
  SpeechRecognition: any;
}

const DriverPanel: React.FC<DriverPanelProps> = ({ onClose }) => {
  // --- SETTINGS STATE ---
  const [companySettings, setCompanySettings] = useState<CompanySettings>({
      name: 'RODOVAR',
      slogan: 'Logística Inteligente',
      logoUrl: ''
  });

  // --- SHIPMENT STATES ---
  const [code, setCode] = useState('');
  const [shipment, setShipment] = useState<TrackingData | null>(null);
  const [error, setError] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [lastUpdateLog, setLastUpdateLog] = useState<string>('');
  const [remainingDistanceKm, setRemainingDistanceKm] = useState<number | null>(null);

  // --- PROOF OF DELIVERY STATES (SIGNATURE) ---
  const [showProofModal, setShowProofModal] = useState(false);
  const [receiverName, setReceiverName] = useState('');
  const [receiverDoc, setReceiverDoc] = useState('');
  const [proofPhoto, setProofPhoto] = useState('');
  const [signatureData, setSignatureData] = useState('');
  
  // Canvas Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // --- LIVE TRACKING STATES ---
  const [isLiveTracking, setIsLiveTracking] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const trackingIntervalRef = useRef<number | null>(null);
  const wakeLockRef = useRef<any>(null);

  // --- OFFLINE & SYNC STATES ---
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [hasPendingSync, setHasPendingSync] = useState(false);

  // --- VOICE ASSISTANT STATES (DASHBOARD) ---
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<string>('Inativo');
  const recognitionRef = useRef<any>(null);

  // --- VOICE INPUT STATE (LOGIN) ---
  const [isListeningCode, setIsListeningCode] = useState(false);

  // --- FORM STATES ---
  const [driverNotes, setDriverNotes] = useState('');
  
  // NÚMERO DE WHATSAPP ATUALIZADO
  const MANAGER_PHONE = "5571999202476"; 

  const getNowFormatted = () => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes} - ${day}/${month}`;
  };

  useEffect(() => {
    loadSettings();
    const savedCode = localStorage.getItem('rodovar_active_driver_code');
    if (savedCode) {
        setCode(savedCode);
        handleShipmentLogin(null, savedCode);
    }
    if (savedCode) {
        const pendingKey = `rodovar_offline_queue_${savedCode}`;
        if (localStorage.getItem(pendingKey)) setHasPendingSync(true);
    }
  }, []);

  const loadSettings = async () => {
      const settings = await getCompanySettings();
      setCompanySettings(settings);
  };

  useEffect(() => {
    return () => {
      stopLiveTracking(true);
      stopVoiceAssistant();
    };
  }, []);

  // --- LOGIN VOICE INPUT LOGIC ---
  const startCodeVoiceInput = () => {
      const { webkitSpeechRecognition, SpeechRecognition } = window as unknown as IWindow;
      const Recognition = SpeechRecognition || webkitSpeechRecognition;
      if (!Recognition) return alert("Navegador sem suporte a voz.");
      
      const recognition = new Recognition();
      recognition.lang = 'pt-BR';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => setIsListeningCode(true);
      recognition.onend = () => setIsListeningCode(false);
      recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          // Filter alphanumeric and convert to uppercase
          const cleanCode = transcript.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
          if (cleanCode.length > 2) {
              setCode(cleanCode);
              handleShipmentLogin(null, cleanCode);
          }
      };
      recognition.start();
  };

  // --- CANVAS SIGNATURE LOGIC ---
  const startDrawing = (e: any) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      let x, y;
      
      if (e.type === 'touchstart') {
          x = e.touches[0].clientX - rect.left;
          y = e.touches[0].clientY - rect.top;
      } else {
          x = e.nativeEvent.offsetX;
          y = e.nativeEvent.offsetY;
      }

      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#000';
      setIsDrawing(true);
  };

  const draw = (e: any) => {
      if (!isDrawing) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      let x, y;

      if (e.type === 'touchmove') {
          e.preventDefault(); // Prevent scrolling
          x = e.touches[0].clientX - rect.left;
          y = e.touches[0].clientY - rect.top;
      } else {
          x = e.nativeEvent.offsetX;
          y = e.nativeEvent.offsetY;
      }

      ctx.lineTo(x, y);
      ctx.stroke();
  };

  const stopDrawing = () => {
      if (!isDrawing) return;
      setIsDrawing(false);
      const canvas = canvasRef.current;
      if (canvas) {
          setSignatureData(canvas.toDataURL());
      }
  };

  const clearSignature = () => {
      const canvas = canvasRef.current;
      if (canvas) {
          const ctx = canvas.getContext('2d');
          ctx?.clearRect(0, 0, canvas.width, canvas.height);
          setSignatureData('');
      }
  };
  
  const handleProofPhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.files && event.target.files[0]) {
          const file = event.target.files[0];
          const reader = new FileReader();
          reader.onload = (e) => {
             const img = new Image();
             img.onload = () => {
                 const canvas = document.createElement('canvas');
                 const ctx = canvas.getContext('2d');
                 const MAX_WIDTH = 600; 
                 const MAX_HEIGHT = 600;
                 let width = img.width;
                 let height = img.height;
                 if (width > height) {
                     if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
                 } else {
                     if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
                 }
                 canvas.width = width;
                 canvas.height = height;
                 ctx?.drawImage(img, 0, 0, width, height);
                 setProofPhoto(canvas.toDataURL('image/jpeg', 0.8));
             };
             if (e.target?.result) img.src = e.target.result as string;
          };
          reader.readAsDataURL(file);
      }
  };

  const submitProofOfDelivery = async () => {
      if (!receiverName || !receiverDoc || !signatureData || !proofPhoto) {
          alert("Preencha todos os campos, assine e tire a foto para finalizar.");
          return;
      }

      setIsLocating(true);
      try {
           navigator.geolocation.getCurrentPosition(async (position) => {
               const { latitude, longitude } = position.coords;
               
               const proof: ProofOfDelivery = {
                   receiverName,
                   receiverDoc,
                   signatureBase64: signatureData,
                   photoBase64: proofPhoto,
                   timestamp: new Date().toISOString(),
                   location: { lat: latitude, lng: longitude }
               };

               const updatedShipment: TrackingData = {
                   ...shipment!,
                   status: TrackingStatus.DELIVERED,
                   isLive: false,
                   progress: 100,
                   message: `Entrega realizada para ${receiverName} (Doc: ${receiverDoc})`,
                   lastUpdate: getNowFormatted(),
                   proof: proof // Attach proof
               };
               
               // Save
               if (navigator.onLine) {
                   await saveShipment(updatedShipment);
                   setShipment(updatedShipment);
                   stopLiveTracking(true);
                   setShowProofModal(false);
                   sendWhatsAppUpdate('finish');
                   alert("✅ ENTREGA FINALIZADA COM SUCESSO!\nComprovante Digital Gerado.");
               } else {
                   const queueKey = `rodovar_offline_queue_${shipment!.code}`;
                   localStorage.setItem(queueKey, JSON.stringify(updatedShipment));
                   setHasPendingSync(true);
                   setShipment(updatedShipment);
                   setShowProofModal(false);
                   alert("Salvo OFFLINE. Será enviado quando conectar.");
               }
           }, (err) => {
               alert("Erro de localização. Permita o GPS para validar a entrega.");
               setIsLocating(false);
           });
      } catch (e: any) {
          alert(e.message);
          setIsLocating(false);
      }
  };

  // --- VOICE ASSISTANT (DASHBOARD) ---
  const speak = (text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'pt-BR';
      utterance.rate = 1.1;
      window.speechSynthesis.speak(utterance);
    }
  };

  const processVoiceCommand = (transcript: string) => {
    const command = transcript.toLowerCase();
    if (command.includes('problema') || command.includes('socorro') || command.includes('ajuda')) {
        speak("Entendido. Abrindo WhatsApp para reportar problema.");
        sendWhatsAppUpdate('problem');
        return;
    }
    if (command.includes('localização') || command.includes('onde estou')) {
        speak(`Enviando dados para o gestor.`);
        sendWhatsAppUpdate('update');
        return;
    }
    if (command.includes('ler') || command.includes('status')) {
        const dest = shipment?.destination || 'desconhecido';
        const dist = remainingDistanceKm ? `${remainingDistanceKm.toFixed(0)} quilômetros` : 'não calculada';
        speak(`Carga ${shipment?.code}. Destino: ${dest}. Distância: ${dist}.`);
        return;
    }
    if (command.includes('iniciar rastreamento')) {
         if (!isLiveTracking) startLiveTracking(shipment?.code || '', true);
         return;
    }
    if (command.includes('parar rastreamento')) {
        if (isLiveTracking) stopLiveTracking(true);
        return;
    }
  };

  const startVoiceAssistant = () => {
    const { webkitSpeechRecognition, SpeechRecognition } = window as unknown as IWindow;
    const Recognition = SpeechRecognition || webkitSpeechRecognition;
    if (!Recognition) return alert("Navegador sem suporte a voz.");
    speak("Modo mãos livres ativado.");
    const recognition = new Recognition();
    recognition.lang = 'pt-BR';
    recognition.continuous = true;
    recognition.onstart = () => { setIsVoiceActive(true); setVoiceStatus('Ouvindo...'); };
    recognition.onresult = (event: any) => {
      const lastIndex = event.results.length - 1;
      const transcript = event.results[lastIndex][0].transcript;
      setVoiceStatus(`Processando: "${transcript}"`);
      processVoiceCommand(transcript);
      setTimeout(() => { if (recognitionRef.current) setVoiceStatus('Ouvindo...'); }, 2000);
    };
    recognition.onend = () => { if (isVoiceActive) try { recognition.start(); } catch(e) { setIsVoiceActive(false); } };
    recognitionRef.current = recognition;
    try { recognition.start(); } catch (e) { console.error(e); }
  };

  const stopVoiceAssistant = () => {
      setIsVoiceActive(false);
      setVoiceStatus('Inativo');
      if (recognitionRef.current) {
          recognitionRef.current.stop();
          recognitionRef.current = null;
      }
  };

  const toggleVoiceAssistant = () => isVoiceActive ? stopVoiceAssistant() : startVoiceAssistant();

  const handleUpdateTrip = async () => {
      if (isCloseEnoughToFinish && !isTripCompleted) {
          setShowProofModal(true);
          return;
      }
      setIsLocating(true);
      try {
          await performUpdate(false, false);
          if (!isLiveTracking) alert(navigator.onLine ? "Dados Atualizados!" : "Salvo no aparelho.");
      } catch (err: any) {
          alert(`Erro: ${err.message}`);
      } finally {
          setIsLocating(false);
      }
  };

  const performUpdate = async (forceCompletion = false, silent = false) => {
       if (!navigator.geolocation) throw new Error("GPS Desativado.");
       const currentCode = shipment?.code;
       if (!currentCode) throw new Error("Carga não carregada.");
       return new Promise<void>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(async (position) => {
               const { latitude, longitude } = position.coords;
               const currentCoords: Coordinates = { lat: latitude, lng: longitude };
               const freshShipment = await getShipment(currentCode);
               if (!freshShipment) return reject("Erro sync");
               
               const updated = { ...freshShipment, currentLocation: { ...freshShipment.currentLocation, coordinates: currentCoords }, lastUpdate: getNowFormatted() };
               if (navigator.onLine) await saveShipment(updated);
               else localStorage.setItem(`rodovar_offline_queue_${currentCode}`, JSON.stringify(updated));
               
               setShipment(updated);
               resolve();
          }, reject);
       });
  };

  // --- CONNECTIVITY & SYNC LOGIC ---
  useEffect(() => {
      const handleOnline = () => { setIsOnline(true); syncOfflineData(); };
      const handleOffline = () => setIsOnline(false);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, [shipment?.code]);

  const syncOfflineData = async () => {
      // Sync logic handled elsewhere
  };

  const requestWakeLock = async () => { try { if ('wakeLock' in navigator) { wakeLockRef.current = await (navigator as any).wakeLock.request('screen'); setWakeLockActive(true); } } catch (e) {} };
  const releaseWakeLock = async () => { if (wakeLockRef.current) { await wakeLockRef.current.release(); wakeLockRef.current = null; setWakeLockActive(false); } };

  const startLiveTracking = (currentCode: string, silentRestore = false) => {
      setIsLiveTracking(true);
      requestWakeLock();
      localStorage.setItem(`rodovar_tracking_state_${currentCode}`, 'active');
      if (trackingIntervalRef.current) clearInterval(trackingIntervalRef.current);
      trackingIntervalRef.current = window.setInterval(() => performUpdate(false, true), 20000);
      if(!silentRestore) sendWhatsAppUpdate('start');
  };

  const stopLiveTracking = (silent = false) => {
      if (trackingIntervalRef.current) clearInterval(trackingIntervalRef.current);
      setIsLiveTracking(false);
      releaseWakeLock();
      if(shipment) localStorage.removeItem(`rodovar_tracking_state_${shipment.code}`);
      if(!silent) sendWhatsAppUpdate('stop');
  };

  const sendWhatsAppUpdate = (type: string) => {
       if (!shipment) return;
       let text = "";
       const now = getNowFormatted();
       
       if (type === 'start') {
           text = `🚛 *INICIANDO VIAGEM* 🏁%0A%0A🆔 Carga: *${shipment.code}*%0A👤 Motorista: *${shipment.driverName}*%0A📍 Origem: ${shipment.origin}%0A🎯 Destino: ${shipment.destination}%0A%0A_Iniciando rastreamento satelital via App Rodovar_`;
       } else if (type === 'finish') {
           text = `✅ *ENTREGA FINALIZADA* 🎉%0A%0A🆔 Carga: *${shipment.code}*%0A📄 Canhoto Digital Gerado%0A📝 Assinado por: *${receiverName}*%0A🕒 Horário: ${now}%0A%0A_Missão cumprida com sucesso!_`;
       } else if (type === 'problem') {
           text = `🚨 *SOS / PROBLEMA* ⚠️%0A%0A🆔 Carga: *${shipment.code}*%0A📍 Local Atual: ${shipment.currentLocation.city}, ${shipment.currentLocation.state}%0A%0A_Solicito suporte imediato da central!_`;
       } else if (type === 'update') {
           text = `📍 *STATUS ATUALIZAÇÃO* 📡%0A%0A🆔 Carga: *${shipment.code}*%0A🌎 Local: *${shipment.currentLocation.city} - ${shipment.currentLocation.state}*%0A🕒 Hora: ${now}%0A%0A_Seguindo rota normalmente._`;
       } else {
           text = `ℹ️ *ATUALIZAÇÃO RODOVAR*%0A%0ACarga: ${shipment.code}%0AStatus: ${shipment.status}`;
       }
       
       // Add Maps Link if location available
       if (shipment.currentLocation.coordinates) {
           const { lat, lng } = shipment.currentLocation.coordinates;
           text += `%0A🗺️ Ver no Mapa: https://maps.google.com/?q=${lat},${lng}`;
       }

       const url = `https://wa.me/${MANAGER_PHONE}?text=${text}`;
       if(navigator.onLine) window.open(url, '_blank');
  };

  const handleShipmentLogin = async (e: React.FormEvent | null, codeOverride?: string) => {
    if (e) e.preventDefault();
    const codeToUse = codeOverride || code;
    if (!codeToUse) return;
    setIsLocating(true);
    const found = await getShipment(codeToUse.toUpperCase());
    if (found) {
        setShipment(found);
        setDriverNotes(found.driverNotes || '');
        setError('');
        localStorage.setItem('rodovar_active_driver_code', found.code);
        if (found.currentLocation.coordinates && found.destinationCoordinates) {
             const dist = getDistanceFromLatLonInKm(found.currentLocation.coordinates.lat, found.currentLocation.coordinates.lng, found.destinationCoordinates.lat, found.destinationCoordinates.lng);
             setRemainingDistanceKm(dist);
        }
    } else {
        setError('Código inválido ou carga não encontrada.');
    }
    setIsLocating(false);
  };

  const handleLogout = () => { stopLiveTracking(true); localStorage.removeItem('rodovar_active_driver_code'); setShipment(null); setCode(''); };
  
  const toggleLiveTracking = () => {
    if (isLiveTracking) {
        stopLiveTracking();
    } else {
        if (shipment) {
            startLiveTracking(shipment.code);
        }
    }
  };

  const isCloseEnoughToFinish = remainingDistanceKm !== null && remainingDistanceKm <= 2.0; 
  const isTripCompleted = shipment?.status === TrackingStatus.DELIVERED;

  // --- LOGIN SCREEN ---
  if (!shipment) {
      return (
          <div className="flex flex-col items-center justify-center min-h-[85vh] px-4 animate-[fadeIn_0.5s]">
            <div className="bg-rodovar-gray w-full max-w-md p-8 rounded-2xl shadow-2xl border border-gray-700 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-rodovar-yellow"></div>
                
                <div className="text-center mb-8">
                    <div className="w-20 h-20 bg-black/40 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-700 shadow-inner">
                        <SteeringWheelIcon className="w-10 h-10 text-rodovar-yellow"/>
                    </div>
                    <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Portal do Motorista</h2>
                    <p className="text-gray-400 text-xs mt-1 uppercase tracking-widest">Acesso Restrito ao Sistema</p>
                </div>

                <div className="space-y-6">
                    <div className="relative group">
                        <label className="text-[10px] text-rodovar-yellow font-bold uppercase mb-1 block pl-1">Código da Viagem</label>
                        <input 
                            value={code} 
                            onChange={e => setCode(e.target.value.toUpperCase())} 
                            className="w-full bg-black/40 border border-gray-600 rounded-xl p-4 text-white text-center font-mono text-lg uppercase tracking-widest focus:border-rodovar-yellow focus:ring-1 focus:ring-rodovar-yellow outline-none transition-all placeholder-gray-700" 
                            placeholder="EX: RODOVAR1234" 
                        />
                        <button 
                            onClick={startCodeVoiceInput}
                            className={`absolute right-2 bottom-2 p-2 rounded-full transition-all ${isListeningCode ? 'bg-red-600 text-white animate-pulse' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                            title="Falar Código"
                        >
                            <MicrophoneIcon className="w-5 h-5" />
                        </button>
                    </div>

                    <button 
                        onClick={e => handleShipmentLogin(e)} 
                        disabled={isLocating}
                        className="w-full bg-rodovar-yellow text-black font-black py-4 rounded-xl hover:bg-yellow-400 uppercase tracking-widest shadow-[0_0_15px_rgba(255,215,0,0.3)] transform transition hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLocating ? 'VALIDANDO...' : 'ACESSAR PAINEL'}
                    </button>
                    
                    {error && (
                        <div className="bg-red-900/20 border border-red-500/50 p-3 rounded-lg text-center">
                            <p className="text-red-400 text-xs font-bold">{error}</p>
                        </div>
                    )}
                </div>

                <div className="mt-8 pt-6 border-t border-gray-800 text-center">
                    <button onClick={onClose} className="text-gray-500 text-xs hover:text-white transition-colors uppercase tracking-wider">
                        ← Voltar ao Rastreamento
                    </button>
                </div>
            </div>
          </div>
      );
  }

  // --- DASHBOARD SCREEN ---
  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-4 md:py-6 flex flex-col pb-24 md:pb-20 animate-[fadeIn_0.5s]">
         
         {/* PROOF OF DELIVERY MODAL */}
         {showProofModal && (
             <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
                 <div className="bg-rodovar-gray w-full max-w-lg rounded-2xl border border-gray-700 shadow-2xl p-6 relative h-auto max-h-[95vh] overflow-y-auto">
                     <button onClick={() => setShowProofModal(false)} className="absolute top-4 right-4 text-gray-500 text-2xl hover:text-white transition-colors">×</button>
                     
                     <div className="text-center mb-6">
                         <div className="w-16 h-16 bg-rodovar-yellow rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg">
                             <PenIcon className="w-8 h-8 text-black" />
                         </div>
                         <h2 className="text-2xl font-bold text-rodovar-white uppercase">Finalizar Entrega</h2>
                         <p className="text-gray-400 text-sm">Coletar assinatura digital e foto</p>
                     </div>

                     <div className="space-y-4">
                         <div>
                             <label className="text-xs text-rodovar-yellow font-bold uppercase">Nome do Recebedor</label>
                             <input value={receiverName} onChange={e => setReceiverName(e.target.value)} className="w-full bg-black border border-gray-600 rounded-lg p-3 text-white focus:border-rodovar-yellow outline-none" placeholder="Quem recebeu?" />
                         </div>
                         <div>
                             <label className="text-xs text-rodovar-yellow font-bold uppercase">Documento (CPF/RG)</label>
                             <input value={receiverDoc} onChange={e => setReceiverDoc(e.target.value)} className="w-full bg-black border border-gray-600 rounded-lg p-3 text-white focus:border-rodovar-yellow outline-none" placeholder="Documento" />
                         </div>

                         <div>
                             <label className="text-xs text-rodovar-yellow font-bold uppercase mb-2 block">Assinatura do Recebedor</label>
                             <div className="bg-white rounded-lg overflow-hidden relative h-40 w-full touch-none border-2 border-gray-700">
                                 <canvas 
                                    ref={canvasRef} 
                                    width={400} 
                                    height={160} 
                                    className="w-full h-full cursor-crosshair"
                                    onMouseDown={startDrawing}
                                    onMouseMove={draw}
                                    onMouseUp={stopDrawing}
                                    onMouseLeave={stopDrawing}
                                    onTouchStart={startDrawing}
                                    onTouchMove={draw}
                                    onTouchEnd={stopDrawing}
                                 />
                                 <button onClick={clearSignature} className="absolute bottom-2 right-2 text-[10px] bg-red-100 text-red-600 px-2 py-1 rounded hover:bg-red-200">Limpar</button>
                             </div>
                             <p className="text-[10px] text-gray-500 mt-1 text-center">Assine na área branca acima com o dedo.</p>
                         </div>

                         <div>
                             <label className="text-xs text-rodovar-yellow font-bold uppercase mb-2 block">Foto da Carga/Local</label>
                             <div className="border-2 border-dashed border-gray-600 rounded-lg p-4 bg-black/20 text-center relative hover:border-rodovar-yellow transition-colors">
                                  <input type="file" accept="image/*" capture="environment" onChange={handleProofPhoto} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                                  {proofPhoto ? (
                                      <img src={proofPhoto} className="h-32 mx-auto rounded object-cover shadow-lg" />
                                  ) : (
                                      <div className="flex flex-col items-center text-gray-400">
                                          <CameraIcon className="w-8 h-8 mb-2" />
                                          <span className="text-xs">Toque para tirar foto</span>
                                      </div>
                                  )}
                             </div>
                         </div>
                         
                         <button onClick={submitProofOfDelivery} className="w-full bg-green-600 text-white font-bold py-4 rounded-xl shadow-lg uppercase tracking-widest mt-4 hover:bg-green-500 transition-colors">
                             Confirmar Entrega
                         </button>
                     </div>
                 </div>
             </div>
         )}
        
        {/* MAIN DASHBOARD UI */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 bg-rodovar-gray p-4 md:p-6 rounded-xl border border-gray-800 shadow-xl gap-4">
            <div className="flex items-center gap-4">
                 <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center border border-gray-600">
                     <SteeringWheelIcon className="w-6 h-6 text-rodovar-yellow" />
                 </div>
                 <div>
                    <h1 className="text-lg md:text-xl font-bold text-white uppercase">{companySettings.name}</h1>
                    <p className="text-xs text-gray-400 flex items-center gap-1">
                        <UserIcon className="w-3 h-3" /> {shipment.driverName || 'Motorista'}
                    </p>
                </div>
            </div>
            <div className="flex gap-2 w-full md:w-auto">
                <button onClick={toggleVoiceAssistant} className={`flex-1 md:flex-none p-3 rounded-lg border border-gray-700 flex items-center justify-center gap-2 transition-all ${isVoiceActive ? 'bg-indigo-600 border-indigo-500 animate-pulse text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'}`}>
                    {isVoiceActive ? <MicrophoneIcon className="w-5 h-5" /> : <MicrophoneOffIcon className="w-5 h-5" />}
                    <span className="text-xs font-bold md:hidden">Voz</span>
                </button>
                <button onClick={handleLogout} className="flex-1 md:flex-none text-xs border border-red-900/50 bg-red-900/10 px-4 py-3 rounded-lg text-red-400 font-bold hover:bg-red-900/30 transition-colors uppercase">Sair</button>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="flex flex-col gap-6">
                 <div className="bg-rodovar-gray p-6 rounded-xl border border-gray-700 text-center shadow-xl relative overflow-hidden">
                     {/* Status Badge */}
                     <div className="absolute top-4 right-4">
                         <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${isLiveTracking ? 'bg-red-600 text-white animate-pulse' : 'bg-gray-800 text-gray-400'}`}>
                             {isLiveTracking ? 'Ao Vivo' : 'Offline'}
                         </span>
                     </div>

                     <div className="text-4xl md:text-5xl font-black text-rodovar-yellow font-mono mb-4 tracking-tighter">{shipment.code}</div>
                     
                     <div className="flex justify-center items-center gap-2 mb-8 bg-black/20 p-3 rounded-lg mx-auto w-fit border border-gray-800">
                         <span className="text-gray-300 text-xs font-bold uppercase">{shipment.origin}</span>
                         <span className="text-gray-600">➔</span>
                         <span className="text-rodovar-yellow text-xs font-bold uppercase">{shipment.destination}</span>
                     </div>

                     {!isTripCompleted && (
                         <button 
                            onClick={toggleLiveTracking} 
                            className={`w-full py-4 rounded-xl font-bold uppercase tracking-widest mb-3 flex items-center justify-center gap-2 shadow-lg transition-all ${isLiveTracking ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-green-600 text-white hover:bg-green-500'}`}
                        >
                            {isLiveTracking ? 'PARAR RASTREAMENTO' : 'INICIAR VIAGEM'}
                        </button>
                     )}

                     <button 
                        onClick={handleUpdateTrip}
                        disabled={isLocating || isTripCompleted}
                        className={`w-full py-4 rounded-xl font-bold uppercase tracking-widest shadow-lg transition-all ${
                            isTripCompleted ? 'bg-gray-700 text-gray-400 cursor-not-allowed' :
                            isCloseEnoughToFinish ? 'bg-rodovar-yellow text-black animate-bounce hover:bg-yellow-400' : 
                            'bg-gray-700 text-white hover:bg-gray-600'
                        }`}
                     >
                         {isLocating ? 'PROCESSANDO...' : isTripCompleted ? 'VIAGEM FINALIZADA' : isCloseEnoughToFinish ? '📍 CONCLUIR ENTREGA' : 'ATUALIZAR POSIÇÃO'}
                     </button>
                     
                     <p className="text-[10px] text-gray-500 mt-4 font-mono">{lastUpdateLog}</p>
                 </div>
                 
                 {/* QUICK ACTIONS */}
                 <div className="bg-rodovar-gray p-4 rounded-xl border border-gray-700 grid grid-cols-2 gap-4 shadow-xl">
                     <button onClick={() => sendWhatsAppUpdate('problem')} className="bg-red-900/20 text-red-400 py-4 rounded-lg border border-red-900/50 text-xs font-bold uppercase flex flex-col items-center justify-center gap-1 hover:bg-red-900/30 transition-colors">
                        <span className="text-xl">⚠️</span> SOS Problema
                     </button>
                     <button onClick={() => sendWhatsAppUpdate('update')} className="bg-blue-900/20 text-blue-400 py-4 rounded-lg border border-blue-900/50 text-xs font-bold uppercase flex flex-col items-center justify-center gap-1 hover:bg-blue-900/30 transition-colors">
                        <span className="text-xl">📍</span> Enviar Local
                     </button>
                 </div>
            </div>

            <div className="h-[400px] md:h-auto min-h-[400px] bg-rodovar-gray rounded-xl border border-gray-700 overflow-hidden relative shadow-xl">
                 <MapVisualization coordinates={shipment.currentLocation.coordinates} destinationCoordinates={shipment.destinationCoordinates} stops={shipment.stops} className="w-full h-full"/>
                 {shipment.stops && shipment.stops.length > 0 && (
                     <div className="absolute bottom-4 left-4 bg-black/80 backdrop-blur text-white text-[10px] p-2 rounded border border-gray-700 max-w-[200px]">
                         <p className="font-bold text-rodovar-yellow mb-1">ROTA:</p>
                         {shipment.stops.map((s, i) => (
                             <div key={i} className="truncate">{i+1}. {s.city}</div>
                         ))}
                     </div>
                 )}
            </div>
        </div>
    </div>
  );
};

export default DriverPanel;
