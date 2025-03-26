import { box, randomBytes } from 'tweetnacl';
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from 'tweetnacl-util';

export { decodeBase64, encodeBase64, encodeUTF8, decodeUTF8 };

export const generateKeyPair = () => {
  const keyPair = box.keyPair();
  return {
    publicKey: encodeBase64(keyPair.publicKey),
    secretKey: encodeBase64(keyPair.secretKey)
  };
};

export const encryptMessage = (message, recipientPublicKey, senderSecretKey) => {
  try {
    console.log('Encrypting message with:', {
      messageLength: message.length,
      recipientPublicKeyLength: recipientPublicKey.length,
      senderSecretKeyLength: senderSecretKey.length
    });

    // Decode the keys
    const decodedPublicKey = decodeBase64(recipientPublicKey);
    const decodedSecretKey = decodeBase64(senderSecretKey);

    // Generate ephemeral key pair for this message
    const ephemeralKeyPair = box.keyPair();
    
    // Create shared key using ephemeral secret key and recipient's public key
    const sharedKey = box.before(decodedPublicKey, ephemeralKeyPair.secretKey);
    
    // Convert message to Uint8Array
    const messageUint8 = decodeUTF8(message);
    
    // Generate random nonce
    const nonce = randomBytes(box.nonceLength);
    
    // Encrypt the message using the shared key
    const encryptedMessage = box.after(messageUint8, nonce, sharedKey);

    const result = {
      encrypted: encodeBase64(encryptedMessage),
      nonce: encodeBase64(nonce),
      ephemeralPublicKey: encodeBase64(ephemeralKeyPair.publicKey)
    };

    console.log('Encryption result:', {
      encryptedLength: result.encrypted.length,
      nonceLength: result.nonce.length,
      ephemeralPublicKeyLength: result.ephemeralPublicKey.length
    });

    return result;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt message');
  }
};

export const decryptMessage = (encryptedData, senderEphemeralPublicKey, recipientSecretKey) => {
  try {
    // Add input validation
    if (!encryptedData?.encrypted || !encryptedData?.nonce || !senderEphemeralPublicKey || !recipientSecretKey) {
      throw new Error('Missing required data for decryption');
    }

    // Debug logging
    console.log('Starting decryption with:', {
      encryptedLength: encryptedData.encrypted.length,
      nonceLength: encryptedData.nonce.length,
      ephemeralPublicKeyLength: senderEphemeralPublicKey.length,
      recipientSecretKeyLength: recipientSecretKey.length
    });

    // Decode the keys and encrypted data
    const decodedEphemeralPublicKey = decodeBase64(senderEphemeralPublicKey);
    const decodedSecretKey = decodeBase64(recipientSecretKey);
    const decodedEncrypted = decodeBase64(encryptedData.encrypted);
    const decodedNonce = decodeBase64(encryptedData.nonce);

    // Verify key lengths
    if (decodedEphemeralPublicKey.length !== box.publicKeyLength) {
      throw new Error(`Invalid ephemeral public key length: ${decodedEphemeralPublicKey.length}`);
    }
    if (decodedSecretKey.length !== box.secretKeyLength) {
      throw new Error(`Invalid secret key length: ${decodedSecretKey.length}`);
    }

    // Create shared key using recipient's secret key and sender's ephemeral public key
    const sharedKey = box.before(decodedEphemeralPublicKey, decodedSecretKey);
    
    // Decrypt the message
    const decryptedMessage = box.open.after(decodedEncrypted, decodedNonce, sharedKey);
    
    if (!decryptedMessage) {
      throw new Error('Decryption failed: box.open.after returned null');
    }

    const result = encodeUTF8(decryptedMessage);
    console.log('Decryption successful, message length:', result.length);
    return result;
  } catch (error) {
    console.error('Decryption error:', {
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
};

export const storeKeys = (publicKey, secretKey) => {
  if (!publicKey || !secretKey) {
    throw new Error('Both public and secret keys are required');
  }
  
  // Validate key formats
  try {
    const decodedPublic = decodeBase64(publicKey);
    const decodedSecret = decodeBase64(secretKey);
    
    if (decodedPublic.length !== box.publicKeyLength || decodedSecret.length !== box.secretKeyLength) {
      throw new Error('Invalid key lengths');
    }
  } catch (error) {
    throw new Error('Invalid key format');
  }

  localStorage.setItem('publicKey', publicKey);
  localStorage.setItem('secretKey', secretKey);
};

export const getStoredKeys = () => ({
  publicKey: localStorage.getItem('publicKey'),
  secretKey: localStorage.getItem('secretKey')
});
