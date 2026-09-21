import CryptoJS from 'crypto-js';

// AES-256 Encryption
export function encryptData(secretText, secretKey) {
  return CryptoJS.AES.encrypt(secretText, secretKey).toString();
}

// AES-256 Decryption
export function decryptData(cipherText, secretKey) {
  try {
    const bytes = CryptoJS.AES.decrypt(cipherText, secretKey);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (e) {
    return null;
  }
}

// SHA-256 Hash Generation
export function generateSHA256(data) {
  return CryptoJS.SHA256(data).toString(CryptoJS.enc.Hex);
}