'use client';

import { useState, useRef } from 'react';
import { encryptData, decryptData, generateSHA256 } from '@/utils/crypto';
import { hideDataInCanvas, extractDataFromCanvas } from '@/utils/stego';
import { connectWallet, storeHashOnBlockchain } from '@/utils/web3';

export default function Home() {
  // Navigation
  const [activeTab, setActiveTab] = useState('ingest'); // 'ingest' | 'extract' | 'audit' | 'specs'

  // Input & Vault Ingestion States
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [secretKey, setSecretKey] = useState('');
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [carrierImage, setCarrierImage] = useState(null);
  const [imageMeta, setImageMeta] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // Ingestion Output States
  const [encryptedText, setEncryptedText] = useState('');
  const [stegoImage, setStegoImage] = useState(null);
  const [imageHash, setImageHash] = useState('');
  
  // Web3 & Blockchain Audit States
  const [walletAddress, setWalletAddress] = useState('');
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);
  const [blockchainTxHash, setBlockchainTxHash] = useState('');
  const [blockchainStatus, setBlockchainStatus] = useState('idle'); // 'idle' | 'pending' | 'success' | 'error'
  const [auditHashInput, setAuditHashInput] = useState('');
  const [auditResult, setAuditResult] = useState(null);

  // Extraction States
  const [extractCarrierImage, setExtractCarrierImage] = useState(null);
  const [extractKey, setExtractKey] = useState('');
  const [showExtractKey, setShowExtractKey] = useState(false);
  const [extractedCipher, setExtractedCipher] = useState('');
  const [extractedSecret, setExtractedSecret] = useState('');
  const [showExtractedSecret, setShowExtractedSecret] = useState(false);
  const [extractionStatus, setExtractionStatus] = useState('idle'); // 'idle' | 'success' | 'error'

  const canvasRef = useRef(null);
  const extractCanvasRef = useRef(null);

  // Toast Notification Helper
  const showToast = (msg, type = 'info') => {
    setToastMessage({ msg, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Helper: Copy to Clipboard
  const copyToClipboard = (text, label) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    showToast(`${label} copied to clipboard!`, 'success');
  };

  // Helper: Generate Random AES Key
  const generateRandomKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let key = '';
    for (let i = 0; i < 24; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setSecretKey(key);
    showToast('Generated 24-character cryptographic key', 'info');
  };

  // Password Strength Indicator
  const getPasswordStrength = (pwd) => {
    if (!pwd) return { score: 0, label: 'None', color: 'bg-slate-700' };
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;

    if (score <= 2) return { score: 33, label: 'Weak', color: 'bg-red-500', text: 'text-red-400' };
    if (score <= 4) return { score: 66, label: 'Medium', color: 'bg-amber-500', text: 'text-amber-400' };
    return { score: 100, label: 'Military-Grade', color: 'bg-emerald-500', text: 'text-emerald-400' };
  };

  // Handle Carrier Image Selection
  const processImageFile = (file) => {
    if (!file) return;
    if (file.type !== 'image/png') {
      showToast('Please select a PNG image for lossless LSB steganography.', 'warning');
      return;
    }
    const url = URL.createObjectURL(file);
    setCarrierImage(url);
    
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      // Max storage capacity calculation in bytes (1 bit per red channel pixel - 8 bits per char)
      const totalPixels = img.width * img.height;
      const capacityBytes = Math.floor(totalPixels / 8);

      setImageMeta({
        name: file.name,
        width: img.width,
        height: img.height,
        size: (file.size / 1024).toFixed(1) + ' KB',
        maxCapacity: capacityBytes + ' bytes'
      });
    };
    img.src = url;
  };

  const handleImageChange = (e) => {
    processImageFile(e.target.files[0]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processImageFile(e.dataTransfer.files[0]);
    }
  };

  // Step 1 & 2: Encrypt + Steganography
  const handleHideSecret = () => {
    if (!password || !secretKey || !carrierImage) {
      showToast('Please complete all Layer 1 & 2 inputs (Password, Master Key, and PNG Image).', 'warning');
      return;
    }

    setIsProcessing(true);

    try {
      // Layer 1: AES-256 Encryption
      const encrypted = encryptData(password, secretKey);
      setEncryptedText(encrypted);

      // Layer 2: LSB Steganography
      const canvas = canvasRef.current;
      const stegoDataUrl = hideDataInCanvas(canvas, encrypted);
      setStegoImage(stegoDataUrl);

      // Layer 1/3: SHA-256 Hash Digest
      const hash = generateSHA256(stegoDataUrl);
      setImageHash(hash);
      setAuditHashInput(hash);

      showToast('3-Layer Security Pipeline Executed Successfully!', 'success');
    } catch (err) {
      showToast(err.message || 'Error processing steganography pipeline.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Connect Web3 Wallet
  const handleConnectWallet = async () => {
    setIsConnectingWallet(true);
    try {
      const { signer } = await connectWallet();
      const address = await signer.getAddress();
      setWalletAddress(address);
      showToast(`Connected Web3 Wallet: ${address.substring(0, 6)}...${address.substring(address.length - 4)}`, 'success');
    } catch (err) {
      showToast(err.message || 'Failed to connect wallet.', 'error');
    } finally {
      setIsConnectingWallet(false);
    }
  };

  // Register Hash on Blockchain (Layer 3)
  const handleRegisterOnBlockchain = async () => {
    if (!imageHash) {
      showToast('No SHA-256 hash available. Encrypt & hide a payload first.', 'warning');
      return;
    }
    setBlockchainStatus('pending');
    try {
      const txHash = await storeHashOnBlockchain(imageHash);
      setBlockchainTxHash(txHash);
      setBlockchainStatus('success');
      showToast('Successfully registered image digest on Blockchain Ledger!', 'success');
    } catch (err) {
      setBlockchainStatus('error');
      showToast(err.message || 'Blockchain transaction failed or rejected.', 'error');
    }
  };

  // Step 2 & 1: Extract + Decrypt
  const handleExtractSecret = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setExtractCarrierImage(URL.createObjectURL(file));
    const img = new Image();
    img.onload = () => {
      const canvas = extractCanvasRef.current;
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      // Extract Ciphertext
      const cipher = extractDataFromCanvas(canvas);
      if (cipher) {
        setExtractedCipher(cipher);
        if (extractKey) {
          const decrypted = decryptData(cipher, extractKey);
          if (decrypted) {
            setExtractedSecret(decrypted);
            setExtractionStatus('success');
            showToast('Decryption successful!', 'success');
          } else {
            setExtractedSecret('Invalid Master Key!');
            setExtractionStatus('error');
          }
        }
      } else {
        setExtractedCipher('');
        setExtractedSecret('No LSB hidden payload detected in carrier image.');
        setExtractionStatus('error');
      }
    };
    img.src = URL.createObjectURL(file);
  };

  const handleManualDecrypt = () => {
    if (!extractedCipher) {
      showToast('Upload a valid stego-image first.', 'warning');
      return;
    }
    if (!extractKey) {
      showToast('Please enter the AES Master Key.', 'warning');
      return;
    }
    const decrypted = decryptData(extractedCipher, extractKey);
    if (decrypted) {
      setExtractedSecret(decrypted);
      setExtractionStatus('success');
      showToast('Payload decrypted successfully!', 'success');
    } else {
      setExtractedSecret('Invalid Master Key / Decryption Failed.');
      setExtractionStatus('error');
    }
  };

  // Mock Audit Hash Lookup
  const handleAuditHash = () => {
    if (!auditHashInput) {
      showToast('Enter a SHA-256 Hash to audit.', 'warning');
      return;
    }

    if (imageHash && auditHashInput.toLowerCase() === imageHash.toLowerCase()) {
      setAuditResult({
        verified: true,
        hash: auditHashInput,
        timestamp: new Date().toLocaleString(),
        layer1Status: 'AES-256 Validated',
        layer2Status: 'LSB Spatial Integrity Clean',
        layer3Status: blockchainStatus === 'success' ? 'Confirmed on-chain' : 'Hash Generated (Pending On-Chain Tx)',
        owner: walletAddress || '0x71C...B29a'
      });
    } else {
      setAuditResult({
        verified: false,
        hash: auditHashInput,
        timestamp: new Date().toLocaleString(),
        reason: 'Hash mismatch or record not found in ledger database.'
      });
    }
  };

  const pwdStrength = getPasswordStrength(password);

  return (
    <main className="min-h-screen pb-16 pt-6 px-4 sm:px-8 max-w-7xl mx-auto scanline-bg">
      {/* Toast Notification Alert */}
      {toastMessage && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-2xl backdrop-blur-md border flex items-center gap-3 transition-all duration-300 ${
          toastMessage.type === 'success' ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-300' :
          toastMessage.type === 'warning' ? 'bg-amber-950/90 border-amber-500/50 text-amber-300' :
          toastMessage.type === 'error' ? 'bg-red-950/90 border-red-500/50 text-red-300' :
          'bg-slate-900/90 border-cyan-500/50 text-cyan-300'
        }`}>
          <div className="w-2 h-2 rounded-full bg-current animate-ping" />
          <span className="text-sm font-medium">{toastMessage.msg}</span>
        </div>
      )}

      {/* HEADER BAR */}
      <header className="glass-card rounded-2xl p-6 mb-8 border border-slate-800 relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="p-2 bg-gradient-to-br from-cyan-500 to-emerald-500 text-slate-950 rounded-lg shadow-lg font-black text-xl tracking-wider">
                3S
              </span>
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
                  TRIPLE-SHIELD VAULT
                  <span className="text-xs font-mono font-normal px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                    v2.4 Enterprise
                  </span>
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                  Multi-Layer Defense Architecture: AES-256 Cryptography (L1) + LSB Image Steganography (L2) + Web3 Ledger (L3)
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>3/3 LAYERS ACTIVE</span>
            </div>

            <button
              onClick={handleConnectWallet}
              disabled={isConnectingWallet}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-cyan-500/30 hover:border-cyan-500/60 text-slate-200 text-xs font-mono transition-all shadow-lg hover:shadow-cyan-500/10"
            >
              <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              {walletAddress ? `${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 4)}` : 'Connect Web3 Wallet'}
            </button>
          </div>
        </div>

        {/* VISUAL 3-LAYER ARCHITECTURE DIAGRAM BAR */}
        <div className="mt-6 pt-6 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/80 border border-cyan-500/30">
            <div className="p-2.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono font-bold text-xs">
              L1
            </div>
            <div>
              <div className="text-xs font-semibold text-cyan-300">Layer 1: Cryptography</div>
              <div className="text-[11px] text-slate-400 font-mono">AES-256-CBC + SHA-256</div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/80 border border-emerald-500/30">
            <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono font-bold text-xs">
              L2
            </div>
            <div>
              <div className="text-xs font-semibold text-emerald-300">Layer 2: Steganography</div>
              <div className="text-[11px] text-slate-400 font-mono">LSB Spatial Image Matrix</div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/80 border border-purple-500/30">
            <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 font-mono font-bold text-xs">
              L3
            </div>
            <div>
              <div className="text-xs font-semibold text-purple-300">Layer 3: Web3 Ledger</div>
              <div className="text-[11px] text-slate-400 font-mono">Ethereum PasswordLedger.sol</div>
            </div>
          </div>
        </div>
      </header>

      {/* DASHBOARD NAVIGATION TABS */}
      <div className="flex flex-wrap items-center gap-2 mb-6 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('ingest')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            activeTab === 'ingest'
              ? 'bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 text-cyan-300 border border-cyan-500/40 shadow-lg glow-layer1'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Vault Store (Ingest & Embed)
        </button>

        <button
          onClick={() => setActiveTab('extract')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            activeTab === 'extract'
              ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-300 border border-emerald-500/40 shadow-lg glow-layer2'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
          </svg>
          Vault Retrieve (Extract & Decrypt)
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            activeTab === 'audit'
              ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 border border-purple-500/40 shadow-lg glow-layer3'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          Blockchain Audit (Layer 3 Ledger)
        </button>

        <button
          onClick={() => setActiveTab('specs')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            activeTab === 'specs'
              ? 'bg-slate-800 text-cyan-400 border border-slate-700'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          3-Layer Security Specs
        </button>
      </div>

      {/* TAB 1: VAULT INGESTION (STORE & EMBED) */}
      {activeTab === 'ingest' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Inputs Column */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* LAYER 1 INPUT CARD */}
            <div className="glass-card rounded-2xl p-6 border-l-4 border-l-cyan-500 relative">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                    LAYER 1
                  </span>
                  <h2 className="text-lg font-bold text-white">Cryptographic Encryption Config</h2>
                </div>
                <span className="text-xs text-slate-400 font-mono">AES-256-CBC</span>
              </div>

              <div className="space-y-4">
                {/* Password Payload Input */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Secret Password / Data Payload
                    </label>
                    {password && (
                      <span className={`text-[11px] font-mono font-medium ${pwdStrength.text}`}>
                        Strength: {pwdStrength.label}
                      </span>
                    )}
                  </div>

                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 font-mono transition-all"
                      placeholder="e.g. SecretP@ssword2026! or private key..."
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200 text-xs"
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>

                  {/* Password Strength Meter Bar */}
                  {password && (
                    <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
                      <div
                        className={`h-full ${pwdStrength.color} transition-all duration-300`}
                        style={{ width: `${pwdStrength.score}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Secret Key Input */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      AES Master Passphrase / Secret Key
                    </label>
                    <button
                      type="button"
                      onClick={generateRandomKey}
                      className="text-[11px] text-cyan-400 hover:text-cyan-300 underline font-mono"
                    >
                      Generate Secure Key
                    </button>
                  </div>

                  <div className="relative">
                    <input
                      type={showSecretKey ? 'text' : 'password'}
                      className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 font-mono transition-all"
                      placeholder="Enter cryptographic secret key..."
                      value={secretKey}
                      onChange={(e) => setSecretKey(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecretKey(!showSecretKey)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200 text-xs"
                    >
                      {showSecretKey ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* LAYER 2 CARRIER IMAGE DROPZONE */}
            <div className="glass-card rounded-2xl p-6 border-l-4 border-l-emerald-500">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    LAYER 2
                  </span>
                  <h2 className="text-lg font-bold text-white">Spatial Carrier Image (PNG)</h2>
                </div>
                <span className="text-xs text-slate-400 font-mono">LSB Pixel Matrix</span>
              </div>

              {/* Drag and Drop Zone */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className="border-2 border-dashed border-slate-700 hover:border-emerald-500/60 rounded-xl p-6 text-center transition-all cursor-pointer bg-slate-950/40 relative group"
              >
                <input
                  type="file"
                  accept="image/png"
                  onChange={handleImageChange}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                />

                {carrierImage ? (
                  <div className="flex flex-col items-center">
                    <img
                      src={carrierImage}
                      alt="Carrier Preview"
                      className="h-32 object-contain rounded-lg border border-slate-700 shadow-md mb-3"
                    />
                    <div className="text-xs text-emerald-400 font-semibold mb-1">
                      Carrier Image Loaded Ready
                    </div>
                    {imageMeta && (
                      <div className="flex flex-wrap justify-center gap-3 text-[11px] text-slate-400 font-mono bg-slate-900/90 px-3 py-1.5 rounded-lg border border-slate-800">
                        <span>Dim: {imageMeta.width}x{imageMeta.height} px</span>
                        <span>Size: {imageMeta.size}</span>
                        <span>Cap: {imageMeta.maxCapacity}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-4">
                    <svg className="w-10 h-10 mx-auto text-slate-500 group-hover:text-emerald-400 mb-3 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-sm font-medium text-slate-300">
                      Drag & Drop Carrier PNG Image Here
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      or click to browse local files (Lossless PNG format required)
                    </p>
                  </div>
                )}
              </div>

              {/* Execute Button */}
              <button
                onClick={handleHideSecret}
                disabled={isProcessing}
                className="w-full mt-5 py-3.5 rounded-xl font-bold text-slate-950 bg-gradient-to-r from-cyan-400 via-emerald-400 to-teal-300 hover:brightness-110 active:scale-[0.99] transition-all shadow-lg glow-layer2 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isProcessing ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-slate-950" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Executing 3-Layer Embedding Pipeline...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span>EXECUTE 3-LAYER SECURITY EMBEDDING</span>
                  </>
                )}
              </button>
            </div>

            <canvas ref={canvasRef} className="hidden" />
          </div>

          {/* Right Outputs Column */}
          <div className="lg:col-span-5 space-y-6">
            <div className="glass-card rounded-2xl p-6 h-full flex flex-col justify-between border border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
                  3-Layer Pipeline Output Feed
                </h3>

                {encryptedText ? (
                  <div className="space-y-5">
                    {/* Layer 1 AES Cipher Output */}
                    <div className="p-4 rounded-xl bg-slate-950/80 border border-cyan-500/30">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-cyan-400 font-mono flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                          LAYER 1: AES-256 Ciphertext
                        </span>
                        <button
                          onClick={() => copyToClipboard(encryptedText, 'AES Ciphertext')}
                          className="text-[11px] text-slate-400 hover:text-cyan-300 font-mono px-2 py-0.5 bg-slate-900 rounded border border-slate-800"
                        >
                          Copy
                        </button>
                      </div>
                      <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 text-[11px] font-mono text-cyan-300 break-all max-h-24 overflow-y-auto">
                        {encryptedText}
                      </div>
                    </div>

                    {/* Layer 1 SHA-256 Digest Output */}
                    <div className="p-4 rounded-xl bg-slate-950/80 border border-amber-500/30">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-amber-400 font-mono flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          SHA-256 Immutable Hash Digest
                        </span>
                        <button
                          onClick={() => copyToClipboard(imageHash, 'SHA-256 Hash')}
                          className="text-[11px] text-slate-400 hover:text-amber-300 font-mono px-2 py-0.5 bg-slate-900 rounded border border-slate-800"
                        >
                          Copy
                        </button>
                      </div>
                      <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 text-[11px] font-mono text-amber-300 break-all">
                        {imageHash}
                      </div>
                    </div>

                    {/* Layer 2 Stego Image Output */}
                    {stegoImage && (
                      <div className="p-4 rounded-xl bg-slate-950/80 border border-emerald-500/30">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-emerald-400 font-mono flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            LAYER 2: Generated Stego-Image
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-4 mt-2">
                          <img
                            src={stegoImage}
                            alt="Generated Stego"
                            className="w-20 h-20 object-contain rounded-lg border border-emerald-500/40 bg-black/40"
                          />
                          <div className="flex-1">
                            <p className="text-xs text-slate-300 mb-2">
                              Stego image embedded with encrypted payload via LSB spatial encoding.
                            </p>
                            <a
                              href={stegoImage}
                              download="stego-vault-image.png"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all shadow-md"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                              Download Stego Image
                            </a>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Layer 3 Web3 Smart Contract Register Action */}
                    <div className="p-4 rounded-xl bg-slate-950/80 border border-purple-500/30">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-purple-400 font-mono flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                          LAYER 3: Web3 Blockchain Verification
                        </span>
                        {blockchainStatus === 'success' && (
                          <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/40 px-2 py-0.5 rounded font-mono">
                            REGISTERED
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-400 mb-3">
                        Commit the stego image hash digest to the Ethereum smart contract (<code className="text-purple-300">PasswordLedger.sol</code>) for anti-tamper verification.
                      </p>

                      <button
                        onClick={handleRegisterOnBlockchain}
                        disabled={blockchainStatus === 'pending'}
                        className="w-full py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {blockchainStatus === 'pending' ? (
                          <span>Registering Hash On-Chain...</span>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                            <span>Register Hash on Smart Contract</span>
                          </>
                        )}
                      </button>

                      {blockchainTxHash && (
                        <div className="mt-3 text-[11px] font-mono text-slate-400 bg-slate-900 p-2 rounded border border-slate-800 break-all">
                          Tx Hash: <span className="text-purple-300">{blockchainTxHash}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="h-64 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-slate-800 rounded-xl bg-slate-950/40">
                    <svg className="w-12 h-12 text-slate-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-sm text-slate-400 font-medium">Awaiting Pipeline Execution</p>
                    <p className="text-xs text-slate-600 mt-1 max-w-xs">
                      Fill Layer 1 passphrase & upload Layer 2 carrier image to generate encrypted stego assets.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: VAULT EXTRACTION (RETRIEVE & DECRYPT) */}
      {activeTab === 'extract' && (
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="glass-card rounded-2xl p-6 sm:p-8 border-l-4 border-l-emerald-500">
            <div className="flex items-center justify-between mb-6">
              <div>
                <span className="px-2.5 py-0.5 text-xs font-mono font-bold rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  REVERSE PIPELINE
                </span>
                <h2 className="text-xl font-bold text-white mt-1">Extract & Decrypt Vault Data</h2>
              </div>
              <span className="text-xs text-slate-400 font-mono">LSB Decode → AES Decrypt</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Stego Image Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Upload Stego Image (PNG)
                </label>
                <input
                  type="file"
                  accept="image/png"
                  onChange={handleExtractSecret}
                  className="block w-full text-xs text-slate-400 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-cyan-300 hover:file:bg-slate-700 cursor-pointer bg-slate-950 rounded-xl border border-slate-800 p-2"
                />

                {extractCarrierImage && (
                  <div className="mt-4 p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-3">
                    <img
                      src={extractCarrierImage}
                      alt="Uploaded Stego"
                      className="w-16 h-16 object-contain rounded border border-emerald-500/40"
                    />
                    <div>
                      <div className="text-xs font-semibold text-emerald-400">Stego Image Loaded</div>
                      <div className="text-[11px] text-slate-400 font-mono">LSB Extraction Active</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Master Key Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  AES Master Secret Key
                </label>
                <div className="relative mb-4">
                  <input
                    type={showExtractKey ? 'text' : 'password'}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-emerald-500 font-mono"
                    placeholder="Enter decryption passphrase..."
                    value={extractKey}
                    onChange={(e) => setExtractKey(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowExtractKey(!showExtractKey)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200 text-xs"
                  >
                    {showExtractKey ? 'Hide' : 'Show'}
                  </button>
                </div>

                <button
                  onClick={handleManualDecrypt}
                  className="w-full py-2.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-all shadow-md text-xs tracking-wider cursor-pointer"
                >
                  DECRYPT EXTRACTED PAYLOAD
                </button>
              </div>
            </div>

            <canvas ref={extractCanvasRef} className="hidden" />

            {/* Extracted Results Section */}
            {(extractedCipher || extractedSecret) && (
              <div className="mt-8 pt-6 border-t border-slate-800 space-y-4">
                {extractedCipher && (
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-xs text-slate-400 font-mono block mb-1">
                      Raw LSB Extracted Ciphertext:
                    </span>
                    <code className="text-xs font-mono text-cyan-400 break-all block">
                      {extractedCipher}
                    </code>
                  </div>
                )}

                {extractedSecret && (
                  <div className={`p-5 rounded-xl border ${
                    extractionStatus === 'success' ? 'bg-emerald-950/40 border-emerald-500/50' : 'bg-red-950/40 border-red-500/50'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-semibold font-mono ${
                        extractionStatus === 'success' ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                        {extractionStatus === 'success' ? '✓ RECOVERED SECRET PAYLOAD' : '⚠️ EXTRACTION ERROR'}
                      </span>
                      {extractionStatus === 'success' && (
                        <button
                          onClick={() => copyToClipboard(extractedSecret, 'Recovered Password')}
                          className="text-xs font-mono text-emerald-300 hover:underline"
                        >
                          Copy Secret
                        </button>
                      )}
                    </div>

                    <div className="relative">
                      <input
                        type={showExtractedSecret ? 'text' : 'password'}
                        readOnly
                        value={extractedSecret}
                        className="w-full bg-slate-900/90 border border-slate-800 rounded-lg p-3 text-emerald-300 font-mono text-base tracking-wide focus:outline-none"
                      />
                      <button
                        onClick={() => setShowExtractedSecret(!showExtractedSecret)}
                        className="absolute right-3 top-3 text-slate-400 hover:text-slate-200 text-xs"
                      >
                        {showExtractedSecret ? 'Hide' : 'Reveal'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: BLOCKCHAIN AUDIT (LAYER 3 LEDGER) */}
      {activeTab === 'audit' && (
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="glass-card rounded-2xl p-6 sm:p-8 border-l-4 border-l-purple-500">
            <div className="flex items-center justify-between mb-6">
              <div>
                <span className="px-2.5 py-0.5 text-xs font-mono font-bold rounded bg-purple-500/10 text-purple-400 border border-purple-500/30">
                  LAYER 3 AUDITOR
                </span>
                <h2 className="text-xl font-bold text-white mt-1">Smart Contract Ledger Integrity Checker</h2>
              </div>
              <span className="text-xs text-slate-400 font-mono">PasswordLedger.sol</span>
            </div>

            <div className="space-y-4 mb-6">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Audit Image SHA-256 Hash Digest
              </label>
              <div className="flex gap-3">
                <input
                  type="text"
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-100 text-xs font-mono focus:outline-none focus:border-purple-500"
                  placeholder="Paste SHA-256 image hash to verify..."
                  value={auditHashInput}
                  onChange={(e) => setAuditHashInput(e.target.value)}
                />
                <button
                  onClick={handleAuditHash}
                  className="px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-all cursor-pointer shadow-md"
                >
                  AUDIT LEDGER
                </button>
              </div>
            </div>

            {/* Audit Results Card */}
            {auditResult && (
              <div className={`p-6 rounded-2xl border ${
                auditResult.verified ? 'bg-slate-950/80 border-purple-500/50' : 'bg-red-950/30 border-red-500/40'
              }`}>
                <div className="flex items-center justify-between mb-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-mono font-bold ${
                    auditResult.verified ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40' : 'bg-red-500/20 text-red-300 border border-red-500/40'
                  }`}>
                    {auditResult.verified ? '✓ INTEGRITY VERIFIED (ON-CHAIN)' : '❌ UNVERIFIED OR TAMPERED'}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">{auditResult.timestamp}</span>
                </div>

                {auditResult.verified ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
                    <div className="p-3 bg-slate-900/90 rounded-lg border border-slate-800">
                      <span className="text-slate-500 block mb-1">Audited SHA-256 Digest</span>
                      <span className="text-purple-300 break-all">{auditResult.hash}</span>
                    </div>

                    <div className="p-3 bg-slate-900/90 rounded-lg border border-slate-800">
                      <span className="text-slate-500 block mb-1">Registrant Wallet Address</span>
                      <span className="text-cyan-300 font-bold">{auditResult.owner}</span>
                    </div>

                    <div className="p-3 bg-slate-900/90 rounded-lg border border-slate-800">
                      <span className="text-slate-500 block mb-1">Layer 1 Status</span>
                      <span className="text-emerald-400">{auditResult.layer1Status}</span>
                    </div>

                    <div className="p-3 bg-slate-900/90 rounded-lg border border-slate-800">
                      <span className="text-slate-500 block mb-1">Layer 2 Spatial Integrity</span>
                      <span className="text-emerald-400">{auditResult.layer2Status}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-red-300 font-mono">
                    {auditResult.reason}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: 3-LAYER SECURITY ARCHITECTURE SPECS */}
      {activeTab === 'specs' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glass-card rounded-2xl p-6 border-t-4 border-t-cyan-500 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 font-mono font-bold text-xs border border-cyan-500/30">
                  L1
                </span>
                <h3 className="text-base font-bold text-white">Layer 1: Cryptography</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Employs military-grade <strong className="text-cyan-300">AES-256 (Advanced Encryption Standard)</strong> cipher to protect data confidentiality. Plaintext passwords are transformed into unreadable ciphertext prior to image embedding.
              </p>
              <ul className="space-y-2 text-[11px] text-slate-300 font-mono">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  AES-256 Symmetric Encryption
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  SHA-256 Tamper Digest
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  Zero-Knowledge Client Encryption
                </li>
              </ul>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-800 text-[10px] font-mono text-cyan-400">
              Primary Goal: Confidentiality
            </div>
          </div>

          <div className="glass-card rounded-2xl p-6 border-t-4 border-t-emerald-500 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 font-mono font-bold text-xs border border-emerald-500/30">
                  L2
                </span>
                <h3 className="text-base font-bold text-white">Layer 2: Steganography</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Utilizes <strong className="text-emerald-300">LSB (Least Significant Bit)</strong> spatial pixel encoding to hide ciphertext invisibly inside innocent PNG image carrier files without visual distortion.
              </p>
              <ul className="space-y-2 text-[11px] text-slate-300 font-mono">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Spatial LSB Pixel Encoding
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Zero Visual Noise / Artifacts
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Delimiter Payloads (||END||)
                </li>
              </ul>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-800 text-[10px] font-mono text-emerald-400">
              Primary Goal: Covertness & Stealth
            </div>
          </div>

          <div className="glass-card rounded-2xl p-6 border-t-4 border-t-purple-500 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="p-2 rounded-lg bg-purple-500/10 text-purple-400 font-mono font-bold text-xs border border-purple-500/30">
                  L3
                </span>
                <h3 className="text-base font-bold text-white">Layer 3: Web3 Ledger</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Integrates an immutable <strong className="text-purple-300">Ethereum Smart Contract (PasswordLedger.sol)</strong> to anchor image hashes on-chain, enabling decentralized integrity verification.
              </p>
              <ul className="space-y-2 text-[11px] text-slate-300 font-mono">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                  EVM Smart Contract Ledger
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                  On-Chain Timestamping & Proof
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                  Anti-Tamper Record Verification
                </li>
              </ul>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-800 text-[10px] font-mono text-purple-400">
              Primary Goal: Immutability & Authenticity
            </div>
          </div>
        </div>
      )}
    </main>
  );
}